import type { Locator, Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE, TEMPLATES } from "./support/platformFixtures";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const RECIPIENT = "ich@example.com";

test.beforeEach(async ({ page }) => fixNow(page));

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const heightOf = async (target: Locator) => (await target.boundingBox())!.height;
const notify = (page: Page) => drawer(page).getByRole("form", { name: "Benachrichtigungen" });

/** SMTP on with a recipient and the global template, as the screenshots and the save show it. */
async function chooseSmtp(page: Page): Promise<void> {
  await notify(page).getByLabel("SMTP benachrichtigen").check();
  await notify(page).getByLabel("Empfänger").fill(RECIPIENT);
  await notify(page).getByLabel("Vorlage für SMTP").selectOption({ label: "Wochenmail (global)" });
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

test("SMTP with a recipient and the global template is saved as content, then tested", async ({
  page,
  mockApi,
}) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await chooseSmtp(page);
  const testSend = notify(page).getByRole("button", { name: "Test über SMTP senden" });
  await expect(testSend).toHaveAttribute("aria-disabled", "true");
  await expect(testSend).toHaveAccessibleDescription("Erst speichern.");
  await notify(page).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect(server.get(STEPSTONE.id).smtp_template).toBe(TEMPLATES[1]!.content);
  expect(server.get(STEPSTONE.id).smtp_recipients).toEqual([RECIPIENT]);
  expect(server.get(STEPSTONE.id).notification_adapters).toEqual(["PUSHOVER", "SMTP"]);
  await expect(testSend).not.toHaveAttribute("aria-disabled", "true");
  await testSend.click();
  await expect(page.getByText("Test über SMTP gesendet.")).toBeVisible();
});

test("Mailjet without credentials points to the settings", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await expect(notify(page).getByLabel("Mailjet benachrichtigen")).toBeDisabled();
  await expect(
    notify(page).getByRole("link", { name: "In den Einstellungen einrichten" }).first(),
  ).toHaveAttribute("href", "/settings?section=notifications");
});

test("a phone gets 44 px test buttons, checks and setup links and no sideways scroll", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const testSend = notify(page).getByRole("button", { name: "Test über Pushover senden" });
  await testSend.scrollIntoViewIfNeeded();
  await drawer(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  const check = notify(page).locator("label.check", { hasText: "SMTP benachrichtigen" });
  const setup = notify(page).getByRole("link", { name: "In den Einstellungen einrichten" }).first();
  expect(await heightOf(testSend)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  // The label is the check's hit area (ui .check).
  expect(await heightOf(check)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await heightOf(setup)).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await horizontalOverflow(page)).toBe(0);
});
