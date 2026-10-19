import type { Locator, Page } from "@playwright/test";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import {
  ADMIN_USER_ID,
  AUTHENTICATED_ROUTES,
  LANGUAGE_PREFERENCE_SAVED,
  LOGOUT_OK,
  RUNNING_CRAWL_ID,
  UNAUTHORIZED,
} from "./support/fixtures";
import { setRoutes, type ApiLog, type MutableRoutes } from "./support/mockApi";
import { RUNNING_CRAWL } from "./support/platformFixtures";
import { EXPECTED_SESSION_PROBE, expect, test } from "./support/test";
import { horizontalOverflow, pauseClockSoon, saveScreenshot } from "./support/page";

const MAX_OVERLAY_SHARE = 0.25;
const MIN_TARGET_PX = 44;
const CLOCK_START = Date.UTC(2026, 9, 8, 9, 0, 0);
const CLOCK_PAUSE_OFFSET_MS = 1_000;

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`shell renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(AUTHENTICATED_ROUTES);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
      await expect(nav.getByRole("link", { name: /Eingang/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.getByRole("link", { name: /Eingang/ })).toContainText("3");
      await saveScreenshot(page, `shell-${size}-${scheme}`);
    });
  }
}

test("sidebar shows failing sources and the running crawl", async ({ page, mockApi }) => {
  await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  const sidebar = page.getByRole("complementary", { name: "Seitenleiste" });
  await expect(sidebar.getByText("1 Fehler")).toBeVisible();
  const indicator = sidebar.getByRole("button", { name: /^1 Aufgabe läuft: StepStone/ });
  await expect(indicator).toContainText("Lädt Seiten: 5 von 12");
  await expect(indicator).toContainText("33 %");
  // The time counts from the scraper's stamp in crawl-status, so a reload keeps it.
  await expect(indicator.locator(".elapsed-ticking")).toContainText(/seit \d\d:\d\d/);
  await expect(indicator).toHaveAccessibleName(/läuft seit \d+ Minuten$/);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`activity popover lies above the page at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(AUTHENTICATED_ROUTES);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
      await page.getByRole("button", { name: /^1 Aufgabe läuft: StepStone/ }).click();
      const popover = page.getByRole("dialog", { name: "Im Hintergrund" });
      await expect(popover.getByText("Lädt Seiten: 5 von 12")).toBeVisible();
      await expect(popover.getByRole("list", { name: "Ablauf" })).toContainText("48gefunden");
      await expect(popover.getByRole("link", { name: "StepStone" })).toBeVisible();
      expect(await isTopmostAtCentre(popover)).toBe(true);
      await expect(popover).toBeInViewport({ ratio: 1 });
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await sidewaysScroll(popover)).toBe(0);
      await saveScreenshot(page, `activity-${size}-${scheme}`);
    });
  }
}

test("the sidebar gets no horizontal scrollbar from the activity popover", async ({
  page,
  mockApi,
}) => {
  await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.medium);
  await page.goto("/inbox");
  await page.getByRole("button", { name: /^1 Aufgabe läuft/ }).click();
  await expect(page.getByRole("dialog", { name: "Im Hintergrund" })).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Seitenleiste" });
  expect(await sidewaysScroll(sidebar)).toBe(0);
});

test("a finished crawl leaves the indicator and shows under the recent runs", async ({
  page,
  mockApi,
}) => {
  const api = await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await expect.poll(() => api.sockets.length).toBe(1);
  await page.getByRole("button", { name: /^1 Aufgabe läuft/ }).click();
  const completed = {
    type: "crawl_job_completed",
    user_id: ADMIN_USER_ID,
    job_id: RUNNING_CRAWL_ID,
    progress: { ...RUNNING_CRAWL.progress, stage: "completed", jobs_analysed: 11, work_done: 24 },
  };
  api.sockets[0].send(JSON.stringify(completed));
  const popover = page.getByRole("dialog", { name: "Im Hintergrund" });
  await expect(popover.getByText("Keine laufenden Aufgaben.")).toBeVisible();
  await expect(popover.getByRole("listitem")).toContainText("Neue Stellen: 10");
  await expect(page.getByRole("button", { name: "Aktivität", exact: true })).toBeVisible();
});

test("the mobile strip shows the crawl above the bottom bar and hands focus to Mehr when it ends", async ({
  page,
  mockApi,
}) => {
  const api = await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/inbox");
  await expect.poll(() => api.sockets.length).toBe(1);
  const strip = page.getByRole("button", { name: /^1 Aufgabe läuft: StepStone/ });
  await expect(strip).toBeVisible();
  const bottomBar = page.getByRole("navigation", { name: "Hauptnavigation" });
  const stripBox = await strip.boundingBox();
  const barBox = await bottomBar.boundingBox();
  expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
  expect(stripBox!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  await strip.click();
  const finished = {
    type: "crawl_job_completed",
    user_id: ADMIN_USER_ID,
    job_id: RUNNING_CRAWL_ID,
  };
  api.sockets[0].send(JSON.stringify(finished));
  const popover = page.getByRole("dialog", { name: "Im Hintergrund" });
  await expect(popover.getByText("Keine laufenden Aufgaben.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(bottomBar.getByRole("button", { name: "Mehr", exact: true })).toBeFocused();
});

test("bottom bar shows failing sources and running tasks at 390 px", async ({ page, mockApi }) => {
  const api = await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/inbox");
  const bottomBar = page.getByRole("navigation", { name: "Hauptnavigation" });
  // The pill shows only the alert icon; the sentence stays in the accessible name.
  const sources = bottomBar.getByRole("link", { name: /Quellen.*1 Fehler/ });
  await expect(sources.locator(".count-badge-danger")).toBeVisible();
  await expect(sources.getByText("1 Fehler")).toHaveClass("sr-only");
  await expect(bottomBar.getByRole("button", { name: "Mehr 1 Aufgabe läuft" })).toBeVisible();
  await expect.poll(() => api.sockets.length).toBe(1);
  const finished = {
    type: "crawl_job_completed",
    user_id: ADMIN_USER_ID,
    job_id: RUNNING_CRAWL_ID,
  };
  api.sockets[0].send(JSON.stringify(finished));
  await expect(bottomBar.getByRole("button", { name: "Mehr", exact: true })).toBeVisible();
});

// Both journeys end without a session, so the browser logs the 401 of the session probe.
test.describe("leaving the session", () => {
  test.use({ allowedConsoleErrors: [EXPECTED_SESSION_PROBE] });

  test("redirects to login when the session cannot be restored", async ({ page, mockApi }) => {
    await mockApi({ "GET /me": UNAUTHORIZED, "POST /auth/refresh": UNAUTHORIZED });
    await page.goto("/inbox");
    await expect(page).toHaveURL(`${E2E_BASE_URL}/login?next=%2Finbox`);
  });

  test("logs out to a plain /login and closes the realtime socket", async ({ page, mockApi }) => {
    const routes: MutableRoutes = { ...AUTHENTICATED_ROUTES, "POST /auth/logout": LOGOUT_OK };
    const api = await mockApi(routes);
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/inbox");
    await expect.poll(() => api.sockets.length).toBe(1);
    // From here on the cookies are gone, as after a real logout.
    setRoutes(routes, { "GET /me": UNAUTHORIZED, "POST /auth/refresh": UNAUTHORIZED });
    await page.getByRole("button", { name: "admin" }).click();
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    expect(page.url()).toBe(`${E2E_BASE_URL}/login`);
    expect(api.requests).toContain("POST /auth/logout");
    await expect.poll(() => api.closedSockets.length).toBe(1);
  });
});

test("opens global search with / and closes it with Escape", async ({ page, mockApi }) => {
  await mockApi(AUTHENTICATED_ROUTES);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Suche" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Suche" })).toBeHidden();
});

test("switches the language from the user menu and stores it", async ({ page, mockApi }) => {
  const api = await mockApi({
    ...AUTHENTICATED_ROUTES,
    "POST /language-preference": LANGUAGE_PREFERENCE_SAVED,
  });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await page.getByRole("button", { name: "admin" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  expect(api.requests).toContain("POST /language-preference");
});

test("has no horizontal scroll at 375 px", async ({ page, mockApi }) => {
  await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});

test("toasts and the bottom bar cover at most a quarter of a 390 px viewport", async ({
  page,
  mockApi,
}) => {
  // Fake timers: the 6 s auto-dismiss cannot fire while the clock is paused.
  await page.clock.install({ time: CLOCK_START });
  const api = await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  await expect.poll(() => api.sockets.length).toBe(1);
  await pauseClockSoon(page, CLOCK_PAUSE_OFFSET_MS);
  const event = JSON.stringify({ type: "global_error", user_id: ADMIN_USER_ID });
  api.sockets[0].send(event);
  api.sockets[0].send(event);
  await expect(page.getByRole("button", { name: "Meldung schließen" })).toHaveCount(2);
  const bottomBar = page.getByRole("navigation", { name: "Hauptnavigation" });
  // The toast items carry no role (their live regions do), so the class is the only hook.
  const covered = await coveredArea([page.locator(".toast"), bottomBar]);
  expect(covered / (VIEWPORTS.mobile.width * VIEWPORTS.mobile.height)).toBeLessThanOrEqual(
    MAX_OVERLAY_SHARE,
  );
});

/** Sends two global_error events and waits until both toasts show. Fake clock: no auto-dismiss. */
async function showTwoToasts(page: Page, api: ApiLog): Promise<void> {
  await expect.poll(() => api.sockets.length).toBe(1);
  await pauseClockSoon(page, CLOCK_PAUSE_OFFSET_MS);
  const event = JSON.stringify({ type: "global_error", user_id: ADMIN_USER_ID });
  api.sockets[0].send(event);
  api.sockets[0].send(event);
  await expect(page.getByRole("button", { name: "Meldung schließen" })).toHaveCount(2);
}

test("toasts stack bottom right on desktop, newest at the bottom", async ({ page, mockApi }) => {
  await page.clock.install({ time: CLOCK_START });
  const api = await mockApi(AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  await showTwoToasts(page, api);
  const [first, second] = await page
    .locator(".toast")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
  expect(VIEWPORTS.desktop.width - second.right).toBeLessThan(40);
  expect(VIEWPORTS.desktop.height - second.bottom).toBeLessThan(40);
  expect(second.top).toBeGreaterThanOrEqual(first.bottom);
  expect(second.left).toBeGreaterThan(VIEWPORTS.desktop.width / 2);
});

for (const withCrawl of [true, false]) {
  test(`toasts span the width above the bottom bar ${withCrawl ? "and the crawl strip " : ""}on mobile`, async ({
    page,
    mockApi,
  }) => {
    await page.clock.install({ time: CLOCK_START });
    const api = await mockApi(
      withCrawl
        ? AUTHENTICATED_ROUTES
        : { ...AUTHENTICATED_ROUTES, "GET /scraper/crawl-status": { body: { jobs: [] } } },
    );
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/inbox");
    const dock = page.locator(".crawl-dock");
    if (withCrawl) await expect(dock).toBeVisible();
    await showTwoToasts(page, api);
    const barTop = (await page.getByRole("navigation", { name: "Hauptnavigation" }).boundingBox())!
      .y;
    const limit = withCrawl ? (await dock.boundingBox())!.y : barTop;
    if (!withCrawl) await expect(dock).toBeHidden();
    const boxes = await page
      .locator(".toast")
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.bottom).toBeLessThanOrEqual(limit);
      expect(box.left).toBeCloseTo(16, 0);
      expect(VIEWPORTS.mobile.width - box.right).toBeCloseTo(16, 0);
    }
  });
}

/** True when the topmost element at the panel's centre belongs to the panel (nothing covers it). */
async function isTopmostAtCentre(panel: Locator): Promise<boolean> {
  return panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && element.contains(hit);
  });
}

/** Pixels an element's content is wider than its box; 0 means no horizontal scrollbar. */
async function sidewaysScroll(element: Locator): Promise<number> {
  return element.evaluate((node) => node.scrollWidth - node.clientWidth);
}

/** Sum of the bounding-box areas of all matches (an upper bound; the overlays do not overlap). */
async function coveredArea(locators: readonly Locator[]): Promise<number> {
  const areas = await Promise.all(
    locators.map(async (locator) => {
      const boxes = await locator.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect()),
      );
      return boxes.reduce((sum, box) => sum + box.width * box.height, 0);
    }),
  );
  return areas.reduce((sum, area) => sum + area, 0);
}
