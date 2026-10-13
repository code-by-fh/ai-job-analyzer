import type { Page } from "@playwright/test";
import {
  STORAGE_DISCONNECT_PATH,
  STORAGE_STATUS_PATH,
  STORAGE_TOGGLE_PATH,
} from "../../src/api/settingsPaths";
import { COLOR_SCHEMES, MOCK_API_PREFIX, SCREENSHOT_SIZES } from "./support/constants";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { settingsRow } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const STATUS_KEY = `GET ${STORAGE_STATUS_PATH}`;
const TOGGLE_KEY = `POST ${STORAGE_TOGGLE_PATH}`;
const DISCONNECT_KEY = `POST ${STORAGE_DISCONNECT_PATH}`;
const CALLBACK_CONNECTED = "/settings?tab=storage&success=google_connected";
const CONNECTED_TEXT = "Google Drive ist verbunden.";
const HTTP_FOUND = 302;
// The fixture row is connected to Drive and stores there (profileFixtures).
const NOT_CONNECTED = {
  google_drive_refresh_token: null,
  google_drive_email: null,
  active_storage_service: "NONE",
};

const callsOf = (log: ApiLog, key: string) => log.calls.filter((call) => call.key === key);
const radio = (page: Page, name: string) => page.getByRole("radio", { name });
const connectButton = (page: Page) =>
  page.getByRole("button", { name: "Mit Google Drive verbinden" });

async function openGeneral(page: Page, url = "/settings"): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
}

test("Drive not configured: its radio is disabled with the reason", async ({ page, mockApi }) => {
  const server = new SettingsServer(settingsRow(NOT_CONNECTED));
  server.driveAvailable = false;
  await mockApi(settingsRoutes(server));
  await openGeneral(page);
  await expect(radio(page, "Google Drive")).toBeDisabled();
  await expect(radio(page, "Datenbank")).toBeChecked();
  await expect(
    page.getByText("Google Drive ist auf diesem Server nicht eingerichtet."),
  ).toBeVisible();
  await expect(connectButton(page)).toHaveCount(0);
});

test("callback connected: one notice, then a clean URL", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openGeneral(page, CALLBACK_CONNECTED);
  await expect(page.getByText(CONNECTED_TEXT)).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await page.reload();
  await expect(radio(page, "Google Drive")).toBeChecked();
  await expect(page.getByText(CONNECTED_TEXT)).toHaveCount(0);
});

test("callback failed: the error notice", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes(new SettingsServer(settingsRow(NOT_CONNECTED))));
  await openGeneral(page, "/settings?error=google_auth_failed");
  const notice = page.locator(".notice-error");
  await expect(notice).toHaveText(
    "Google Drive konnte nicht verbunden werden. Versuche es erneut.",
  );
  await expect(page).toHaveURL(/\/settings$/);
});

test("choosing a service saves it at once", async ({ page, mockApi }) => {
  const server = new SettingsServer();
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  // click, not check(): the controlled radio turns checked on the re-render after the click.
  await radio(page, "Datenbank").click();
  await expect(page.getByText("Speicherort gespeichert.")).toBeVisible();
  await expect(radio(page, "Datenbank")).toBeChecked();
  expect(server.profile.active_storage_service).toBe("NONE");
  await radio(page, "Google Drive").click();
  await expect(radio(page, "Google Drive")).toBeChecked();
  await expect.poll(() => server.profile.active_storage_service).toBe("GOOGLE_DRIVE");
  expect(callsOf(log, TOGGLE_KEY).map((call) => call.body)).toEqual([
    { service: "NONE" },
    { service: "GOOGLE_DRIVE" },
  ]);
});

// Controller ruling R11 (WCAG 3.2.2): no focus move, nothing sent, the hint says why.
test("Drive before connecting: arrowing onto it keeps the focus and sends nothing", async ({
  page,
  mockApi,
}) => {
  const server = new SettingsServer(settingsRow(NOT_CONNECTED));
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  const drive = radio(page, "Google Drive");
  await expect(drive).toHaveAttribute("aria-disabled", "true");
  await expect(drive).toHaveAccessibleDescription(/Erst mit Google Drive verbinden\.$/);
  await radio(page, "Datenbank").focus();
  await page.keyboard.press("ArrowDown");
  await expect(drive).toBeFocused();
  await expect(drive).not.toBeChecked();
  await expect(radio(page, "Datenbank")).toBeChecked();
  // Playwright will not click an aria-disabled control; Space chooses it as a keyboard user would.
  await page.keyboard.press("Space");
  await expect(drive).not.toBeChecked();
  await expect(drive).toBeFocused();
  expect(callsOf(log, TOGGLE_KEY)).toHaveLength(0);
  expect(server.profile.active_storage_service).toBe("NONE");
});

test("Trennen asks and the database becomes active", async ({ page, mockApi }) => {
  const server = new SettingsServer();
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  await expect(page.getByText("Verbunden als drive@example.com")).toBeVisible();
  await page.locator(".settings-pane").getByRole("button", { name: "Trennen" }).click();
  const dialog = page.getByRole("dialog", { name: "Google Drive trennen?" });
  await expect(dialog).toBeVisible();
  expect(callsOf(log, DISCONNECT_KEY)).toHaveLength(0);
  await dialog.getByRole("button", { name: "Trennen" }).click();
  await expect(page.getByText("Google Drive getrennt.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(radio(page, "Datenbank")).toBeChecked();
  await expect(connectButton(page)).toBeFocused();
  expect(server.profile.google_drive_refresh_token).toBeNull();
  expect(server.profile.active_storage_service).toBe("NONE");
});

test("connect refreshes the session, then navigates to the API login", async ({
  page,
  mockApi,
}) => {
  const log = await mockApi(settingsRoutes(new SettingsServer(settingsRow(NOT_CONNECTED))));
  const statusCallsAtLogin: number[] = [];
  // Preflight ruling 39: mockApi cannot answer a redirect, so the login gets its own route.
  await page.route(`**${MOCK_API_PREFIX}/storage/google/login`, (route) => {
    statusCallsAtLogin.push(callsOf(log, STATUS_KEY).length);
    return route.fulfill({ status: HTTP_FOUND, headers: { location: CALLBACK_CONNECTED } });
  });
  await openGeneral(page);
  await expect(connectButton(page)).toBeVisible();
  const statusCallsBefore = callsOf(log, STATUS_KEY).length;
  await connectButton(page).click();
  await expect(page.getByText(CONNECTED_TEXT)).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  expect(statusCallsAtLogin).toEqual([statusCallsBefore + 1]);
});

/** Every SCREENSHOT_SIZES x COLOR_SCHEMES shot, pointer away, no horizontal scroll. */
async function screenshots(page: Page, name: string): Promise<void> {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-storage-${name}-${size}-${scheme}`);
    }
  }
}

test("Speicherort connected: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openGeneral(page);
  await expect(page.getByText("Verbunden als drive@example.com")).toBeVisible();
  await screenshots(page, "connected");
});

test("Speicherort not connected: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes(new SettingsServer(settingsRow(NOT_CONNECTED))));
  await openGeneral(page);
  await expect(connectButton(page)).toBeVisible();
  await screenshots(page, "not-connected");
});
