import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { expectNothingLoading, horizontalOverflow, saveScreenshot } from "./support/page";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const SECTIONS = [
  ["", "Allgemein", "general"],
  ["?section=notifications", "Benachrichtigungen", "notifications"],
  ["?section=account", "Konto", "account"],
] as const;
type SectionSlug = (typeof SECTIONS)[number][2];
const MIN_HIT_TARGET_PX = 44;
// The mobile layout has 16 px gutters: a 512 px viewport gives the .settings container 480 px.
const SEG_EDGE_VIEWPORT = { width: 512, height: 812 };
const SEG_MIN_CONTAINER_PX = 480;
const SEG_COLUMNS = 3;

const subNav = (page: Page) => page.getByRole("navigation", { name: "Einstellungsbereiche" });

/** Preflight ruling 18: a clipped label leaves the page width alone, so each link is measured. */
function clippedSubNavLinks(page: Page): Promise<string[]> {
  return subNav(page)
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .filter((link) => link.scrollWidth > link.clientWidth)
        .map((link) => link.textContent ?? ""),
    );
}

/** Distinct left edges of the sub-nav links: 3 for the seg row, 1 for the stacked column. */
async function subNavColumns(page: Page): Promise<number> {
  const lefts = await subNav(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().left)));
  return new Set(lefts).size;
}

async function subNavLinkHeights(page: Page): Promise<number[]> {
  const boxes = await Promise.all(
    (await subNav(page).getByRole("link").all()).map((link) => link.boundingBox()),
  );
  return boxes.map((box) => box?.height ?? 0);
}

/** Before the screenshots: every block below the h2 has loaded, the last one included. */
async function expectSectionLoaded(page: Page, slug: SectionSlug): Promise<void> {
  await expectNothingLoading(page);
  if (slug !== "notifications") return;
  await expect(page.getByRole("button", { name: "SMTP ändern" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pro Quelle" }).getByRole("link")).toBeVisible();
}

test("the sub-nav switches sections and Back walks them", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.goto("/settings");
  await subNav(page).getByRole("link", { name: "Konto" }).click();
  await expect(page).toHaveURL(/\/settings\?section=account$/);
  await expect(page.getByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "Allgemein" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goForward();
  await expect(page.getByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
});

test("focus stays on the clicked sub-nav link", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.goto("/settings");
  const link = subNav(page).getByRole("link", { name: "Benachrichtigungen" });
  await link.click();
  await expect(page.getByRole("heading", { level: 2, name: "Benachrichtigungen" })).toBeVisible();
  await expect(link).toBeFocused();
});

// Usability #20 (D11): Abmelden sits in the user menu, in the same panel as the link into Konto.
test("the user menu holds Abmelden and its Konto link opens Konto", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await page.getByRole("button", { name: /admin/ }).click();
  const menu = page.getByRole("dialog", { name: "Benutzermenü" });
  await expect(menu.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await menu.getByRole("link", { name: "Konto" }).click();
  await expect(page).toHaveURL(/\/settings\?section=account$/);
  await expect(page.getByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
});

test("an unknown section shows Allgemein and keeps the URL", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.goto("/settings?section=passwoerter");
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "Allgemein" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(/\/settings\?section=passwoerter$/);
});

// The sidebar keeps Einstellungen apart from the main navigation, below it (Sidebar.tsx).
test("the sidebar's Einstellungen link is active", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/settings?section=notifications");
  const sidebar = page.getByRole("complementary", { name: "Seitenleiste" });
  await expect(sidebar.getByRole("link", { name: "Einstellungen" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

// Review M8: on desktop .btn-icon is --ctl-h wide, so the dialog's X needs the 44 px width too.
test("a settings dialog's close button is a 44 px target on desktop", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/settings?section=account");
  await page.getByRole("button", { name: "Alle Stellen archivieren" }).click();
  const dialog = page.getByRole("dialog", { name: "Alle Stellen archivieren" });
  const close = await dialog.getByRole("button", { name: "Schließen" }).boundingBox();
  expect(close!.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(close!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

// Review M2: just above the stack breakpoint (a 480 px container) the seg has three columns.
test("the three-column seg clips no label at a 480 px column", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(SEG_EDGE_VIEWPORT);
  await page.goto("/settings?section=notifications");
  await expect(page.getByRole("heading", { level: 2, name: "Benachrichtigungen" })).toBeVisible();
  const settings = await page.locator(".settings").boundingBox();
  expect(settings!.width).toBeGreaterThanOrEqual(SEG_MIN_CONTAINER_PX);
  expect(await subNavColumns(page)).toBe(SEG_COLUMNS);
  expect(await clippedSubNavLinks(page)).toEqual([]);
});

for (const [query, title, slug] of SECTIONS) {
  test(`${title}: no horizontal scroll or clipped label at 375 px, screenshots`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(settingsRoutes(new SettingsServer()));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(`/settings${query}`);
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    expect(await clippedSubNavLinks(page)).toEqual([]);
    expect(Math.min(...(await subNavLinkHeights(page)))).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    await expectSectionLoaded(page, slug);
    for (const [size, viewport] of SCREENSHOT_SIZES) {
      for (const scheme of COLOR_SCHEMES) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.mouse.move(0, 0);
        expect(await horizontalOverflow(page)).toBe(0);
        expect(await clippedSubNavLinks(page)).toEqual([]);
        await saveScreenshot(page, `settings-${slug}-${size}-${scheme}`);
      }
    }
  });
}
