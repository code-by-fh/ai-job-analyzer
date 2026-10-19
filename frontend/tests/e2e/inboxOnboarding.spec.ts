import type { SetupStatusBody } from "../../src/api/setup";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { SETUP_DONE } from "./support/fixtures";
import { inboxRoutes } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const FIRST_RUN: SetupStatusBody = {
  has_source: false,
  ai_configured: false,
  profile_complete: false,
  has_jobs: false,
};
const AI_MISSING = "Kein KI-Anbieter eingerichtet: Neue Stellen werden nicht bewertet.";
const OPEN_IMPORT = "Per URL importieren: eine einzelne Stelle";
const setupRoute = (status: SetupStatusBody) => ({ "GET /setup-status": { body: status } });
// A first run has no source, so the shell's platform list (and its error badge) is empty too.
const firstRunRoutes = (status: SetupStatusBody) =>
  inboxRoutes({ new: [] }, { ...setupRoute(status), "GET /platforms": { body: [] } });

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the first run shows the onboarding at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(firstRunRoutes(FIRST_RUN));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(
        page.getByRole("heading", { level: 1, name: "Willkommen, admin" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Profil öffnen" })).toHaveClass(/btn-primary/);
      await expect(page.getByRole("button", { name: "Quelle hinzufügen" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByText("Zuerst das Profil ausfüllen.")).toBeVisible();
      await expect(page.getByRole("link", { name: "KI-Anbieter einrichten" })).toHaveAttribute(
        "href",
        "/settings?section=ai",
      );
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-onboarding-${size}-${scheme}`);
    });
  }
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`jobs but no AI provider: inbox with a warning at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(inboxRoutes({}, setupRoute({ ...SETUP_DONE, ai_configured: false })));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
      await expect(page.getByText(AI_MISSING)).toBeVisible();
      await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-ai-missing-${size}-${scheme}`);
    });
  }
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`with an AI provider the onboarding has no import by URL at ${size}px`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(firstRunRoutes({ ...FIRST_RUN, profile_complete: true, ai_configured: true }));
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: OPEN_IMPORT })).toHaveCount(0);
    // Feedback 1 T9: the step's button is centred in its row.
    const item = page.locator(".ob-item").nth(1);
    const row = (await item.boundingBox())!;
    const button = (await item.getByRole("link", { name: "Quelle hinzufügen" }).boundingBox())!;
    if (size === "1440") {
      expect(Math.abs(button.y + button.height / 2 - (row.y + row.height / 2))).toBeLessThanOrEqual(
        1,
      );
    }
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-onboarding-ai-${size}-light`);
  });
}

test("the setup view opens on request for a finished setup and can be left again", async ({
  page,
  mockApi,
}) => {
  await mockApi(inboxRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: "Ersteinrichtung ansehen" })).toHaveCount(0);
  await page.goto("/inbox?view=setup");
  await expect(page.getByText("3 von 3 erledigt", { exact: false })).toBeVisible();
  await saveScreenshot(page, "inbox-onboarding-done-1440-light");
  const entries = () => page.evaluate(() => window.history.length);
  const before = await entries();
  await page.getByRole("link", { name: "Zum Eingang" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
  // Decision D1: both ways replace the entry, so Back leaves the inbox.
  expect(await entries()).toBe(before);
});
