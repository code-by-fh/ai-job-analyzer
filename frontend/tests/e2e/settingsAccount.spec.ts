import type { Locator, Page } from "@playwright/test";
import type { SetupStatusBody } from "../../src/api/setup";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { SETUP_DONE } from "./support/fixtures";
import { inboxRoutes } from "./support/inboxFixtures";
import { live } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { PASSWORD } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const NEW_PASSWORD = "neues-passwort-2";
const WRONG_PASSWORD = "falsches-passwort";
const WRONG_CURRENT = "Das aktuelle Passwort stimmt nicht.";
const FACTORY_TEXT =
  "Löscht deine Stellen, Bewerbungen, Quellen, dein Profil, Nachweise und eigene Vorlagen, dazu die Zugangsdaten der Benachrichtigungen, Sprache und Zeitzone. Das Konto selbst bleibt. Das lässt sich nicht rückgängig machen.";
const PASSWORD_LABELS = ["Aktuelles Passwort", "Neues Passwort", "Neues Passwort wiederholen"];
// After the reset the account owns nothing: the inbox shows the onboarding (decision in the report).
// The AI provider is the server's (admin) configuration, which the reset does not touch (review M4).
const EMPTY_ACCOUNT: SetupStatusBody = {
  ...SETUP_DONE,
  has_source: false,
  profile_complete: false,
  has_jobs: false,
};

// The browser logs each refusal a journey provokes on purpose; exactly these lines are allowed.
const REFUSED_PASSWORD = /Failed to load resource: the server responded with a status of 400/;
// One pattern: Playwright reads a two-element option array as [value, options].
const REFUSED_RESET = /Failed to load resource: the server responded with a status of (400|409)/;

const passwordForm = (page: Page) => page.getByRole("form", { name: "Passwort ändern" });
const field = (scope: Locator, label: string) => scope.getByLabel(label, { exact: true });
const factoryDialog = (page: Page) => page.getByRole("dialog", { name: "Alles zurücksetzen" });
const dangerZone = (page: Page) => page.getByRole("region", { name: "Gefahrenzone" });

async function openAccount(page: Page): Promise<void> {
  await page.goto("/settings?section=account");
  await expect(page.getByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
}

async function fillPassword(form: Locator, current: string): Promise<void> {
  await field(form, "Aktuelles Passwort").fill(current);
  await field(form, "Neues Passwort").fill(NEW_PASSWORD);
  await field(form, "Neues Passwort wiederholen").fill(NEW_PASSWORD);
  await form.getByRole("button", { name: "Speichern" }).click();
}

/** Settings plus the inbox the reset lands on; setup-status follows the server's state. */
function resetRoutes(server: SettingsServer) {
  return inboxRoutes(
    { new: [] },
    {
      ...settingsRoutes(server, {}, {}),
      "GET /setup-status": live(() => (server.factoryResets > 0 ? EMPTY_ACCOUNT : SETUP_DONE)),
      "GET /platforms": { body: [] },
    },
  );
}

test.describe("refused passwords", () => {
  test.use({ allowedConsoleErrors: [REFUSED_PASSWORD] });

  test("password: a wrong current one is a field error, then the change goes through", async ({
    page,
    mockApi,
  }) => {
    const server = new SettingsServer();
    await mockApi(settingsRoutes(server));
    await openAccount(page);
    const form = passwordForm(page);
    await fillPassword(form, WRONG_PASSWORD);
    await expect(form.getByText(WRONG_CURRENT)).toBeVisible();
    expect(server.password).toBe(PASSWORD);
    await expect(field(form, "Neues Passwort")).toHaveValue(NEW_PASSWORD);
    await field(form, "Aktuelles Passwort").fill(PASSWORD);
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Passwort geändert.")).toBeVisible();
    for (const label of PASSWORD_LABELS) await expect(field(form, label)).toHaveValue("");
    await expect(form.getByText(WRONG_CURRENT)).toHaveCount(0);
    expect(server.password).toBe(NEW_PASSWORD);
  });
});

test("leaving Konto with a typed password asks first and then drops it", async ({
  page,
  mockApi,
}) => {
  await mockApi(settingsRoutes());
  await openAccount(page);
  await field(passwordForm(page), "Aktuelles Passwort").fill(PASSWORD);
  const nav = page.getByRole("navigation", { name: "Einstellungsbereiche" });
  await nav.getByRole("link", { name: "Allgemein" }).click();
  const dialog = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await dialog.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
  await nav.getByRole("link", { name: "Konto" }).click();
  await expect(field(passwordForm(page), "Aktuelles Passwort")).toHaveValue("");
});

test("Konto no longer offers archive all", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openAccount(page);
  await expect(page.getByRole("button", { name: "Alle Stellen archivieren" })).toHaveCount(0);
});

test.describe("factory reset refusals", () => {
  test.use({ allowedConsoleErrors: [REFUSED_RESET] });

  test("factory reset: a wrong password keeps everything, the right one lands on the onboarding", async ({
    page,
    mockApi,
  }) => {
    const server = new SettingsServer();
    await mockApi(resetRoutes(server));
    await openAccount(page);
    await dangerZone(page).getByRole("button", { name: "Alles zurücksetzen" }).click();
    const dialog = factoryDialog(page);
    await expect(dialog).toContainText(FACTORY_TEXT);
    const password = field(dialog, "Zur Bestätigung dein Passwort");
    await expect(password).toBeFocused();
    await password.fill(WRONG_PASSWORD);
    await password.press("Enter");
    await expect(dialog.getByText(WRONG_CURRENT)).toBeVisible();
    expect(server.factoryResets).toBe(0);
    expect(server.templates).toHaveLength(2);
    await password.fill(PASSWORD);
    await password.press("Enter");
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();
    expect(server.factoryResets).toBe(1);
    expect(server.profile).toEqual({});
    expect(server.jobs).toEqual([]);
    expect(server.templates.map((template) => template.name)).toEqual(["Digest"]);
  });

  test("factory reset while a search runs says so and keeps the dialog", async ({
    page,
    mockApi,
  }) => {
    const server = new SettingsServer();
    server.crawlRunning = true;
    await mockApi(settingsRoutes(server));
    await openAccount(page);
    await dangerZone(page).getByRole("button", { name: "Alles zurücksetzen" }).click();
    const dialog = factoryDialog(page);
    await field(dialog, "Zur Bestätigung dein Passwort").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Alles zurücksetzen" }).click();
    await expect(
      page.getByText("Gerade läuft eine Suche. Versuche es nach ihrem Ende erneut."),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(server.factoryResets).toBe(0);
    await expect(page).toHaveURL(/\/settings\?section=account$/);
  });
});

// Review M2: a typed password elsewhere is dropped with the account; no "Leave site?" holds the reset.
test("factory reset with a typed password elsewhere navigates without a leave question", async ({
  page,
  mockApi,
}) => {
  const server = new SettingsServer();
  await mockApi(resetRoutes(server));
  const dialogs: string[] = [];
  page.on("dialog", (question) => {
    dialogs.push(question.type());
    void question.dismiss();
  });
  await openAccount(page);
  await field(passwordForm(page), "Aktuelles Passwort").fill("halb-getippt");
  await dangerZone(page).getByRole("button", { name: "Alles zurücksetzen" }).click();
  const password = field(factoryDialog(page), "Zur Bestätigung dein Passwort");
  await password.fill(PASSWORD);
  await password.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();
  await expect(page).toHaveURL(/\/inbox$/);
  expect(dialogs).toEqual([]);
  expect(server.factoryResets).toBe(1);
});

/** Every SCREENSHOT_SIZES x COLOR_SCHEMES shot, pointer away, no horizontal scroll. */
async function screenshots(page: Page, name: string): Promise<void> {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-account-${name}-${size}-${scheme}`);
    }
  }
}

test("Konto with the danger zone: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openAccount(page);
  await expect(dangerZone(page)).toBeVisible();
  await screenshots(page, "section");
});

test("the factory reset dialog: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openAccount(page);
  await dangerZone(page).getByRole("button", { name: "Alles zurücksetzen" }).click();
  await expect(factoryDialog(page)).toBeVisible();
  await screenshots(page, "factory-reset");
});
