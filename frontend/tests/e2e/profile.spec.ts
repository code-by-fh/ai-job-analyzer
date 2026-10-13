import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

const SECTIONS = [
  ["ziel", "Ziel"],
  ["lebenslauf", "Lebenslauf"],
  ["nachweise", "Nachweise"],
  ["vorlagen", "Vorlagen"],
] as const;

const MIN_HIT_TARGET_PX = 44;

const subNav = (page: Page) => page.getByRole("navigation", { name: "Profilbereiche" });

test("the sub-nav switches sections and Back walks them", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  await subNav(page).getByRole("link", { name: "Vorlagen" }).click();
  await expect(page).toHaveURL(/\/profile\?section=vorlagen$/);
  await expect(page.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "Ziel" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goForward();
  await expect(page).toHaveURL(/\/profile\?section=vorlagen$/);
  await expect(page.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeVisible();
});

test("focus stays on the clicked sub-nav link", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  const link = subNav(page).getByRole("link", { name: "Nachweise" });
  await link.click();
  await expect(page.getByRole("heading", { level: 2, name: "Nachweise" })).toBeVisible();
  await expect(link).toBeFocused();
});

test("an unknown section shows Ziel and keeps the URL", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile?section=passwoerter");
  await expect(page.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "Ziel" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(/\/profile\?section=passwoerter$/);
});

test("the profile nav item is active", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/profile?section=nachweise");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Profil/ })).toHaveAttribute("aria-current", "page");
});

for (const [section, title] of SECTIONS) {
  test(`${title}: no horizontal scroll at 375 px, screenshots`, async ({ page, mockApi }) => {
    await mockApi(profileRoutes(new ProfileServer()));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(`/profile?section=${section}`);
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    const link = await subNav(page).getByRole("link", { name: title }).boundingBox();
    expect(link!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    for (const [size, viewport] of SCREENSHOT_SIZES) {
      for (const scheme of COLOR_SCHEMES) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.mouse.move(0, 0);
        await saveScreenshot(page, `profile-${section}-${size}-${scheme}`);
      }
    }
  });
}
