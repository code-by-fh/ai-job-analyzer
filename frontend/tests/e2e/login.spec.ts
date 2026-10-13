import type { Page } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../../src/theme/theme";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { LOGIN_OK, UNAUTHORIZED } from "./support/fixtures";
import { setRoutes, type MockRoutes, type MutableRoutes } from "./support/mockApi";
import { EXPECTED_SESSION_PROBE, expect, test } from "./support/test";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { sourcesRoutes } from "./support/sourcesServer";

const LOGGED_OUT_ROUTES: MockRoutes = {
  "GET /me": UNAUTHORIZED,
  "POST /auth/refresh": UNAUTHORIZED,
};

function loggedOutRoutes(): MutableRoutes {
  return { ...LOGGED_OUT_ROUTES, "POST /auth/login": LOGIN_OK };
}

/** Signed in: the shell plus everything Quellen loads, a page the login returns to. */
const signedInRoutes = () => sourcesRoutes();

/** Fills the form; the session exists from the moment the login call succeeds (as with cookies). */
async function logIn(page: Page, routes: MutableRoutes, password = "qa-admin"): Promise<void> {
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill(password);
  setRoutes(routes, signedInRoutes());
  await page.getByRole("button", { name: "Anmelden" }).click();
}

interface ModeTrace {
  firstMode: string | null;
  setBeforeBody: boolean;
}

declare global {
  interface Window {
    __modeTrace: ModeTrace;
  }
}

/** Records the first data-mode value on <html> and whether <body> did not exist yet (head script). */
function traceFirstMode(storageKey: string): void {
  localStorage.setItem(storageKey, "dark");
  window.__modeTrace = { firstMode: null, setBeforeBody: false };
  new MutationObserver(() => {
    const trace = window.__modeTrace;
    if (trace.firstMode !== null) return;
    trace.firstMode = document.documentElement.dataset.mode ?? null;
    trace.setBeforeBody = document.body === null;
  }).observe(document, { attributes: true, attributeFilter: ["data-mode"], subtree: true });
}

test("skips the form when a session already exists", async ({ page, mockApi }) => {
  await mockApi(signedInRoutes());
  await page.goto("/login?next=%2Fsources");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/sources`);
});

// Every journey here starts without a session, so the browser logs the 401 of the session probe.
test.describe("without a session", () => {
  test.use({ allowedConsoleErrors: [EXPECTED_SESSION_PROBE] });

  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`login renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
        await mockApi(LOGGED_OUT_ROUTES);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/login");
        await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-mode", scheme);
        await saveScreenshot(page, `login-${size}-${scheme}`);
      });
    }
  }

  test("logs in and lands on the inbox", async ({ page, mockApi }) => {
    const routes = loggedOutRoutes();
    await mockApi(routes);
    await page.goto("/login");
    await logIn(page, routes);
    await expect(page).toHaveURL(`${E2E_BASE_URL}/inbox`);
    await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  });

  test("shows a German message for wrong credentials", async ({ page, mockApi }) => {
    await mockApi({
      ...LOGGED_OUT_ROUTES,
      "POST /auth/login": { status: 401, body: { detail: "Incorrect username or password" } },
    });
    await page.goto("/login");
    await page.getByLabel("Benutzername").fill("admin");
    await page.getByLabel("Passwort").fill("falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "Benutzername oder Passwort ist falsch.",
    );
    await expect(page.getByText("Sitzung ist abgelaufen")).toHaveCount(0);
  });

  test("returns to the requested page after login", async ({ page, mockApi }) => {
    const routes = loggedOutRoutes();
    await mockApi(routes);
    await page.goto("/login?next=%2Fsources");
    await logIn(page, routes);
    await expect(page.getByRole("heading", { name: "Quellen" })).toBeVisible();
  });

  test("an unauthenticated visit to the inbox ends on the inbox after logging in", async ({
    page,
    mockApi,
  }) => {
    const routes = loggedOutRoutes();
    await mockApi(routes);
    await page.goto("/inbox");
    await expect(page).toHaveURL(`${E2E_BASE_URL}/login?next=%2Finbox`);
    await logIn(page, routes);
    await expect(page).toHaveURL(`${E2E_BASE_URL}/inbox`);
    await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  });

  test("ignores an off-site next parameter", async ({ page, mockApi }) => {
    const routes = loggedOutRoutes();
    await mockApi(routes);
    await page.goto("/login?next=%2F%2Fevil.example");
    await logIn(page, routes);
    await expect(page).toHaveURL(`${E2E_BASE_URL}/inbox`);
  });

  test("applies a stored dark theme before first paint", async ({ page, mockApi }) => {
    await page.addInitScript(traceFirstMode, THEME_STORAGE_KEY);
    await page.emulateMedia({ colorScheme: "light" });
    await mockApi(LOGGED_OUT_ROUTES);
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    const trace = await page.evaluate(() => window.__modeTrace);
    expect(trace).toEqual({ firstMode: "dark", setBeforeBody: true });
  });

  test("has no horizontal scroll at 375 px", async ({ page, mockApi }) => {
    await mockApi(LOGGED_OUT_ROUTES);
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
