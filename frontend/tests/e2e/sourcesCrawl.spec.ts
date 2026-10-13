import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { INDEED, RUNNING_CRAWL, STEPSTONE } from "./support/platformFixtures";
import { finishCrawl, SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const CANCEL_PATH = "POST /scraper/cancel-crawl";

test.beforeEach(async ({ page }) => fixNow(page));

const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });
const startButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name} jetzt durchsuchen` });
const cancelButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Durchsuchen von ${name} abbrechen` });
const cancelBody = (log: ApiLog) => log.calls.find((call) => call.key === CANCEL_PATH)?.body;

async function openWithSocket(page: Page, log: ApiLog) {
  await page.goto("/sources");
  await expect(row(page, "Indeed")).toBeVisible();
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Durchsuchen shows live progress in the row at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const server = new SourcesServer();
      const log = await mockApi(sourcesRoutes(server));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openWithSocket(page, log);
      await startButton(page, "Indeed").click();
      await expect(row(page, "Indeed")).toContainText("Startet …");
      const crawlId = server.running.get(INDEED.id)!.id;
      pushEvent(log, {
        type: "crawl_job_progress",
        job_id: crawlId,
        platform: INDEED.url,
        total: 8,
        scraping_completed: 3,
      });
      await expect(row(page, "Indeed")).toContainText("Links sammeln: 3 von 8");
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-crawl-${size}-${scheme}`);
      finishCrawl(log, server, {
        platformId: INDEED.id,
        type: "crawl_job_completed",
        lastRun: { finished_at: "2026-10-08T08:00:00+00:00", found: 8, new: 2, matched: 1 },
      });
      await expect(row(page, "Indeed")).toContainText("8 gefunden, 1 passend, 1 unter Schwellwert");
      await expect(page.locator(".src-live")).toHaveText("Indeed: Durchsuchen fertig.");
      await expect(
        page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ }),
      ).toHaveCount(0);
    });

    test(`Abbrechen stops the crawl and hands focus to Durchsuchen at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const log = await mockApi(sourcesRoutes(new SourcesServer()));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openWithSocket(page, log);
      await row(page, "StepStone")
        .getByRole("button", { name: "Durchsuchen von StepStone abbrechen" })
        .click();
      await expect.poll(() => cancelBody(log)).toEqual({ job_id: RUNNING_CRAWL.job_id });
      // Busy until the scraper's event arrives, so a second click cannot send a second cancel.
      await expect(cancelButton(page, "StepStone")).toHaveAttribute("aria-busy", "true");
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-cancel-${size}-${scheme}`);
      pushEvent(log, { type: "crawl_job_cancelled", job_id: RUNNING_CRAWL.job_id });
      await expect(row(page, "StepStone")).toContainText("abgebrochen");
      await expect(startButton(page, "StepStone")).toBeFocused();
    });
  }
}

test("a double click starts one crawl and never cancels it", async ({ page, mockApi }) => {
  const log = await mockApi(sourcesRoutes());
  await openWithSocket(page, log);
  await startButton(page, "Indeed").dblclick();
  await expect(row(page, "Indeed")).toContainText("Startet …");
  // Preflight ruling 17: count once the start settled.
  await expect(startButton(page, "Indeed")).not.toHaveAttribute("aria-busy", "true");
  expect(log.requests.filter((key) => key === `POST /platforms/${INDEED.id}/crawl`)).toHaveLength(
    1,
  );
  expect(log.requests).not.toContain(CANCEL_PATH);
});

test("a scheduled crawl shows its progress in the row", async ({ page, mockApi }) => {
  const log = await mockApi(sourcesRoutes());
  await openWithSocket(page, log);
  pushEvent(log, {
    type: "crawl_job_started",
    job_id: "sched-1",
    platform: INDEED.url,
    platform_id: INDEED.id,
  });
  await expect(row(page, "Indeed")).toContainText("Startet …");
  await expect(row(page, "Indeed")).toContainText("Läuft");
  await expect(startButton(page, "Indeed")).toHaveAttribute("aria-disabled", "true");
});

test("a cancel is no error and is announced once it ended", async ({ page, mockApi }) => {
  const log = await mockApi(sourcesRoutes(new SourcesServer()));
  await openWithSocket(page, log);
  await cancelButton(page, STEPSTONE.name).click();
  await expect.poll(() => cancelBody(log)).toEqual({ job_id: RUNNING_CRAWL.job_id });
  pushEvent(log, { type: "crawl_job_cancelled", job_id: RUNNING_CRAWL.job_id });
  await expect(row(page, "StepStone")).toContainText("abgebrochen");
  await expect(page.locator(".src-live")).toHaveText("StepStone: Durchsuchen abgebrochen.");
  // Only Indeed's unreachable run counts as an error (D3).
  await expect(
    page.getByRole("navigation", { name: "Hauptnavigation" }).getByText("1 Fehler"),
  ).toHaveCount(1);
});

test("Abbrechen is a 44 px target on a phone", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/sources");
  const box = await cancelButton(page, "StepStone").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

test.describe("a start the server refuses", () => {
  test.use({ allowedConsoleErrors: [/status of 409/] });

  test("says the source is already being searched and shows that crawl", async ({
    page,
    mockApi,
  }) => {
    const server = new SourcesServer();
    const log = await mockApi(sourcesRoutes(server));
    await openWithSocket(page, log);
    // Started elsewhere (another tab) after this page loaded its running crawls.
    server.running.set(INDEED.id, { id: "ghost", total: 0, done: 0 });
    await startButton(page, "Indeed").click();
    await expect(page.getByText("Indeed wird schon durchsucht.")).toBeVisible();
    expect(log.requests.filter((key) => key === `POST /platforms/${INDEED.id}/crawl`)).toHaveLength(
      1,
    );
    // The refetch of the running crawls brings the unknown crawl's bar.
    await expect(row(page, "Indeed")).toContainText("Startet …");
  });
});
