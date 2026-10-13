import type { Page } from "@playwright/test";
import { SECRET_MASK } from "../../src/api/profilePaths";
import { NOTIFICATION_SETTINGS_PATH } from "../../src/api/settingsPaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { expectNothingLoading, horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { E2E_SECRETS } from "./support/profileFixtures";
import { settingsRow } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const NOTIFICATIONS_URL = "/settings?section=notifications";
const SAVE_KEY = `POST ${NOTIFICATION_SETTINGS_PATH}`;
const NO_MAILJET = { mailjet_api_key: null, mailjet_secret_key: null, mailjet_from_email: null };
const MAILJET = {
  mailjet_api_key: "mj-key-typed",
  mailjet_secret_key: "mj-secret-typed",
  mailjet_from_email: "mj@example.com",
};
const RATE_LIMITED_TEXT = "Zu viele Anfragen, bitte kurz warten.";
const TESTS_PER_MINUTE = 5;

const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Benachrichtigungen" });
const form = (page: Page, name: string) => page.getByRole("form", { name });
const button = (page: Page, name: string) => page.getByRole("button", { name });
const bodiesOf = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

async function openNotifications(page: Page): Promise<void> {
  await page.goto(NOTIFICATIONS_URL);
  await expect(heading(page)).toBeVisible();
  await expect(button(page, "SMTP ändern")).toBeVisible();
}

/** Every page text and every request body: neither the mask nor a stored secret (R4). */
async function expectNoSecret(page: Page, log: ApiLog): Promise<void> {
  const content = await page.content();
  const bodies = JSON.stringify(log.calls.map((call) => call.body));
  for (const leaked of [SECRET_MASK, ...Object.values(E2E_SECRETS)]) {
    expect(content).not.toContain(leaked);
    expect(bodies).not.toContain(leaked);
  }
}

/** Clicks the Pushover test `times` times, each after the previous answer's toast. */
async function testPushover(page: Page, server: SettingsServer, times: number): Promise<void> {
  for (let call = 1; call <= times; call += 1) {
    await button(page, "Test über Pushover senden").click();
    await expect.poll(() => server.tests.length).toBe(call);
  }
}

test("an unconfigured channel's link in the source drawer lands here", async ({
  page,
  mockApi,
}) => {
  await fixNow(page);
  const settings = new SettingsServer(settingsRow(NO_MAILJET));
  await mockApi(sourcesRoutes(new SourcesServer(), settingsRoutes(settings, {}, {})));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const drawer = page.getByRole("dialog", { name: "Quelle StepStone" });
  await drawer.getByRole("link", { name: "In den Einstellungen einrichten" }).click();
  await expect(heading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?section=notifications$/);
  await expect(button(page, "Mailjet einrichten")).toBeVisible();
});

test("set up Mailjet: exactly its three fields are sent and the row turns set up", async ({
  page,
  mockApi,
}) => {
  const server = new SettingsServer(settingsRow(NO_MAILJET));
  const log = await mockApi(settingsRoutes(server));
  await openNotifications(page);
  await button(page, "Mailjet einrichten").click();
  const mailjet = form(page, "Mailjet");
  await mailjet.getByLabel("API-Schlüssel").fill(MAILJET.mailjet_api_key);
  await mailjet.getByLabel("Secret Key").fill(MAILJET.mailjet_secret_key);
  await mailjet.getByLabel("Absender").fill(MAILJET.mailjet_from_email);
  await mailjet.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Eingerichtet · mj@example.com")).toBeVisible();
  await expect(button(page, "Mailjet ändern")).toBeFocused();
  expect(bodiesOf(log, SAVE_KEY)).toEqual([MAILJET]);
  expect(server.channels().MAILJET).toBe(true);
  // The typed secrets left the page with the closed form.
  expect(await page.content()).not.toContain(MAILJET.mailjet_secret_key);
});

test.describe("rate limit", () => {
  // The browser logs every non-2xx answer; the 429 is the answer under test.
  test.use({ allowedConsoleErrors: [/status of 429/] });

  test("the sixth test of a channel says wait", async ({ page, mockApi }) => {
    const server = new SettingsServer();
    await mockApi(settingsRoutes(server));
    await openNotifications(page);
    await testPushover(page, server, TESTS_PER_MINUTE);
    await button(page, "Test über Pushover senden").click();
    await expect(page.getByText(RATE_LIMITED_TEXT)).toBeVisible();
    expect(server.tests).toHaveLength(TESTS_PER_MINUTE);
    expect(server.tests.every((call) => call.channel === "PUSHOVER")).toBe(true);
  });
});

test("an email test sends to the prefilled default recipient", async ({ page, mockApi }) => {
  const server = new SettingsServer();
  await mockApi(settingsRoutes(server));
  await openNotifications(page);
  await button(page, "Test über Resend senden").click();
  const dialog = page.getByRole("dialog", { name: "Test-E-Mail senden" });
  await expect(dialog.getByLabel("Empfänger")).toHaveValue("me@example.com");
  await dialog.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByText("Test über Resend gesendet.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(button(page, "Test über Resend senden")).toBeFocused();
  expect(server.tests).toEqual([{ channel: "RESEND", recipient: "me@example.com" }]);
});

test("Kanal entfernen deletes the credentials and focuses Einrichten", async ({
  page,
  mockApi,
}) => {
  const server = new SettingsServer();
  const log = await mockApi(settingsRoutes(server));
  await openNotifications(page);
  await button(page, "SMTP ändern").click();
  await form(page, "SMTP").getByRole("button", { name: "Kanal entfernen" }).click();
  const dialog = page.getByRole("dialog", { name: "Zugangsdaten für SMTP löschen?" });
  await dialog.getByRole("button", { name: "Kanal entfernen" }).click();
  await expect(page.getByText("Zugangsdaten für SMTP gelöscht.")).toBeVisible();
  await expect(button(page, "SMTP einrichten")).toBeFocused();
  expect(bodiesOf(log, SAVE_KEY)).toEqual([
    {
      smtp_host: null,
      smtp_port: null,
      smtp_user: null,
      smtp_password: null,
      smtp_from_email: null,
    },
  ]);
  expect(server.channels().SMTP).toBe(false);
});

test("no secret or mask in the page or a request", async ({ page, mockApi }) => {
  const log = await mockApi(settingsRoutes());
  await openNotifications(page);
  await button(page, "Pushover ändern").click();
  await expect(form(page, "Pushover").getByLabel("API-Token")).toHaveValue("");
  await expectNoSecret(page, log);
  await button(page, "SMTP ändern").click();
  await form(page, "SMTP").getByLabel("Server").fill("mail.example.org");
  await form(page, "SMTP").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Eingerichtet · mail.example.org")).toBeVisible();
  expect(bodiesOf(log, SAVE_KEY)).toEqual([{ smtp_host: "mail.example.org" }]);
  await expectNoSecret(page, log);
});

test("Benachrichtigungen with an open SMTP form: no horizontal scroll, screenshots", async ({
  page,
  mockApi,
}) => {
  await mockApi(settingsRoutes());
  await openNotifications(page);
  await button(page, "SMTP ändern").click();
  await expect(form(page, "SMTP")).toBeVisible();
  await expectNothingLoading(page);
  await expect(page.getByRole("region", { name: "Pro Quelle" }).getByRole("link")).toBeVisible();
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-channels-smtp-${size}-${scheme}`);
    }
  }
});
