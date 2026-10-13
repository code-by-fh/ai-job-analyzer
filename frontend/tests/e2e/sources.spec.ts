import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const SERVER_ERROR = 500;

test.beforeEach(async ({ page }) => fixNow(page));

const list = (page: Page) => page.getByRole("list", { name: "Deine Quellen" });

async function open(page: Page, query = "") {
  await page.goto(`/sources${query}`);
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Quellen lists the sources at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await expect(page.getByRole("heading", { level: 1, name: "Quellen" })).toBeVisible();
      await expect(page.locator(".sources .mast-deck")).toHaveText("2 Quellen, 1 mit Fehler.");
      await expect(list(page).getByRole("link")).toHaveText(["Indeed", "StepStone"]);
      await expect(list(page).getByRole("listitem").nth(1)).toContainText("Läuft");
      await expect(
        page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar, gestern 08:00$/ }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-${size}-${scheme}`);
    });
  }
}

test("no horizontal scroll at 375 px and 44 px row links", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await open(page);
  expect(await horizontalOverflow(page)).toBe(0);
  const box = await list(page).getByRole("link", { name: "Indeed" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  const banner = await page
    .getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ })
    .boundingBox();
  expect(banner!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  // D11: the stacked row names its lines, since the column head is hidden.
  await expect(list(page).getByRole("listitem").first().getByText("Zeitplan:")).toBeVisible();
});

test("the banner opens the failing source", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await open(page);
  await page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ }).click();
  await expect(page).toHaveURL(/\/sources\?quelle=2$/);
});

test("an unknown source id is dropped from the URL", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await open(page, "?quelle=999");
  await expect(page).toHaveURL(/\/sources$/);
});

test("without sources the page offers the first one", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes(new SourcesServer([], [])));
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Erste Quelle hinzufügen" })).toBeVisible();
  await expect(page.locator(".sources .mast-deck")).toHaveText("Noch keine Quelle.");
});

test.describe("a failing list", () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test("shows the error with a retry", async ({ page, mockApi }) => {
    await mockApi(
      sourcesRoutes(undefined, {
        "GET /platforms": { status: SERVER_ERROR, body: { detail: "boom" } },
      }),
    );
    await page.goto("/sources");
    await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await expect(page.getByText("boom")).toHaveCount(0);
  });
});
