import type { Page } from "@playwright/test";
import { STALL_AFTER_MS } from "../../src/domain/pendingTasks";
import { IMPORT_EXPIRE_AFTER_MS } from "../../src/realtime/imports";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { inboxRoutes } from "./support/inboxFixtures";
import { fixNow, JOB_ID, jobBody, jobRoutes, NOW_ISO, pushEvent } from "./support/jobFixtures";
import type { ApiLog, MockRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const CRAWL = "crawl-9";
const URL_OK = "https://karriere.example.de/jobs/senior-kotlin-engineer";
const STARTED: MockRoutes = {
  "POST /scraper/import-job": { body: { status: "Started", job_id: CRAWL } },
};
const OPEN_IMPORT = "Per URL importieren: eine einzelne Stelle";
const FAILED_TOAST = "Die Anzeige konnte nicht gelesen werden.";
// lib/clock's tick; that module loads React, so the e2e process keeps its own copy.
const CLOCK_TICK_MS = 30_000;

/** The inbox plus the job page of JOB_ID; the inbox routes win where both define one. */
function importRoutes(): MockRoutes {
  return { ...jobRoutes(jobBody()), ...inboxRoutes({}, STARTED) };
}

async function push(log: ApiLog, event: object) {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  pushEvent(log, event);
}

async function startImport(page: Page) {
  await page.getByRole("button", { name: OPEN_IMPORT }).click();
  await page.getByLabel("Link zur Stellenanzeige").fill(URL_OK);
  await page.getByRole("button", { name: "Importieren und bewerten" }).click();
}

type Viewport = { width: number; height: number };
type Scheme = (typeof COLOR_SCHEMES)[number];

async function showPage(page: Page, viewport: Viewport, scheme: Scheme) {
  await page.setViewportSize(viewport);
  // Reduced motion: the screenshot shows the drawer, not a frame of its entry animation.
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto("/inbox");
}

const progress = (page: Page) => page.getByRole("dialog").getByRole("status");

/** Records every text the toast stack shows, so a toast that came and went is still seen. */
async function recordToasts(page: Page): Promise<() => Promise<string>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { seenToasts: seen });
    new MutationObserver(() => {
      seen.push(document.querySelector(".toasts")?.textContent ?? "");
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { seenToasts: string[] }).seenToasts.join(" "));
}

test.describe("with the clock fixed", () => {
  test.beforeEach(async ({ page }) => {
    await fixNow(page);
  });

  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`the import drawer and its progress at ${size}px in ${scheme} mode`, async ({
        page,
        mockApi,
      }) => {
        await mockApi(inboxRoutes({}, STARTED));
        await showPage(page, viewport, scheme);
        await page.getByRole("button", { name: OPEN_IMPORT }).click();
        const drawer = page.getByRole("dialog", { name: "Einzelne Stelle importieren" });
        await expect(drawer.getByLabel("Link zur Stellenanzeige")).toBeFocused();
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `inbox-import-${size}-${scheme}`);
        await drawer.getByLabel("Link zur Stellenanzeige").fill(URL_OK);
        await drawer.getByRole("button", { name: "Importieren und bewerten" }).click();
        await expect(progress(page)).toHaveText("Anzeige wird gelesen …");
        await expect(progress(page)).toBeFocused();
        await saveScreenshot(page, `inbox-import-progress-${size}-${scheme}`);
      });
    }
  }

  test("the masthead names the import in words between 768 and 1199 px, as an icon elsewhere", async ({
    page,
    mockApi,
  }) => {
    await mockApi(inboxRoutes());
    await page.setViewportSize(VIEWPORTS.medium);
    await page.goto("/inbox");
    const trigger = page.getByRole("button", { name: OPEN_IMPORT });
    const label = trigger.getByText("Per URL importieren");
    await expect(label).toBeVisible();
    await saveScreenshot(page, "inbox-import-trigger-1100");
    await page.setViewportSize(VIEWPORTS.desktop);
    await expect(trigger).toBeVisible();
    await expect(label).toBeHidden();
    await page.setViewportSize(VIEWPORTS.mobile);
    await expect(trigger).toBeVisible();
    await expect(label).toBeHidden();
  });

  test("imports a posting, follows it live and opens it", async ({ page, mockApi }) => {
    const log = await mockApi(importRoutes());
    await page.goto("/inbox");
    await startImport(page);
    await expect(progress(page)).toHaveText("Anzeige wird gelesen …");
    expect(log.calls).toContainEqual({ key: "POST /scraper/import-job", body: { url: URL_OK } });
    await push(log, { type: "crawl_job_started", job_id: CRAWL, platform: URL_OK });
    await expect(progress(page)).toHaveText("Startet …");
    await push(log, {
      type: "new_job",
      crawl_job_id: CRAWL,
      job: { id: JOB_ID, match_score: 80, is_archived: false },
    });
    await push(log, { type: "crawl_job_completed", job_id: CRAWL });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const toasts = page.locator(".toasts");
    await expect(toasts.getByText("Importiert und bewertet: 80 · Stark.")).toBeVisible();
    await toasts.getByRole("button", { name: "Ansehen" }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}$`));
  });

  test("an existing posting is reported with a link to it", async ({ page, mockApi }) => {
    const log = await mockApi(importRoutes());
    await page.goto("/inbox");
    await startImport(page);
    await push(log, { type: "job_skipped", job_id: CRAWL, existing_job_id: JOB_ID });
    await push(log, { type: "crawl_job_completed", job_id: CRAWL });
    const toasts = page.locator(".toasts");
    await expect(toasts.getByText("Diese Stelle ist schon da.")).toBeVisible();
    await toasts.getByRole("button", { name: "Ansehen" }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}$`));
  });

  test("the outcome is reported after the drawer was closed", async ({ page, mockApi }) => {
    const log = await mockApi(inboxRoutes({}, STARTED));
    await page.goto("/inbox");
    await startImport(page);
    await expect(progress(page)).toHaveText("Anzeige wird gelesen …");
    await page.getByRole("dialog").getByRole("button", { name: "Schließen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await push(log, { type: "crawl_job_failed", job_id: CRAWL });
    await expect(page.locator(".toasts").getByRole("alert").getByText(FAILED_TOAST)).toBeVisible();
  });
});

test.describe("with a running clock", () => {
  // R18(3): the stall needs time to pass, so these tests drive an installed clock.
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(NOW_ISO) });
  });

  async function stallImport(page: Page) {
    await startImport(page);
    await expect(progress(page)).toHaveText("Anzeige wird gelesen …");
    await page.clock.runFor(STALL_AFTER_MS + CLOCK_TICK_MS);
    await expect(progress(page)).toContainText("Das dauert ungewöhnlich lange.");
  }

  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`the stalled import at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
        await mockApi(inboxRoutes({}, STARTED));
        await showPage(page, viewport, scheme);
        await stallImport(page);
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `inbox-import-stalled-${size}-${scheme}`);
      });
    }
  }

  test("a new attempt forgets the stalled import, so it is never reported", async ({
    page,
    mockApi,
  }) => {
    await mockApi(inboxRoutes({}, STARTED));
    await page.goto("/inbox");
    await stallImport(page);
    await page.getByRole("button", { name: "Noch einmal versuchen" }).click();
    await expect(page.getByLabel("Link zur Stellenanzeige")).toBeFocused();
    const toastTexts = await recordToasts(page);
    await page.clock.runFor(IMPORT_EXPIRE_AFTER_MS);
    expect(await toastTexts()).not.toContain(FAILED_TOAST);
  });

  test("a stalled import left alone is reported as failed by the sweep", async ({
    page,
    mockApi,
  }) => {
    await mockApi(inboxRoutes({}, STARTED));
    await page.goto("/inbox");
    await stallImport(page);
    const toastTexts = await recordToasts(page);
    await page.clock.runFor(IMPORT_EXPIRE_AFTER_MS);
    await expect.poll(toastTexts).toContain(FAILED_TOAST);
  });
});
