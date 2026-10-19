import type { Locator, Page } from "@playwright/test";
import { CHANNELS_PATH, channelPath } from "../../src/api/notificationPaths";
import { NOTIFICATION_TEMPLATES_PATH, platformPath } from "../../src/api/platformPaths";
import { SECRET_MASK } from "../../src/api/profilePaths";
import { fixNow } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { CHANNEL_SECRETS, SMTP_CHANNEL } from "./support/notificationFixtures";
import { NotificationServer } from "./support/notificationServer";
import { STEPSTONE } from "./support/platformFixtures";
import { E2E_SECRETS } from "./support/profileFixtures";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import type { SettingsRow } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, SANDBOX_PROBE, test } from "./support/test";

// Spec section 7: "profile save (notification credentials survive)" and "settings channels",
// plus the template and keyboard hand-offs (preflight ruling 34). Per-section assertions live in
// settings*.spec.ts; here each journey crosses sections or pages on one fake server state.

const NOTIFICATIONS_URL = "/settings?section=notifications";
const SOURCE_URL = `/sources?quelle=${STEPSTONE.id}`;
const SMTP_HOST = "mail.example.org";
const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
// What neither page may change in the shared row (ruling 34).
const KEPT_KEYS = [...Object.keys(E2E_SECRETS), "email_global_recipient"];
const LEAKS = [
  SECRET_MASK,
  ...Object.values(E2E_SECRETS),
  ...Object.values(CHANNEL_SECRETS).flatMap(Object.values),
];
const SMTP_PATCH_KEY = `PATCH ${channelPath(SMTP_CHANNEL.id)}`;
const MAILJET = {
  type: "mailjet",
  name: "Mailjet Jobs",
  fields: {
    api_key: "mj-key-typed",
    secret_key: "mj-secret-typed",
    from_email: "mj@example.com",
    recipients: ["mj@example.com"],
  },
};
const WEEKLY = { name: "Wochenmail", content: "{{#jobs}}$title{{/jobs}}" };
const WEEKLY_EDITED = "{{#jobs}}$title bei $company{{/jobs}}";
const RECIPIENT = "ich@example.com";
const COPY_HINT =
  "Quellen behalten ihre Kopie. Wähle die Vorlage in der Quelle erneut, damit sie den geänderten Text verwendet.";
const KEPT_COPY = "Eigene Vorlage (beibehalten)";
// Ruling 34: the Tab walk to "Firmen-SMTP bearbeiten" is bounded.
const MAX_TABS = 15;

const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Benachrichtigungen" });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const form = (page: Page, name: string) => page.getByRole("form", { name });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const notify = (page: Page) => drawer(page).getByRole("form", { name: "Benachrichtigungen" });
const bodiesOf = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

async function openNotifications(page: Page): Promise<void> {
  await page.goto(NOTIFICATIONS_URL);
  await expect(heading(page)).toBeVisible();
  await expect(button(page, "Firmen-SMTP bearbeiten")).toBeVisible();
}

/** No channel form is open here: a typed secret would sit in an input's value until close. */
async function expectNoSecret(page: Page, log: ApiLog): Promise<void> {
  const content = await page.content();
  const bodies = JSON.stringify(log.calls.map((call) => call.body));
  for (const leaked of LEAKS) {
    expect(content).not.toContain(leaked);
    expect(bodies).not.toContain(leaked);
  }
}

async function changeSmtpHost(page: Page): Promise<void> {
  await button(page, "Firmen-SMTP bearbeiten").click();
  await form(page, "Firmen-SMTP").getByLabel("SMTP-Server").fill(SMTP_HOST);
  await form(page, "Firmen-SMTP").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
}

async function expectSmtpHost(page: Page): Promise<void> {
  await button(page, "Firmen-SMTP bearbeiten").click();
  await expect(form(page, "Firmen-SMTP").getByLabel("SMTP-Server")).toHaveValue(SMTP_HOST);
  await button(page, "Firmen-SMTP schließen").click();
}

/** Opened without typing: nothing to save, so nothing is sent. */
async function openPushoverUntouched(page: Page): Promise<void> {
  await button(page, "Mein Handy bearbeiten").click();
  const save = form(page, "Mein Handy").getByRole("button", { name: "Speichern" });
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await button(page, "Mein Handy schließen").click();
  await expect(button(page, "Mein Handy bearbeiten")).toHaveAttribute("aria-expanded", "false");
}

async function saveGoalAndDefault(page: Page, profile: ProfileServer): Promise<void> {
  await page.goto("/profile");
  await page.getByLabel("Wunschrolle").fill("Staff Engineer (Kotlin)");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(() => profile.saved.length).toBe(1);
  await page
    .getByRole("navigation", { name: "Profilbereiche" })
    .getByRole("link", { name: "Vorlagen" })
    .click();
  const card = page
    .getByRole("region", { name: "Lebenslauf" })
    .getByRole("listitem")
    .filter({ hasText: "Zweispaltig" });
  await card.getByRole("button", { name: "Als Standard" }).click();
  await expect(card).toContainText("Standard für neue Bewerbungen");
}

function expectRowKept(row: SettingsRow, before: SettingsRow): void {
  for (const key of KEPT_KEYS) expect(row[key]).toEqual(before[key]);
}

test("profile save (notification credentials survive): SMTP host, Ziel and a default template on one row", async ({
  page,
  mockApi,
}) => {
  await fixNow(page);
  const profile = new ProfileServer();
  const settings = new SettingsServer(profile.profile);
  const before = structuredClone(profile.profile);
  const log = await mockApi(profileRoutes(profile, settingsRoutes(settings, {}, {})));
  await openNotifications(page);
  await changeSmtpHost(page);
  await openPushoverUntouched(page);
  await expectNoSecret(page, log);
  await saveGoalAndDefault(page, profile);
  await expectNoSecret(page, log);
  await openNotifications(page);
  await page.reload();
  await expectSmtpHost(page);
  await expectNoSecret(page, log);
  expect(bodiesOf(log, SMTP_PATCH_KEY)).toEqual([{ fields: { host: SMTP_HOST } }]);
  expect(profile.saved.map((body) => Object.keys(body).sort())).toEqual([GOAL_KEYS]);
  expectRowKept(profile.profile, before);
});

async function setUpMailjet(page: Page, log: ApiLog): Promise<void> {
  await button(page, "Kanal hinzufügen").click();
  const mailjet = form(page, "Neuer Kanal");
  await mailjet.getByLabel("Art").selectOption({ label: "E-Mail (Mailjet)" });
  await mailjet.getByLabel("Name").fill(MAILJET.name);
  await mailjet.getByLabel("API-Schlüssel").fill(MAILJET.fields.api_key);
  await mailjet.getByLabel("Secret Key").fill(MAILJET.fields.secret_key);
  await mailjet.getByLabel("Absender-Adresse").fill(MAILJET.fields.from_email);
  await mailjet.getByLabel("Empfänger").fill(MAILJET.fields.recipients[0]!);
  await mailjet.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Kanal angelegt.")).toBeVisible();
  expect(bodiesOf(log, `POST ${CHANNELS_PATH}`)).toEqual([MAILJET]);
}

async function testMailjet(page: Page, settings: SettingsServer): Promise<void> {
  await button(page, `Test über ${MAILJET.name} senden`).click();
  await expect(page.getByText(`Test über ${MAILJET.name} gesendet.`)).toBeVisible();
  expect(settings.notifications.tests).toHaveLength(1);
}

test("settings channels: set up Mailjet from a source, test it, then the source can use it", async ({
  page,
  mockApi,
}) => {
  await fixNow(page);
  const settings = new SettingsServer(undefined, new NotificationServer([]));
  const sources = new SourcesServer();
  const log = await mockApi(sourcesRoutes(sources, settingsRoutes(settings, {}, {})));
  await page.goto(SOURCE_URL);
  await expect(notify(page).getByText(/Noch kein Kanal eingerichtet/)).toBeVisible();
  await drawer(page).getByRole("link", { name: "In den Einstellungen einrichten" }).click();
  await expect(heading(page)).toBeVisible();
  await setUpMailjet(page, log);
  await testMailjet(page, settings);
  await page.goBack();
  await notify(page).getByLabel(`${MAILJET.name} benachrichtigen`).check();
  await notify(page).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect(sources.get(STEPSTONE.id).notification_channel_ids).toEqual(settings.notifications.ids());
});

async function createWeekly(page: Page, log: ApiLog): Promise<void> {
  await button(page, "Neue Vorlage").click();
  const editor = form(page, "Neue Vorlage");
  await editor.getByLabel("Name").fill(WEEKLY.name);
  await editor.getByRole("button", { name: "E-Mail", exact: true }).click();
  await editor.getByLabel("Text").fill(WEEKLY.content);
  await editor.getByRole("button", { name: "Vorschau" }).click();
  const preview = page.getByRole("dialog", { name: "Vorschau" });
  await expect(preview.frameLocator("iframe[title='Vorschau']").locator("body")).toContainText(
    "Senior Software Engineer",
  );
  await page.keyboard.press("Escape");
  await expect(editor.getByRole("button", { name: "Vorschau" })).toBeFocused();
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Vorlage gespeichert.")).toBeVisible();
  expect(bodiesOf(log, `POST ${NOTIFICATION_TEMPLATES_PATH}`)).toEqual([
    { ...WEEKLY, type: "RESEND" },
  ]);
}

const resendSelect = (page: Page) => notify(page).getByLabel("Vorlage für E-Mail (Resend)");

async function pickWeeklyInSource(page: Page, log: ApiLog): Promise<void> {
  await page.goto(SOURCE_URL);
  await notify(page).getByLabel("Bewerbungs-Mail benachrichtigen").check();
  await notify(page).getByLabel("Empfänger für E-Mail (Resend)").fill(RECIPIENT);
  await resendSelect(page).selectOption({ label: WEEKLY.name });
  await notify(page).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  const patches = bodiesOf(log, `PATCH ${platformPath(STEPSTONE.id)}`) as SettingsRow[];
  expect(patches.map((patch) => patch.resend_template)).toEqual([WEEKLY.content]);
}

async function editWeekly(page: Page, log: ApiLog, id: number): Promise<void> {
  await openNotifications(page);
  await button(page, `${WEEKLY.name} bearbeiten`).click();
  await form(page, WEEKLY.name).getByLabel("Text").fill(WEEKLY_EDITED);
  await expect(page.getByText(COPY_HINT)).toBeVisible();
  await form(page, WEEKLY.name).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Vorlage gespeichert.")).toBeVisible();
  expect(bodiesOf(log, `PUT ${NOTIFICATION_TEMPLATES_PATH}/${id}`)).toEqual([
    { name: WEEKLY.name, content: WEEKLY_EDITED },
  ]);
}

async function deleteWeekly(page: Page): Promise<void> {
  await button(page, `${WEEKLY.name} löschen`).click();
  await page
    .getByRole("dialog", { name: `„${WEEKLY.name}“ löschen?` })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(page.getByText("Vorlage gelöscht.")).toBeVisible();
  await expect(heading(page)).toBeFocused();
}

test.describe("template round trip", () => {
  // Chromium logs one line per Playwright probe into the script-less preview frame.
  test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

  test("create, preview, pick in a source, edit, delete: the source keeps its copy", async ({
    page,
    mockApi,
  }) => {
    await fixNow(page);
    const settings = new SettingsServer();
    const sources = new SourcesServer();
    const log = await mockApi(sourcesRoutes(sources, settingsRoutes(settings, {}, {})));
    await openNotifications(page);
    await createWeekly(page, log);
    const id = settings.templates.find((template) => template.name === WEEKLY.name)!.id;
    await pickWeeklyInSource(page, log);
    await editWeekly(page, log, id);
    await deleteWeekly(page);
    await page.goto(SOURCE_URL);
    await notify(page).getByLabel("Bewerbungs-Mail benachrichtigen").check();
    await expect(resendSelect(page).locator("option", { hasText: WEEKLY.name })).toHaveCount(0);
    await expect(resendSelect(page).locator("option:checked")).toHaveText(KEPT_COPY);
    expect(sources.get(STEPSTONE.id).resend_template).toBe(WEEKLY.content);
  });
});

/** Ruling 34: after every key, focus is on an element, never on <body>. */
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
}

async function typeKeys(page: Page, text: string): Promise<void> {
  for (const key of text) await press(page, key);
}

const isFocused = (target: Locator) =>
  target.evaluate((element) => element === document.activeElement);

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < MAX_TABS; presses += 1) {
    await press(page, "Tab");
    if (await isFocused(target)) return;
  }
  throw new Error(`not reached within ${MAX_TABS} Tab presses`);
}

async function openSmtpByKeyboard(page: Page): Promise<void> {
  const subNav = page.getByRole("navigation", { name: "Einstellungsbereiche" });
  await subNav.getByRole("link", { name: "Allgemein" }).focus();
  await press(page, "Tab");
  await expect(subNav.getByRole("link", { name: "Benachrichtigungen" })).toBeFocused();
  await press(page, "Enter");
  await expect(heading(page)).toBeVisible();
  await tabTo(page, button(page, "Firmen-SMTP bearbeiten"));
  await press(page, "Enter");
  await expect(button(page, "Firmen-SMTP schließen")).toHaveAttribute("aria-expanded", "true");
}

test("keyboard only: from the sub-nav to a saved SMTP host and a test send", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer();
  await mockApi(settingsRoutes(settings));
  await page.goto("/settings");
  await openSmtpByKeyboard(page);
  await press(page, "Tab");
  await expect(form(page, "Firmen-SMTP").getByLabel("Name", { exact: true })).toBeFocused();
  await press(page, "Tab");
  await expect(form(page, "Firmen-SMTP").getByLabel("SMTP-Server")).toBeFocused();
  await press(page, "ControlOrMeta+a");
  await typeKeys(page, SMTP_HOST);
  await press(page, "Enter");
  await expect(button(page, "Firmen-SMTP bearbeiten")).toBeFocused();
  expect(settings.notifications.valueOf(SMTP_CHANNEL.id, "host")).toBe(SMTP_HOST);
  await press(page, "Shift+Tab");
  await expect(button(page, "Test über Firmen-SMTP senden")).toBeFocused();
  await press(page, "Enter");
  await expect(page.getByText("Test über Firmen-SMTP gesendet.")).toBeVisible();
  await expect(button(page, "Test über Firmen-SMTP senden")).toBeFocused();
});
