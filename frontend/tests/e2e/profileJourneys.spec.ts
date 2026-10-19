import type { Page } from "@playwright/test";
import type { ProfileBody } from "../../src/api/profile";
import { SECRET_MASK } from "../../src/api/profilePaths";
import { fixNow, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { E2E_NOTIFICATION_FIELDS, E2E_OTHER_COLUMNS, E2E_SECRETS } from "./support/profileFixtures";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

// Spec section 7: "profile save (notification credentials survive)", plus the hand-offs of the
// CV import and the template fill between the Profil sections. Per-feature assertions live in
// profile*.spec.ts; here one ProfileServer answers every refetch, and each journey asserts the
// requests it sent as well as what it shows.

const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
const STORED_CREDENTIALS = { ...E2E_SECRETS, ...E2E_NOTIFICATION_FIELDS };
const CREDENTIAL_KEYS = Object.keys(STORED_CREDENTIALS);
// What no Profil save may touch: every credential and notification setting, and the
// row's other columns (threshold, job URLs).
const UNTOUCHED = { ...STORED_CREDENTIALS, ...E2E_OTHER_COLUMNS };
const SECRET_VALUES = [...Object.values(E2E_SECRETS), SECRET_MASK];
// The writes journey 1 may make, in order: Ziel, Lebenslauf, the default template.
const JOURNEY_1_WRITES = ["POST /settings", "POST /settings", "PATCH /settings/template"];
const PDF = {
  name: "Lebenslauf.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\nJonas Weber\n"),
};
// Preflight ruling 23: unique against the fixture names, also case-insensitively.
const UPLOADED = "eigenes_layout";
const TEMPLATE = {
  name: `${UPLOADED}.html`,
  mimeType: "text/html",
  buffer: Buffer.from("<html><body><h1>{{ name }}</h1></body></html>"),
};
const EMPTY: ProfileBody = {
  role: "",
  skills: "",
  min_salary: "",
  location: "",
  preferences: "",
  spoken_languages: [],
  cv_data: { experience: [], projects: [], education: "" },
  cv_template: null,
  cover_letter_template: null,
};
const DEFAULT_LINE = "Standard für neue Bewerbungen";

test.beforeEach(async ({ page }) => fixNow(page));

const subNav = (page: Page) => page.getByRole("navigation", { name: "Profilbereiche" });
const saveButton = (page: Page) => page.getByRole("button", { name: "Speichern" });
const cvGallery = (page: Page) => page.getByRole("region", { name: "Lebenslauf" });
const cardOf = (page: Page, name: string) =>
  cvGallery(page).getByRole("listitem").filter({ hasText: name });

async function expectNoSecretOnScreen(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const value of SECRET_VALUES) expect(text).not.toContain(value);
}

/** No save carried a credential key, a secret or the mask (the masked GET must not echo back). */
function expectNoCredentialSent(saved: readonly Record<string, unknown>[]): void {
  for (const body of saved) {
    expect(Object.keys(body).filter((key) => CREDENTIAL_KEYS.includes(key))).toEqual([]);
    for (const value of SECRET_VALUES) expect(JSON.stringify(body)).not.toContain(value);
  }
}

const writes = (log: ApiLog) =>
  log.calls.map((call) => call.key).filter((key) => !key.startsWith("GET "));
const readsOf = (log: ApiLog, key: string) => () =>
  log.requests.filter((request) => request === key).length;

/** Runs `action` and waits until `reads` grew: the page refetched what the action changed. */
async function expectRefetch(reads: () => number, action: () => Promise<void>): Promise<void> {
  // The page's own first read has gone out, so a later one can only be the refetch.
  await expect.poll(reads).toBeGreaterThan(0);
  const before = reads();
  await action();
  await expect.poll(reads).toBeGreaterThan(before);
}

/** Preflight ruling 24: both saves answered and the form clean, so a sub-nav click just leaves. */
async function expectSaved(page: Page, server: ProfileServer, count: number): Promise<void> {
  await expect.poll(() => server.saved.length).toBe(count);
  await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
}

async function saveGoal(page: Page, server: ProfileServer): Promise<void> {
  await page.getByLabel("Wunschrolle").fill("Staff Engineer (Kotlin)");
  await page.getByLabel("Kenntnisse", { exact: true }).fill("Kafka");
  await page.getByLabel("Kenntnisse", { exact: true }).press("Enter");
  await saveButton(page).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await expectSaved(page, server, 1);
}

async function saveEducation(page: Page, server: ProfileServer): Promise<void> {
  await subNav(page).getByRole("link", { name: "Lebenslauf" }).click();
  await page.getByLabel("Ausbildung", { exact: true }).fill("M.Sc. Informatik, TU Hamburg, 2017");
  await saveButton(page).click();
  await expectSaved(page, server, 2);
}

async function chooseDefault(page: Page, name: string): Promise<void> {
  await cardOf(page, name).getByRole("button", { name: "Als Standard" }).click();
  await expect(cardOf(page, name)).toContainText(DEFAULT_LINE);
}

/** Journey 1's requests: three writes, each section only its own keys, no credential echoed. */
function expectJourney1Sent(log: ApiLog, server: ProfileServer): void {
  expect(writes(log)).toEqual(JOURNEY_1_WRITES);
  expect(server.saved.map((body) => Object.keys(body).sort())).toEqual([GOAL_KEYS, ["cv_data"]]);
  expectNoCredentialSent(server.saved);
}

function expectJourney1Stored(server: ProfileServer): void {
  for (const [key, value] of Object.entries(UNTOUCHED)) expect(server.profile[key]).toEqual(value);
  expect(server.profile).toMatchObject({
    role: "Staff Engineer (Kotlin)",
    skills: "Java 21, Kotlin, Spring Boot, PostgreSQL, Kafka",
    cv_data: { education: "M.Sc. Informatik, TU Hamburg, 2017" },
    cv_template: "7",
  });
}

test("profile save (notification credentials survive): Ziel, Lebenslauf and the default template", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile");
  await saveGoal(page, server);
  await saveEducation(page, server);
  await subNav(page).getByRole("link", { name: "Vorlagen" }).click();
  await chooseDefault(page, "Zweispaltig");
  await expect(
    page.getByText("„Zweispaltig“ ist jetzt Standard für neue Bewerbungen."),
  ).toBeVisible();
  await page.reload();
  await expect(cardOf(page, "Zweispaltig")).toContainText(DEFAULT_LINE);
  await expectNoSecretOnScreen(page);
  expectJourney1Sent(log, server);
  expectJourney1Stored(server);
});

async function importCv(page: Page): Promise<void> {
  await page.locator("#pf-cv-import-file").setInputFiles(PDF);
  await expect(page.getByText("Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.")).toBeVisible();
}

test("a first CV import fills Ziel and Lebenslauf and completes the profile", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer(EMPTY);
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await expect(page.getByText(/Noch unvollständig: Wunschrolle, Kenntnisse/)).toBeVisible();
  // The onboarding reads profile_complete from GET /setup-status: it refetches after the import.
  await expectRefetch(readsOf(log, "GET /setup-status"), () => importCv(page));
  await expect(page.getByText(/Noch unvollständig: Wunschrolle/)).toHaveCount(0);
  expect(server.setupStatus().profile_complete).toBe(true);
  await subNav(page).getByRole("link", { name: "Ziel" }).click();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Backend-Entwickler");
  await expect(page.getByRole("button", { name: "Kotlin entfernen" })).toBeVisible();
  expect(writes(log)).toEqual(["POST /settings/upload-cv"]);
});

/** Upload, then the worker ends the fill with a rejected annotation and template_ready arrives. */
async function uploadRejected(page: Page, log: ApiLog, server: ProfileServer): Promise<void> {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  const card = cardOf(page, UPLOADED);
  await expect(card).toContainText("KI setzt Platzhalter ein …");
  await expect(card.getByRole("button", { name: "Als Standard" })).toHaveCount(0);
  const id = server.finishTemplate(UPLOADED, "annotation_rejected");
  pushEvent(log, { type: "template_ready", template_id: id });
  await expect(card).toContainText("Die KI-Platzhalter wurden verworfen.");
  await expect(page.locator(".profile [role=status].sr-only")).toHaveText(
    `„${UPLOADED}“: KI-Platzhalter verworfen.`,
  );
}

async function deleteTemplate(page: Page, name: string): Promise<void> {
  await cardOf(page, name)
    .getByRole("button", { name: `${name} löschen` })
    .click();
  await page
    .getByRole("dialog", { name: "Vorlage löschen?" })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(cardOf(page, name)).toHaveCount(0);
}

test("template upload with live state: fill, rejected annotation, default, delete", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  const profileReads = readsOf(log, "GET /settings");
  await page.goto("/profile?section=vorlagen");
  await uploadRejected(page, log, server);
  // The selection refreshes the profile; waiting for it keeps it out of the delete's count.
  await expectRefetch(profileReads, () => chooseDefault(page, UPLOADED));
  expect(server.profile.cv_template).toBe(String(server.templates.at(-1)!.id));
  // The server reset the default (Task 3): the page reads the profile again after the delete.
  await expectRefetch(profileReads, () => deleteTemplate(page, UPLOADED));
  await expect(cardOf(page, "Klassisch")).toContainText(DEFAULT_LINE);
  expect(server.profile.cv_template).toBeNull();
});
