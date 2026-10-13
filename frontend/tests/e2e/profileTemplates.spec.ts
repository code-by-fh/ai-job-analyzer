import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, SANDBOX_PROBE, test } from "./support/test";

test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

const MIN_HIT_TARGET_PX = 44;
const DEFAULT_LINE = "Standard für neue Bewerbungen";
// Fixture template 8: an own CV template whose AI fill was rejected; it stays selectable.
const OWN = "lebenslauf_2025";

const cvGallery = (page: Page) => page.getByRole("region", { name: "Lebenslauf" });
const cardOf = (page: Page, name: string) =>
  cvGallery(page).getByRole("listitem").filter({ hasText: name });

async function screenshots(page: Page, name: string): Promise<void> {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `${name}-${size}-${scheme}`);
    }
  }
}

test("make a template the default, reload, delete it, and the bundled one is the default again", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  const own = cardOf(page, OWN);
  await own.getByRole("button", { name: "Als Standard" }).click();
  await expect(page.getByText(`„${OWN}“ ist jetzt Standard für neue Bewerbungen.`)).toBeVisible();
  await expect(own.getByRole("button", { name: `Vorschau von ${OWN}` })).toBeFocused();
  expect(server.profile.cv_template).toBe("8");
  await page.reload();
  await expect(own).toContainText(DEFAULT_LINE);
  await own.getByRole("button", { name: `${OWN} löschen` }).click();
  const dialog = page.getByRole("dialog", { name: "Vorlage löschen?" });
  await expect(dialog).toContainText("Danach wird „Klassisch“ verwendet.");
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(own).toHaveCount(0);
  await expect(cardOf(page, "Klassisch")).toContainText(DEFAULT_LINE);
  await expect(page.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeFocused();
  expect(server.profile.cv_template).toBeNull();
});

// The editor CSP blocks the hostile render's remote image: the browser logs exactly that block.
const CSP_IMAGE_BLOCK =
  /^Loading the image 'http:\/\/localhost:\d+\/x' violates the following Content Security Policy directive: "img-src data: blob:"\. The action has been blocked\.$/;

test.describe("a hostile render", () => {
  // Tuple form: Playwright would read a bare [RegExp, RegExp] as [value, fixture options].
  test.use({ allowedConsoleErrors: [[SANDBOX_PROBE, CSP_IMAGE_BLOCK], { scope: "test" }] });

  test("a script in the preview never runs", async ({ page, mockApi }) => {
    const server = new ProfileServer();
    server.hostilePreview = true;
    await mockApi(profileRoutes(server));
    await page.goto("/profile?section=vorlagen");
    await cvGallery(page).getByRole("button", { name: "Vorschau von Klassisch" }).click();
    const frame = page.locator("iframe[title='Vorschau von Klassisch']");
    await expect(frame).toHaveAttribute("sandbox", "");
    await expect(
      page.frameLocator("iframe[title='Vorschau von Klassisch']").getByRole("heading", {
        name: "Jonas Weber",
      }),
    ).toBeVisible();
    expect(await page.title()).not.toBe("pwned");
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test("card buttons are touch targets on mobile", async ({ page, mockApi }) => {
  await mockApi(profileRoutes(new ProfileServer()));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/profile?section=vorlagen");
  for (const button of await cardOf(page, OWN).getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
  expect(await horizontalOverflow(page)).toBe(0);
});

test("Vorlagen gallery, preview and delete dialog: screenshots", async ({ page, mockApi }) => {
  await mockApi(profileRoutes(new ProfileServer()));
  await page.goto("/profile?section=vorlagen");
  await expect(cardOf(page, OWN)).toBeVisible();
  await screenshots(page, "profile-templates");
  await cvGallery(page).getByRole("button", { name: "Vorschau von Klassisch" }).click();
  await expect(
    page.frameLocator("iframe[title='Vorschau von Klassisch']").getByRole("heading", {
      name: "Jonas Weber",
    }),
  ).toBeVisible();
  await screenshots(page, "profile-templates-preview");
  await page.keyboard.press("Escape");
  await cardOf(page, OWN)
    .getByRole("button", { name: `${OWN} löschen` })
    .click();
  await expect(page.getByRole("dialog", { name: "Vorlage löschen?" })).toBeVisible();
  await screenshots(page, "profile-templates-delete");
});
