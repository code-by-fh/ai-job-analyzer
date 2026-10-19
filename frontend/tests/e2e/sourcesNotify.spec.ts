import type { Locator, Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { PUSHOVER_CHANNEL, SMTP_CHANNEL } from "./support/notificationFixtures";
import { NotificationServer } from "./support/notificationServer";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE, TEMPLATES } from "./support/platformFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const RECIPIENT = "ich@example.com";

test.beforeEach(async ({ page }) => fixNow(page));

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const heightOf = async (target: Locator) => (await target.boundingBox())!.height;
const notify = (page: Page) => drawer(page).getByRole("form", { name: "Benachrichtigungen" });

/** The SMTP channel on with a recipient and the global template, as the shots and the save show it. */
async function chooseSmtp(page: Page): Promise<void> {
  await notify(page).getByLabel("Firmen-SMTP benachrichtigen").check();
  await notify(page).getByLabel("Empfänger für E-Mail (SMTP)").fill(RECIPIENT);
  await notify(page)
    .getByLabel("Vorlage für E-Mail (SMTP)")
    .selectOption({ label: "Wochenmail (global)" });
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the notifications show per channel at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/sources?quelle=${STEPSTONE.id}`);
      await chooseSmtp(page);
      // The section's foot in view (on a phone the section is taller than the screen), no field
      // focused, so the shot shows the resting state.
      await notify(page).getByRole("button", { name: "Speichern" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      expect(await horizontalOverflow(page)).toBe(0);
      await drawer(page).evaluate((panel) =>
        Promise.all(panel.getAnimations().map((animation) => animation.finished)),
      );
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-notify-${size}-${scheme}`);
    });
  }
}

test("the SMTP channel with a recipient and the global template is saved by id, then tested", async ({
  page,
  mockApi,
}) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await chooseSmtp(page);
  await notify(page).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  const stored = server.get(STEPSTONE.id);
  expect(stored.smtp_template).toBe(TEMPLATES[1]!.content);
  expect(stored.smtp_recipients).toEqual([RECIPIENT]);
  expect(stored.notification_channel_ids).toEqual([PUSHOVER_CHANNEL.id, SMTP_CHANNEL.id]);
  await expect(
    notify(page)
      .getByText("Der Test geht an die Empfänger des Kanals, nicht an die Empfänger dieser Quelle.")
      .first(),
  ).toBeVisible();
  await notify(page).getByRole("button", { name: "Test über Firmen-SMTP senden" }).click();
  await expect(page.getByText("Test über Firmen-SMTP gesendet.")).toBeVisible();
  expect(server.notifications.tests).toEqual([{ channelId: SMTP_CHANNEL.id }]);
});

test("without channels the drawer points to the settings", async ({ page, mockApi }) => {
  const settings = new SettingsServer(undefined, new NotificationServer([]));
  await mockApi(sourcesRoutes(new SourcesServer(), settingsRoutes(settings, {}, {})));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await expect(notify(page).getByText(/Noch kein Kanal eingerichtet/)).toBeVisible();
  await expect(
    notify(page).getByRole("link", { name: "In den Einstellungen einrichten" }),
  ).toHaveAttribute("href", "/settings?section=notifications");
});

test("a phone gets 44 px test buttons, checks and links and no sideways scroll", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const testSend = notify(page).getByRole("button", { name: "Test über Mein Handy senden" });
  await testSend.scrollIntoViewIfNeeded();
  await drawer(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  const check = notify(page).locator("label.check", { hasText: "Firmen-SMTP benachrichtigen" });
  const manage = notify(page).getByRole("link", { name: "Kanäle in den Einstellungen verwalten" });
  expect(await heightOf(testSend)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  // The label is the check's hit area (ui .check).
  expect(await heightOf(check)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await heightOf(manage)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await horizontalOverflow(page)).toBe(0);
});
