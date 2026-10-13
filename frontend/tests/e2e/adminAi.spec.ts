import type { Page } from "@playwright/test";
import type { SetupStatusBody } from "../../src/api/setup";
import { AdminServer, adminRoutes, STORED_KEY } from "./support/adminServer";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { inboxRoutes } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { MEMBER } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const AI_URL = "/settings?section=ai";
const ADMIN_URLS = [AI_URL, "/settings?section=users", "/settings?section=system"] as const;
const CLOUD = "OpenRouter";
const LOCAL = "Lokales Modell (LM Studio, Ollama)";
const NEW_KEY = "sk-or-e2e-neu-geheim";
const TEST_LIMIT = 10;
const MIN_HIT_TARGET_PX = 44;
const FIRST_RUN: SetupStatusBody = {
  has_source: false,
  ai_configured: false,
  profile_complete: false,
  has_jobs: false,
};

const subNav = (page: Page) => page.getByRole("navigation", { name: "Einstellungsbereiche" });
const form = (page: Page, name: string) => page.getByRole("form", { name });
const testButton = (page: Page, name: string) =>
  form(page, name).getByRole("button", { name: "Verbindung prüfen" });
const result = (page: Page, name: string) => form(page, name).locator(".conn-result");

async function openAi(page: Page) {
  await page.goto(AI_URL);
  await expect(page.getByRole("heading", { level: 2, name: "KI" })).toBeVisible();
  await expect(form(page, CLOUD)).toBeVisible();
}

/** Labels that do not fit their link (a clipped label leaves the page width alone). */
function clippedSubNavLinks(page: Page): Promise<string[]> {
  return subNav(page)
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .filter((link) => link.scrollWidth > link.clientWidth)
        .map((link) => link.textContent ?? ""),
    );
}

test("a member sees no Administration and sends no admin request", async ({ page, mockApi }) => {
  const log = await mockApi(adminRoutes(new AdminServer(), { "GET /me": { body: MEMBER } }));
  for (const url of ADMIN_URLS) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
    await expect(subNav(page).getByText("Administration")).toHaveCount(0);
    await expect(subNav(page).getByRole("link", { name: "KI" })).toHaveCount(0);
  }
  const adminRequests = log.requests.filter((key) => /^\w+ \/(admin|users)\b/.test(key));
  expect(adminRequests).toEqual([]);
});

// R5: the onboarding's link for admins opens the KI section.
test("the onboarding link opens the KI section", async ({ page, mockApi }) => {
  await fixNow(page);
  const inbox = inboxRoutes(
    { new: [] },
    { "GET /setup-status": { body: FIRST_RUN }, "GET /platforms": { body: [] } },
  );
  await mockApi(
    adminRoutes(new AdminServer(), {}, settingsRoutes(new SettingsServer(), {}, inbox)),
  );
  await page.goto("/inbox");
  await page.getByRole("link", { name: "KI-Anbieter einrichten" }).click();
  await expect(page).toHaveURL(/\/settings\?section=ai$/);
  await expect(page.getByRole("heading", { level: 2, name: "KI" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "KI" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("save a new key: the input is empty again and the page never shows it", async ({
  page,
  mockApi,
}) => {
  const admin = new AdminServer();
  const log = await mockApi(adminRoutes(admin));
  await openAi(page);
  const key = form(page, CLOUD).getByLabel("API-Schlüssel");
  await expect(key).toHaveValue("");
  await expect(key).toHaveAttribute("autocomplete", "new-password");
  await key.fill(NEW_KEY);
  await form(page, CLOUD).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("KI-Einstellungen gespeichert.")).toBeVisible();
  await expect(key).toHaveValue("");
  await expect(
    form(page, CLOUD).getByText("Gespeichert. Leer lassen, um ihn zu behalten."),
  ).toBeVisible();
  expect(admin.saved).toEqual([{ openrouter_api_key: NEW_KEY }]);
  const withKey = log.calls.filter((call) => JSON.stringify(call.body).includes(NEW_KEY));
  expect(withKey.map((call) => call.key)).toEqual(["POST /admin/settings"]);
  const html = await page.content();
  expect(html).not.toContain(NEW_KEY);
  expect(html).not.toContain(STORED_KEY);
});

test("a passed test names the model, a failing one the reason sentence", async ({
  page,
  mockApi,
}) => {
  const admin = new AdminServer();
  await mockApi(adminRoutes(admin));
  await openAi(page);
  await testButton(page, CLOUD).click();
  await expect(result(page, CLOUD)).toHaveText(
    "Verbindung steht · tngtech/deepseek-r1t2-chimera:free",
  );
  admin.nextResult.cloud = { ok: false, reason: "auth" };
  await testButton(page, CLOUD).click();
  await expect(result(page, CLOUD)).toHaveText("Anmeldung abgelehnt (API-Schlüssel prüfen).");
  await expect(result(page, CLOUD)).toHaveClass(/t-danger/);
});

test("the test waits while the form holds edits", async ({ page, mockApi }) => {
  const admin = new AdminServer();
  await mockApi(adminRoutes(admin));
  await openAi(page);
  await form(page, LOCAL).getByLabel("Adresse").fill("http://llm.lan:1234/v1");
  await expect(testButton(page, LOCAL)).toHaveAccessibleDescription("Erst speichern.");
  await expect(testButton(page, LOCAL)).toHaveAttribute("aria-disabled", "true");
  // Inactive buttons stay focusable (aria-disabled); force proves a click sends nothing.
  await testButton(page, LOCAL).click({ force: true });
  expect(admin.tests.local).toBe(0);
  await form(page, LOCAL).getByRole("button", { name: "Speichern" }).click();
  await expect(form(page, LOCAL).getByText("Erst speichern.")).toHaveCount(0);
  admin.nextResult.local = { ok: true, model: "llama3.1:8b", model_found: true };
  await testButton(page, LOCAL).click();
  await expect(result(page, LOCAL)).toHaveText("Modell gefunden.");
});

// The browser logs each provoked refusal (429, 422) as a console error; nothing else is allowed.
test.describe("refusals", () => {
  test.use({ allowedConsoleErrors: [/status of (422|429)/] });

  test("the eleventh test within a minute says wait", async ({ page, mockApi }) => {
    const admin = new AdminServer();
    await mockApi(adminRoutes(admin));
    await openAi(page);
    const button = testButton(page, CLOUD);
    for (let call = 1; call <= TEST_LIMIT; call += 1) {
      await button.click();
      await expect.poll(() => admin.tests.cloud).toBe(call);
      await expect(button).not.toHaveAttribute("aria-busy", "true");
    }
    await button.click();
    await expect(result(page, CLOUD)).toHaveText("Zu viele Anfragen, bitte kurz warten.");
    await expect(page.getByText("Rate limit exceeded")).toHaveCount(0);
  });

  // R8b: the server refuses a link-local address; the field shows a fixed text, never the server's.
  test("a refused local address shows a fixed text on the field", async ({ page, mockApi }) => {
    const admin = new AdminServer();
    await mockApi(adminRoutes(admin));
    await openAi(page);
    await form(page, LOCAL).getByLabel("Adresse").fill("http://169.254.169.254/v1");
    await form(page, LOCAL).getByRole("button", { name: "Speichern" }).click();
    await expect(
      form(page, LOCAL).getByText(
        "Diese Adresse wird nicht angenommen. Sie braucht einen Server und darf weder Zugangsdaten noch eine link-lokale Adresse enthalten.",
      ),
    ).toBeVisible();
    expect(admin.answer().ollama_base_url).toBe("");
    await expect(page.getByText("refused")).toHaveCount(0);
  });
});

test("KI: no horizontal scroll, screenshots in both themes", async ({ page, mockApi }) => {
  await mockApi(adminRoutes(new AdminServer()));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openAi(page);
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await clippedSubNavLinks(page)).toEqual([]);
      await saveScreenshot(page, `settings-ai-${size}-${scheme}`);
    }
  }
});

// Fix round M8: the states a reviewer compares, a refused test and a test that waits for Speichern.
test("KI states: a failed test and the save-first hint, screenshots in both themes", async ({
  page,
  mockApi,
}) => {
  const admin = new AdminServer();
  admin.nextResult.cloud = { ok: false, reason: "auth" };
  await mockApi(adminRoutes(admin));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openAi(page);
      await testButton(page, CLOUD).click();
      await expect(result(page, CLOUD)).toHaveText("Anmeldung abgelehnt (API-Schlüssel prüfen).");
      await form(page, LOCAL).getByLabel("Adresse").fill("http://llm.lan:1234/v1");
      await expect(form(page, LOCAL).getByText("Erst speichern.")).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-ai-states-${size}-${scheme}`);
    }
  }
});

test("the admin group at 375 px: one seg row of three, 44 px, nothing clipped", async ({
  page,
  mockApi,
}) => {
  await mockApi(adminRoutes(new AdminServer()));
  await page.setViewportSize(VIEWPORTS.narrow);
  await openAi(page);
  const admin = subNav(page).getByRole("list", { name: "Administration" });
  const boxes = await Promise.all(
    (await admin.getByRole("link").all()).map((link) => link.boundingBox()),
  );
  expect(new Set(boxes.map((box) => Math.round(box?.y ?? 0))).size).toBe(1);
  expect(Math.min(...boxes.map((box) => box?.height ?? 0))).toBeGreaterThanOrEqual(
    MIN_HIT_TARGET_PX,
  );
  expect(await clippedSubNavLinks(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toBe(0);
  await page.mouse.move(0, 0);
  await saveScreenshot(page, "settings-nav-admin-375");
});
