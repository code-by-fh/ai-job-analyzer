import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, VIEWPORTS } from "./support/constants";
import { inboxRoutes, listRoutes, NEW_ITEMS } from "./support/inboxFixtures";
import { fixNow, UPDATED } from "./support/jobFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const preview = (page: Page) => page.getByRole("complementary", { name: "Vorschau" });
const previewTitle = (page: Page) => preview(page).getByRole("heading", { level: 2 });
// Row and pane buttons share names (R16(3)); the pane's second action is Aussortieren.
const paneDismiss = (page: Page) => preview(page).locator(".ip-actions button").nth(1);
const WIDTHS = [
  ["1280", { width: 1280, height: 800 }],
  ["1440", VIEWPORTS.desktop],
] as const;
// The edge fade of the tab strip (--edge-fade in layout.css); a count inside it is half hidden.
const FADE_PX = 16;

/** The tab's count lies within the strip and outside its faded edges. */
async function expectCountUnfaded(page: Page, index: number): Promise<void> {
  const strip = await page.getByRole("tablist").boundingBox();
  const tab = page.getByRole("tab").nth(index);
  const count = await tab.locator(".count-badge, .count-plain").boundingBox();
  expect(count!.x).toBeGreaterThanOrEqual(strip!.x + FADE_PX);
  expect(count!.x + count!.width).toBeLessThanOrEqual(strip!.x + strip!.width - FADE_PX);
}

// The narrowest layout with the pane (WIDE_INBOX_QUERY).
const PANE_FROM = { width: 1200, height: 900 };

test.beforeEach(async ({ page }) => {
  await fixNow(page);
  await page.setViewportSize(VIEWPORTS.desktop);
});

// Preflight ruling 16: the pane exists only from 1200 px, so 1440 only, in both schemes.
for (const scheme of COLOR_SCHEMES) {
  test(`the preview pane shows the first match at 1440px in ${scheme} mode`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(inboxRoutes());
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/inbox");
    await expect(previewTitle(page)).toHaveText("Senior Kotlin Engineer");
    await expect(preview(page).getByRole("heading", { name: /Passt/ })).toBeVisible();
    await expect(preview(page).getByRole("link", { name: "Ganze Seite öffnen" })).toHaveAttribute(
      "href",
      "/jobs/job-1",
    );
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-preview-1440-${scheme}`);
  });
}

test("clicking a row selects it in the URL", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox");
  await page.getByRole("link", { name: "Backend Engineer (Java)" }).click();
  await expect(page).toHaveURL(/\/inbox\?job=job-2$/);
  await expect(previewTitle(page)).toHaveText("Backend Engineer (Java)");
});

test("a stale deep link falls back to the first row", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox?job=gone");
  await expect(previewTitle(page)).toHaveText("Senior Kotlin Engineer");
});

test("sorting out the shown job moves the preview to the next one", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-1": UPDATED });
  await mockApi(routes);
  await page.goto("/inbox?job=job-1");
  const dismiss = paneDismiss(page);
  await expect(dismiss).toHaveAccessibleName("Aussortieren: Senior Kotlin Engineer");
  await expect(dismiss).toBeVisible();
  setRoutes(routes, listRoutes({ new: NEW_ITEMS.slice(1) }));
  await dismiss.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/inbox\?job=job-2$/);
  await expect(previewTitle(page)).toHaveText("Backend Engineer (Java)");
  await expect(dismiss).toBeFocused();
  await expect(dismiss).toHaveAccessibleName("Aussortieren: Backend Engineer (Java)");
});

test("the pane fits at exactly 1200px", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.setViewportSize(PANE_FROM);
  await page.goto("/inbox");
  await expect(previewTitle(page)).toHaveText("Senior Kotlin Engineer");
  expect(await horizontalOverflow(page)).toBe(0);
  await saveScreenshot(page, "inbox-preview-1200-light");
});

for (const [size, viewport] of WIDTHS) {
  test(`every tab count is fully visible in the list column at ${size}px`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(inboxRoutes());
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    await expect(page.getByRole("tab").nth(2)).toContainText("1");
    await expectCountUnfaded(page, 0);
    await expectCountUnfaded(page, 1);
    await expectCountUnfaded(page, 2);
  });
}
