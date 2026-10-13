import type { Page } from "@playwright/test";
import type { SetupStatusBody } from "../../src/api/setup";
import { ADMIN_PASSWORD, AdminServer, adminRoutes } from "./support/adminServer";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { SETUP_DONE } from "./support/fixtures";
import { inboxRoutes } from "./support/inboxFixtures";
import { pushEvent } from "./support/jobFixtures";
import { live, type ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const SYSTEM_URL = "/settings?section=system";
const CALM = "Zurzeit kein KI-Fehler.";
const AUTH_SENTENCE = "Der KI-Anbieter hat die Anmeldung abgelehnt. Prüfe den Schlüssel.";
const WIPE = "Datenbank leeren";
const PASSWORD_LABEL = "Zur Bestätigung dein Passwort";
const WRONG_PASSWORD = "falsches-passwort";
// The browser logs the provoked refusal (400) as a console error; nothing else is allowed.
const REFUSED_WIPE = /Failed to load resource: the server responded with a status of 400/;
// After the wipe the admin owns no source and no job: the inbox shows the onboarding.
const WIPED_ACCOUNT: SetupStatusBody = { ...SETUP_DONE, has_source: false, has_jobs: false };

const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);
const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Systemfehler" });
const wipeZone = (page: Page) => page.getByRole("region", { name: WIPE });
const wipeDialog = (page: Page) => page.getByRole("dialog", { name: WIPE });

async function openSystem(page: Page) {
  await page.goto(SYSTEM_URL);
  await expect(heading(page)).toBeVisible();
}

/** The admin routes plus the inbox the wipe lands on; setup-status follows the server's state. */
function wipeRoutes(admin: AdminServer) {
  return inboxRoutes(
    { new: [] },
    {
      ...adminRoutes(admin, {}, settingsRoutes(new SettingsServer(), {}, {})),
      "GET /setup-status": live(() => (admin.wipes.length > 0 ? WIPED_ACCOUNT : SETUP_DONE)),
      "GET /platforms": { body: [] },
    },
  );
}

async function askToWipe(page: Page, password: string) {
  await wipeZone(page).getByRole("button", { name: WIPE }).click();
  const field = wipeDialog(page).getByLabel(PASSWORD_LABEL);
  await expect(field).toBeFocused();
  await field.fill(password);
  await field.press("Enter");
}

test("an AI error arrives live and is reset", async ({ page, mockApi }) => {
  const admin = new AdminServer();
  const log = await mockApi(adminRoutes(admin));
  await openSystem(page);
  await expect(page.getByText(CALM)).toBeVisible();
  await connected(log);

  admin.aiError = "auth";
  pushEvent(log, { type: "ai_error", message: "OpenRouter: 401 raw provider text" });
  await expect(page.getByText(AUTH_SENTENCE)).toBeVisible();
  await expect(page.getByText(/raw provider text/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Zu den KI-Einstellungen" })).toBeVisible();

  await page.getByRole("button", { name: "Fehler zurücksetzen" }).click();
  pushEvent(log, { type: "ai_error_cleared" });
  await expect(page.getByText(CALM)).toBeVisible();
  await expect(page.getByText("KI-Fehler zurückgesetzt.")).toBeVisible();
  expect(admin.aiError).toBeNull();
  await expect(page.getByRole("heading", { level: 3, name: "KI-Fehler" })).toBeFocused();
});

test("Aufräumen toasts the removed runs", async ({ page, mockApi }) => {
  await mockApi(adminRoutes(new AdminServer()));
  await openSystem(page);
  const cleanup = page.getByRole("button", { name: "Hängende Läufe aufräumen" });
  await cleanup.click();
  await expect(page.getByText("2 hängende Läufe entfernt.")).toBeVisible();
  await expect(cleanup).toBeFocused();
});

test.describe("wipe refusals", () => {
  test.use({ allowedConsoleErrors: [REFUSED_WIPE] });

  test("wipe with a wrong password stays", async ({ page, mockApi }) => {
    const admin = new AdminServer();
    await mockApi(adminRoutes(admin));
    await openSystem(page);
    await askToWipe(page, WRONG_PASSWORD);
    const dialog = wipeDialog(page);
    await expect(dialog.getByText("Das Passwort stimmt nicht.")).toBeVisible();
    await expect(dialog.getByLabel(PASSWORD_LABEL)).toBeFocused();
    expect(admin.wipes).toEqual([]);
    await expect(page).toHaveURL(/section=system/);
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.content()).not.toContain(WRONG_PASSWORD);
    await expect(wipeZone(page).getByRole("button", { name: WIPE })).toBeFocused();
  });
});

test("wipe own data lands on the inbox onboarding", async ({ page, mockApi }) => {
  const admin = new AdminServer();
  await mockApi(wipeRoutes(admin));
  await openSystem(page);
  await expect(wipeZone(page).getByRole("radio", { name: "Nur meine Daten" })).toBeChecked();
  await askToWipe(page, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();
  expect(admin.wipes).toEqual([false]);
});

test("Systemfehler: no horizontal scroll, screenshots in both themes", async ({
  page,
  mockApi,
}) => {
  const admin = new AdminServer();
  admin.aiError = "connection";
  await mockApi(adminRoutes(admin));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      // The dialog's fade-in would otherwise still show the page through the panel.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openSystem(page);
      await expect(page.getByText("Der KI-Anbieter war nicht erreichbar.")).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-system-${size}-${scheme}`);
      await wipeZone(page)
        .getByRole("radio", { name: /Alle Benutzer/ })
        .check();
      await wipeZone(page).getByRole("button", { name: WIPE }).click();
      await expect(wipeDialog(page)).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-system-wipe-${size}-${scheme}`);
    }
  }
});
