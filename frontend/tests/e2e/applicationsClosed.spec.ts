import type { Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { ACTIVE_ITEMS, applicationsRoutes, CLOSED_ITEMS } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const CLOSED_ROWS_KEY = `GET ${applicationsListPath({ group: "closed", q: "" }, 0)}`;
const CLOSED_TOTAL_PATH = applicationsListPath({ group: "closed", q: "" }, 0, 1);
const MIN_HIT_TARGET_PX = 44;
const SMALLEST_PHONE = { width: 320, height: 640 };
// The placeholder and the strip may differ by sub-pixel rounding only.
const HEIGHT_TOLERANCE_PX = 2;
const LONG_COMPANY = "Donaudampfschifffahrtselektrizitaetenhauptbetriebswerkbauunt";
// Widths where five strip columns are narrow: no label may break inside a word there.
const TABLET_WIDTHS = [768, 900, 960] as const;
const TABLET_HEIGHT = 900;

test.beforeEach(async ({ page }) => fixNow(page));

const toggle = (page: Page) => page.getByRole("button", { name: "Abgeschlossen (2)" });
const closed = (page: Page) => page.getByRole("region", { name: "Abgeschlossen" });
const strip = (page: Page) => page.getByRole("group", { name: "Phasen" });
const closedStripButton = (page: Page) =>
  strip(page).getByRole("button", { name: /^Abgeschlossen/ });

async function expectOutcomes(page: Page) {
  const rows = closed(page).getByRole("listitem");
  await expect(rows.locator(".arow-link")).toHaveText(["Lead Developer", "Engineering Manager"]);
  await expect(rows.nth(0)).toContainText("Abgesagt");
  await expect(rows.nth(0)).toContainText("01.10.2026");
  await expect(rows.nth(1)).toContainText("Zusage angenommen");
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Abgeschlossen opens with its outcomes at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const log = await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      expect(log.requests).not.toContain(CLOSED_ROWS_KEY);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `applications-closed-collapsed-${size}-${scheme}`);
      await toggle(page).click();
      await expect(page).toHaveURL(/\?abgeschlossen=1$/);
      await expect(toggle(page)).toBeFocused();
      await expect.poll(() => log.requests).toContain(CLOSED_ROWS_KEY);
      await expectOutcomes(page);
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `applications-closed-open-${size}-${scheme}`);
    });

    test(`the closed filter shows the outcomes at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await closedStripButton(page).click();
      await expect(page).toHaveURL(/\?phase=abgeschlossen$/);
      await expectOutcomes(page);
      await expect(toggle(page)).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Beworben" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Weitere laden" })).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `applications-closed-filter-${size}-${scheme}`);
    });
  }
}

test("a deep link opens Abgeschlossen", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?abgeschlossen=1");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
});

test("the closed filter shows the outcomes whatever ?abgeschlossen says", async ({
  page,
  mockApi,
}) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications");
  await closedStripButton(page).click();
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
  await closedStripButton(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(closed(page)).toHaveCount(0);
});

test("the closed toggle is a 44 px hit target on a phone", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/applications");
  const box = (await toggle(page).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

for (const scheme of COLOR_SCHEMES) {
  test(`every strip label fits its button at 320 px in ${scheme} mode`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(applicationsRoutes());
    await page.setViewportSize(SMALLEST_PHONE);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/applications");
    await expect(closedStripButton(page)).toBeVisible();
    const spills = await strip(page)
      .getByRole("button")
      .evaluateAll(
        (buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth).length,
      );
    expect(spills).toBe(0);
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `applications-strip-320-${scheme}`);
  });
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`the strip keeps its height at ${size}px while the counts load`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(applicationsRoutes());
    let answer = () => {};
    const held = new Promise<void>((resolve) => (answer = resolve));
    await page.route(
      (url) => url.href.endsWith(CLOSED_TOTAL_PATH),
      async (route) => {
        await held;
        await route.fallback();
      },
    );
    await page.setViewportSize(viewport);
    await page.goto("/applications");
    await expect(page.locator(".strip-pending")).toBeVisible();
    const pending = (await page.locator(".strip-pending").boundingBox())!;
    answer();
    await expect(closedStripButton(page)).toBeVisible();
    const ready = (await strip(page).boundingBox())!;
    expect(Math.abs(ready.height - pending.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);
  });
}

/** Line boxes of each strip label: one line each, or the label broke inside its single word. */
function labelLines(page: Page): Promise<number[]> {
  return page.locator(".strip-head > span:last-child").evaluateAll((labels) =>
    labels.map((label) => {
      const range = document.createRange();
      range.selectNodeContents(label);
      return range.getClientRects().length;
    }),
  );
}

for (const width of TABLET_WIDTHS) {
  test(`no strip label breaks inside its word at ${width}px`, async ({ page, mockApi }) => {
    await mockApi(applicationsRoutes());
    await page.setViewportSize({ width, height: TABLET_HEIGHT });
    await page.goto("/applications");
    await expect(closedStripButton(page)).toBeVisible();
    expect(await labelLines(page)).toEqual([1, 1, 1, 1, 1]);
    const spills = await strip(page)
      .getByRole("button")
      .evaluateAll(
        (buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth).length,
      );
    expect(spills).toBe(0);
  });
}

test("a long unbroken company name wraps in active and closed rows on a phone", async ({
  page,
  mockApi,
}) => {
  const long = { company: LONG_COMPANY };
  await mockApi(
    applicationsRoutes({
      active: [{ ...ACTIVE_ITEMS[0]!, ...long }, ...ACTIVE_ITEMS.slice(1)],
      closed: [{ ...CLOSED_ITEMS[0]!, ...long }, ...CLOSED_ITEMS.slice(1)],
    }),
  );
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/applications?abgeschlossen=1");
  await expect(page.getByText(LONG_COMPANY)).toHaveCount(2);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("the busy bar is a static partial segment when motion is reduced", async ({
  page,
  mockApi,
}) => {
  await mockApi(applicationsRoutes({ searches: { lead: { active: [], closed: [] } } }));
  await page.route(
    (url) => url.searchParams.get("q") === "lead",
    () => {},
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(SCREENSHOT_SIZES[0]![1]);
  await page.goto("/applications?phase=abgeschlossen");
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("searchbox").fill("lead");
  const busy = page.locator('.apps-closed[aria-busy="true"]');
  await expect(busy).toHaveCount(1);
  const bar = await busy.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { size: style.backgroundSize, animation: style.animationName };
  });
  expect(bar).toEqual({ size: "30% 100%", animation: "none" });
  await page.mouse.move(0, 0);
  await saveScreenshot(page, "applications-closed-busy-reduced-1440-light");
});

test("the closed rows under the toggle draw no second busy bar", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ searches: { lead: { active: [], closed: [] } } }));
  await page.route(
    (url) => url.searchParams.get("q") === "lead",
    () => {},
  );
  await page.goto("/applications?abgeschlossen=1");
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("searchbox").fill("lead");
  await expect(page.locator('.apps-sections[aria-busy="true"]')).toHaveCount(1);
  const content = await page
    .locator('.apps-closed[aria-busy="true"]')
    .evaluate((element) => getComputedStyle(element, "::before").content);
  expect(content).toBe("none");
});
