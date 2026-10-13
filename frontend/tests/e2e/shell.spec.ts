import type { Locator } from "@playwright/test";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import {
  ADMIN_USER_ID,
  AUTHENTICATED_ROUTES,
  LANGUAGE_PREFERENCE_SAVED,
  LOGOUT_OK,
  RUNNING_CRAWL_ID,
  UNAUTHORIZED,
} from "./support/fixtures";
import { setRoutes, type MutableRoutes } from "./support/mockApi";
import { EXPECTED_SESSION_PROBE, expect, test } from "./support/test";
import { horizontalOverflow, pauseClockSoon, saveScreenshot } from "./support/page";

const MAX_OVERLAY_SHARE = 0.25;
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
  await page.getByRole("button", { name: "1 Aufgabe läuft" }).click();
  await expect(page.getByText("Links sammeln: 5 von 12")).toBeVisible();
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
