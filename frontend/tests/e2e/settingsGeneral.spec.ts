import type { Page } from "@playwright/test";
import { TIMEZONE_PATH } from "../../src/api/settingsPaths";
import { DEFAULT_TIMEZONE } from "../../src/domain/settings";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { settingsRow } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const CHOSEN_ZONE = "Europe/Vienna";
// zoneinfo accepts this legacy alias, but Intl.supportedValuesOf lists only canonical names.
const LEGACY_ZONE = "US/Pacific";
const REFUSED_ZONE = "Mars/Olympus";
const TIMEZONE_KEY = `POST ${TIMEZONE_PATH}`;
const LANGUAGE_KEY = "POST /language-preference";

const bodiesOf = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);
const section = (page: Page) => page.locator(".settings-pane");
const zoneSelect = (page: Page) => page.getByLabel("Zeitzone");

async function openGeneral(page: Page): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
}

test("Dunkel switches to dark mode and survives a reload", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.emulateMedia({ colorScheme: "light" });
  await openGeneral(page);
  await section(page).getByRole("button", { name: "Dunkel" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(section(page).getByRole("button", { name: "Dunkel" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

// The section and the user menu share one store, so they never disagree.
test("the user menu shows the theme chosen in Allgemein", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await openGeneral(page);
  await section(page).getByRole("button", { name: "Dunkel" }).click();
  await page.getByRole("button", { name: /admin/ }).click();
  const menu = page.getByRole("dialog", { name: "Benutzermenü" });
  await expect(menu.getByRole("button", { name: "Dunkel" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("English switches the page and stores the language", async ({ page, mockApi }) => {
  const server = new SettingsServer();
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  await section(page).getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "General" })).toBeVisible();
  expect(bodiesOf(log, LANGUAGE_KEY)).toEqual([{ language: "en" }]);
  expect(server.profile.language).toBe("en");
});

test("a new time zone is saved at once and kept after a reload", async ({ page, mockApi }) => {
  const server = new SettingsServer();
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  // Preflight ruling 20: a smoke check that the save leaves the focus on the select. The proof
  // is the unit test with a held POST ("stays focusable and busy"): here the save may finish
  // before the assertion runs.
  await zoneSelect(page).focus();
  await zoneSelect(page).selectOption(CHOSEN_ZONE);
  await expect(page.getByText("Zeitzone gespeichert.")).toBeVisible();
  await expect(zoneSelect(page)).toBeFocused();
  expect(bodiesOf(log, TIMEZONE_KEY)).toEqual([{ timezone: CHOSEN_ZONE }]);
  await page.reload();
  await expect(zoneSelect(page)).toHaveValue(CHOSEN_ZONE);
});

test("a stored legacy zone stays selected until another is chosen", async ({ page, mockApi }) => {
  const server = new SettingsServer(settingsRow({ timezone: LEGACY_ZONE }));
  const log = await mockApi(settingsRoutes(server));
  await openGeneral(page);
  await expect(zoneSelect(page)).toHaveValue(LEGACY_ZONE);
  await zoneSelect(page).selectOption(CHOSEN_ZONE);
  await expect(page.getByText("Zeitzone gespeichert.")).toBeVisible();
  expect(bodiesOf(log, TIMEZONE_KEY)).toEqual([{ timezone: CHOSEN_ZONE }]);
  expect(server.profile.timezone).toBe(CHOSEN_ZONE);
});

// The browser offers only zones Intl knows, so the server's fallback is checked on the fake
// itself; that the select shows the answered zone is the unit test "shows the zone the server
// stored, not the one sent".
test("the fake server stores Europe/Berlin for a zone it refuses", () => {
  const server = new SettingsServer();
  expect(server.saveTimezone({ timezone: REFUSED_ZONE })).toEqual({
    status: "saved",
    timezone: DEFAULT_TIMEZONE,
  });
  expect(server.saveTimezone({ timezone: LEGACY_ZONE }).timezone).toBe(LEGACY_ZONE);
  expect(server.profile.timezone).toBe(LEGACY_ZONE);
});

test("Allgemein: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openGeneral(page);
  await expect(zoneSelect(page)).toHaveValue(DEFAULT_TIMEZONE);
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-general-filled-${size}-${scheme}`);
    }
  }
});
