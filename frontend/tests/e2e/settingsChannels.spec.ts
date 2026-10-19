import type { Page } from "@playwright/test";
import { SECRET_MASK } from "../../src/api/profilePaths";
import { CHANNELS_PATH, channelPath } from "../../src/api/notificationPaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { CHANNEL_SECRETS, SMTP_CHANNEL } from "./support/notificationFixtures";
import { NotificationServer } from "./support/notificationServer";
import { expectNothingLoading, horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { E2E_SECRETS } from "./support/profileFixtures";
import { settingsRow } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const NOTIFICATIONS_URL = "/settings?section=notifications";
const CREATE_KEY = `POST ${CHANNELS_PATH}`;
const SMTP_PATCH_KEY = `PATCH ${channelPath(SMTP_CHANNEL.id)}`;
const MAILJET = { api_key: "mj-key-typed", secret_key: "mj-secret-typed" };
const RATE_LIMITED_TEXT = "Zu viele Anfragen, bitte kurz warten.";
const TESTS_PER_MINUTE = 5;
const LEAKS = [
  SECRET_MASK,
  ...Object.values(E2E_SECRETS),
  ...Object.values(CHANNEL_SECRETS).flatMap(Object.values),
];

const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Benachrichtigungen" });
const form = (page: Page, name: string) => page.getByRole("form", { name });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const bodiesOf = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

async function openNotifications(page: Page): Promise<void> {
  await page.goto(NOTIFICATIONS_URL);
  await expect(heading(page)).toBeVisible();
  await expect(button(page, "Firmen-SMTP bearbeiten")).toBeVisible();
}

/** Every page text and every request body: neither a mask nor a stored secret (R4). */
async function expectNoSecret(page: Page, log: ApiLog): Promise<void> {
  const content = await page.content();
  const bodies = JSON.stringify(log.calls.map((call) => call.body));
  for (const leaked of LEAKS) {
    expect(content).not.toContain(leaked);
    expect(bodies).not.toContain(leaked);
  }
}

/** Clicks the Pushover channel's test `times` times, each after the previous answer. */
async function testPushover(page: Page, server: NotificationServer, times: number): Promise<void> {
  for (let call = 1; call <= times; call += 1) {
    await button(page, "Test über Mein Handy senden").click();
    await expect.poll(() => server.tests.length).toBe(call);
  }
}

test("the source drawer's settings link lands here", async ({ page, mockApi }) => {
  await fixNow(page);
  await mockApi(sourcesRoutes(new SourcesServer(), settingsRoutes(new SettingsServer(), {}, {})));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const drawer = page.getByRole("dialog", { name: "Quelle StepStone" });
  await drawer.getByRole("link", { name: "Kanäle in den Einstellungen verwalten" }).click();
  await expect(heading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?section=notifications$/);
  await expect(button(page, "Kanal hinzufügen")).toBeVisible();
});

test("add a Mailjet channel: the typed fields are sent and the row appears focused", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer(settingsRow());
  const log = await mockApi(settingsRoutes(settings));
  await openNotifications(page);
  await button(page, "Kanal hinzufügen").click();
  const created = form(page, "Neuer Kanal");
  await created.getByLabel("Art").selectOption({ label: "E-Mail (Mailjet)" });
  await created.getByLabel("Name").fill("Mailjet Jobs");
  await created.getByLabel("API-Schlüssel").fill(MAILJET.api_key);
  await created.getByLabel("Secret Key").fill(MAILJET.secret_key);
  await created.getByLabel("Absender-Adresse").fill("mj@example.com");
  await created.getByLabel("Empfänger").fill("ich@example.com, team@example.com");
  await created.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Kanal angelegt.")).toBeVisible();
  await expect(button(page, "Mailjet Jobs bearbeiten")).toBeFocused();
  expect(bodiesOf(log, CREATE_KEY)).toEqual([
    {
      type: "mailjet",
      name: "Mailjet Jobs",
      fields: {
        ...MAILJET,
        from_email: "mj@example.com",
        recipients: ["ich@example.com", "team@example.com"],
      },
    },
  ]);
  // The typed secrets left the page with the closed form.
  expect(await page.content()).not.toContain(MAILJET.secret_key);
});

test.describe("rate limit", () => {
  // The browser logs every non-2xx answer; the 429 is the answer under test.
  test.use({ allowedConsoleErrors: [/status of 429/] });

  test("the sixth test says wait", async ({ page, mockApi }) => {
    const settings = new SettingsServer();
    await mockApi(settingsRoutes(settings));
    await openNotifications(page);
    await testPushover(page, settings.notifications, TESTS_PER_MINUTE);
    await button(page, "Test über Mein Handy senden").click();
    await expect(page.getByText(RATE_LIMITED_TEXT)).toBeVisible();
    expect(settings.notifications.tests).toHaveLength(TESTS_PER_MINUTE);
  });
});

test("a test that was not delivered names the reason in a fixed sentence", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer();
  settings.notifications.testReasons.set(SMTP_CHANNEL.id, "unreachable");
  await mockApi(settingsRoutes(settings));
  await openNotifications(page);
  await button(page, "Test über Firmen-SMTP senden").click();
  await expect(page.getByText("Der Server von Firmen-SMTP ist nicht erreichbar.")).toBeVisible();
  expect(settings.notifications.tests).toEqual([{ channelId: SMTP_CHANNEL.id }]);
});

test("Kanal löschen deletes the channel and focuses Kanal hinzufügen", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer();
  await mockApi(settingsRoutes(settings));
  await openNotifications(page);
  await button(page, "Firmen-SMTP bearbeiten").click();
  await form(page, "Firmen-SMTP").getByRole("button", { name: "Kanal löschen" }).click();
  const dialog = page.getByRole("dialog", { name: "Kanal „Firmen-SMTP“ löschen?" });
  await dialog.getByRole("button", { name: "Kanal löschen" }).click();
  await expect(page.getByText("Kanal gelöscht.")).toBeVisible();
  await expect(button(page, "Kanal hinzufügen")).toBeFocused();
  await expect(page.getByText("Firmen-SMTP", { exact: true })).toHaveCount(0);
  expect(settings.notifications.ids()).not.toContain(SMTP_CHANNEL.id);
});

test("a stored secret is only 'gesetzt': no secret or mask in the page or a request", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer();
  const log = await mockApi(settingsRoutes(settings));
  await openNotifications(page);
  await button(page, "Mein Handy bearbeiten").click();
  await expect(page.getByRole("group", { name: "API-Token" })).toContainText("gesetzt");
  await expectNoSecret(page, log);
  await button(page, "Mein Handy schließen").click();
  await button(page, "Firmen-SMTP bearbeiten").click();
  await form(page, "Firmen-SMTP").getByLabel("SMTP-Server").fill("mail.example.org");
  await form(page, "Firmen-SMTP").getByRole("button", { name: "Speichern" }).click();
  await expect(button(page, "Firmen-SMTP bearbeiten")).toBeFocused();
  expect(bodiesOf(log, SMTP_PATCH_KEY)).toEqual([{ fields: { host: "mail.example.org" } }]);
  expect(settings.notifications.valueOf(SMTP_CHANNEL.id, "password")).toBe(
    E2E_SECRETS.smtp_password,
  );
  await expectNoSecret(page, log);
});

test.describe("service down", () => {
  test.use({ allowedConsoleErrors: [/status of 502/] });

  test("the channel list says the service is unreachable", async ({ page, mockApi }) => {
    const settings = new SettingsServer();
    settings.notifications.down = true;
    await mockApi(settingsRoutes(settings));
    await page.goto(NOTIFICATIONS_URL);
    const channels = page.getByRole("region", { name: "Kanäle" });
    await expect(
      channels.getByText(/Der Benachrichtigungsdienst ist gerade nicht erreichbar/),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test("Benachrichtigungen with an open SMTP form: no horizontal scroll, screenshots", async ({
  page,
  mockApi,
}) => {
  await mockApi(settingsRoutes());
  await openNotifications(page);
  await button(page, "Firmen-SMTP bearbeiten").click();
  await expect(form(page, "Firmen-SMTP")).toBeVisible();
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

test("a new channel's form: no horizontal scroll, screenshots", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await openNotifications(page);
  await button(page, "Kanal hinzufügen").click();
  await form(page, "Neuer Kanal").getByLabel("Art").selectOption({ label: "E-Mail (SMTP)" });
  await expectNothingLoading(page);
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-channels-new-${size}-${scheme}`);
    }
  }
});
