import type { Locator, Page } from "@playwright/test";
import { AI_TASKS } from "../../src/api/adminPaths";
import { AdminServer, adminRoutes } from "./support/adminServer";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { CS_USERS, CompaniesServer, companiesRoutes } from "./support/companiesServer";
import { E2E_BASE_URL, MOCK_API_PREFIX } from "./support/constants";
import { inboxRoutes } from "./support/inboxFixtures";
import {
  COMPANY_PROFILE,
  JOB_ID,
  fixNow,
  jobBody,
  jobRoutes,
  jobUrl,
  pushEvent,
} from "./support/jobFixtures";
import type { ApiLog, MockRoutes } from "./support/mockApi";
import { MEMBER } from "./support/settingsFixtures";
import { settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

// Spec section 7 journeys "admin" and "company research", preflight ruling 31. Per-section
// assertions live in admin*.spec.ts, compan*.spec.ts and search.spec.ts; each journey here crosses
// sections or pages on one fake server state.

const TYPED_KEY = "sk-or-e2e-geheim";
const SECRET_MASK = "__masked__";
const CLOUD = "OpenRouter";
const LOCAL = "Lokales Modell (LM Studio, Ollama)";
const TASKS = "Aufgaben";
const CLOUD_MODEL = "openai/gpt-4o-mini";
const LOCAL_URL = "http://llm.lan:1234/v1";
const LOCAL_MODELS = Array.from({ length: 12 }, (_, index) => `modell-${index + 1}`);
const SHOWN_MODELS = 10;
const NEW_USER = "jonas";
const NEW_PASSWORD = "e2e-passwort-neu";
// R8c: the web ignores the event's message; the page shows only the fixed sentence.
const RAW_PROVIDER_TEXT = "raw provider text";
const CALM = "Zurzeit kein KI-Fehler.";
const AUTH_SENTENCE = "Der KI-Anbieter hat die Anmeldung abgelehnt. Prüfe den Schlüssel.";
const ADMIN_URLS = ["/settings?section=ai", "/settings?section=users", "/settings?section=system"];
const ADMIN_REQUEST = /^\w+ \/(admin|users)\b/;
// A company without a profile answers 404 and Chromium logs that response.
const MISSING_PROFILE = /status of 404/;
const HTTP_NOT_FOUND = 404;
const RUNNING = /Firmenrecherche läuft/;
const DEEP_DIVE_RESULT = "## Gehaltsband\nSenior Backend liegt bei **75-90 Tsd.** Euro.";
const RESEARCHED_AT = "2026-10-09T08:00:00+00:00";
const SEARCH_TEXT = "kotl";
const FOCUS_MARK = "focus-before-search";
const ACME_JOB = jobBody({ status: "DRAFTED", company_domain: "acme.de" });

const subNav = (page: Page) => page.getByRole("navigation", { name: "Einstellungsbereiche" });
const form = (page: Page, name: string) => page.getByRole("form", { name });
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const h2 = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });
const searchDialog = (page: Page) => page.getByRole("dialog", { name: "Suche" });
const focusOnBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);
const companyRow = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Firmen" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });

/** Ruling 31 J1: every FakeServer under one page, the settings frame's queries included. */
function allRoutes(admin: AdminServer, companies: CompaniesServer, extra: MockRoutes = {}) {
  return adminRoutes(admin, extra, companiesRoutes(companies, {}, settingsRoutes()));
}

async function openSection(page: Page, link: string) {
  await subNav(page).getByRole("link", { name: link, exact: true }).click();
  await expect(h2(page, link)).toBeVisible();
}

/** R4: secrets are write-only; neither the typed nor any mask ever lands in the page. */
async function expectNoSecretOnPage(page: Page) {
  const html = await page.content();
  expect(html).not.toContain(TYPED_KEY);
  expect(html).not.toContain(SECRET_MASK);
}

async function saveCloud(page: Page) {
  const cloud = form(page, CLOUD);
  await cloud.getByLabel("API-Schlüssel").fill(TYPED_KEY);
  await cloud.getByLabel("Modell").fill(CLOUD_MODEL);
  await cloud.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("KI-Einstellungen gespeichert.")).toBeVisible();
  await expect(cloud.getByLabel("API-Schlüssel")).toHaveValue("");
  await expect(cloud.getByText("Gespeichert. Leer lassen, um ihn zu behalten.")).toBeVisible();
  await cloud.getByRole("button", { name: "Verbindung prüfen" }).click();
  await expect(cloud.locator(".conn-result")).toHaveText(`Verbindung steht · ${CLOUD_MODEL}`);
}

async function saveLocal(page: Page, admin: AdminServer) {
  const local = form(page, LOCAL);
  await local.getByLabel("Adresse").fill(LOCAL_URL);
  await local.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(() => admin.answer().ollama_base_url).toBe(LOCAL_URL);
  await expect(local.getByText("Erst speichern.")).toHaveCount(0);
  admin.nextResult.local = { ok: true, model_found: false, available_models: LOCAL_MODELS };
  await local.getByRole("button", { name: "Verbindung prüfen" }).click();
  const shown = LOCAL_MODELS.slice(0, SHOWN_MODELS).join(", ");
  await expect(local.locator(".conn-result")).toHaveText(
    `Modell nicht gefunden. Verfügbar: ${shown} und 2 weitere`,
  );
}

async function routeLocally(page: Page, admin: AdminServer) {
  const tasks = form(page, TASKS);
  const lokal = (task: string) =>
    tasks.getByRole("group", { name: `Anbieter für ${task}` }).getByRole("button", {
      name: "Lokal",
    });
  await expect(lokal("Lebenslauf anpassen")).toHaveAttribute("aria-pressed", "true");
  await lokal("Stellen bewerten").click();
  await tasks.getByRole("button", { name: "Speichern" }).click();
  // The toasts of the earlier saves may still be up: wait on the server, not on a toast.
  await expect.poll(() => admin.saved.at(-1)?.ai_task_routing).toBeDefined();
  const routing = admin.saved.at(-1)?.ai_task_routing as Record<string, string>;
  expect(Object.keys(routing).sort()).toEqual([...AI_TASKS].sort());
  expect(routing).toMatchObject({ cv_tailoring: "local", job_analysis: "local" });
}

async function createAndDeleteUser(page: Page, admin: AdminServer) {
  const create = form(page, "Benutzer anlegen");
  await create.getByLabel("Benutzername").fill(NEW_USER);
  await create.getByLabel("Passwort").fill(NEW_PASSWORD);
  await create.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Benutzer angelegt.")).toBeVisible();
  const users = page.getByRole("list", { name: "Benutzer" });
  await users.getByRole("button", { name: `${NEW_USER} löschen` }).click();
  await page
    .getByRole("dialog", { name: `${NEW_USER} löschen?` })
    .getByRole("button", { name: "Benutzer löschen" })
    .click();
  await expect(page.getByText("Benutzer gelöscht.")).toBeVisible();
  await expect(users.getByText(NEW_USER, { exact: true })).toHaveCount(0);
  expect(admin.users.map((user) => user.username)).not.toContain(NEW_USER);
}

async function resetAiError(page: Page, admin: AdminServer, log: ApiLog) {
  await expect(page.getByText(CALM)).toBeVisible();
  await connected(log);
  admin.aiError = "auth";
  pushEvent(log, { type: "ai_error", message: `OpenRouter: 401 ${RAW_PROVIDER_TEXT}` });
  await expect(page.getByText(AUTH_SENTENCE)).toBeVisible();
  await expect(page.getByText(RAW_PROVIDER_TEXT)).toHaveCount(0);
  await page.getByRole("button", { name: "Fehler zurücksetzen" }).click();
  pushEvent(log, { type: "ai_error_cleared" });
  await expect(page.getByText(CALM)).toBeVisible();
  expect(admin.aiError).toBeNull();
}

/** The key leaves the browser once, in the save that typed it; no body carries a mask. */
function expectKeySentOnce(log: ApiLog) {
  const bodies = (needle: string) =>
    log.calls.filter((call) => JSON.stringify(call.body ?? null).includes(needle));
  expect(bodies(TYPED_KEY).map((call) => call.key)).toEqual(["POST /admin/settings"]);
  expect(bodies(SECRET_MASK)).toEqual([]);
}

test("J1 admin: AI providers, routing, a user and the AI error", async ({ page, mockApi }) => {
  const admin = new AdminServer(null);
  const log = await mockApi(allRoutes(admin, new CompaniesServer()));
  await page.goto("/settings?section=ai");
  await expect(h2(page, "KI")).toBeVisible();
  await saveCloud(page);
  await expectNoSecretOnPage(page);
  await saveLocal(page, admin);
  await routeLocally(page, admin);
  await expectNoSecretOnPage(page);
  await openSection(page, "Benutzer");
  await createAndDeleteUser(page, admin);
  await expectNoSecretOnPage(page);
  await openSection(page, "Systemfehler");
  await resetAiError(page, admin, log);
  await expectNoSecretOnPage(page);
  expectKeySentOnce(log);
});

/** Every request URL the page sends: a query like scope=all is not part of a plain log key. */
function collectUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

async function expectMemberView(page: Page, url: string) {
  await page.goto(url);
  const landing = url.startsWith("/companies") ? h1(page, "Firmen") : h2(page, "Allgemein");
  await expect(landing).toBeVisible();
  await expect(page.getByText("Administration")).toHaveCount(0);
}

test("J2 member: every admin URL lands on Allgemein, no admin request", async ({
  page,
  mockApi,
}) => {
  const urls = collectUrls(page);
  const log = await mockApi(
    allRoutes(new AdminServer(), new CompaniesServer(), { "GET /me": { body: MEMBER } }),
  );
  for (const url of [...ADMIN_URLS, "/companies?alle=1"]) await expectMemberView(page, url);
  await expect(page.getByRole("link", { name: "ACME GmbH", exact: true })).toBeVisible();
  expect(log.requests.filter((key) => ADMIN_REQUEST.test(key))).toEqual([]);
  expect(urls.filter((url) => url.includes("scope=all"))).toEqual([]);
});

/** From the job's Firma tab over the detail's back link to the list, onto a company without a profile. */
async function jobToUnresearchedCompany(page: Page) {
  await page.goto(jobUrl("firma"));
  await expect(page.getByRole("heading", { name: "Gesamtbewertung" })).toBeVisible();
  await page.getByRole("link", { name: "Alle Firmen" }).click();
  await expect(h1(page, "ACME GmbH")).toBeVisible();
  await page.getByRole("link", { name: "Alle Firmen" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies`);
  await expect(companyRow(page, "Initech AG")).toContainText("Noch nicht recherchiert");
  await page.getByRole("link", { name: "Initech AG", exact: true }).click();
  await expect(h1(page, "Initech AG")).toBeVisible();
}

async function researchInitech(page: Page, companies: CompaniesServer, log: ApiLog) {
  await page.getByRole("button", { name: "Firma recherchieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: RUNNING })).toBeVisible();
  expect(companies.researchStarts).toEqual([{ domain: "initech.de", force: false }]);
  companies.profiles["initech.de"] = {
    ...structuredClone(COMPANY_PROFILE),
    domain: "initech.de",
    name: "Initech AG",
    analyzed_at: RESEARCHED_AT,
  };
  await connected(log);
  pushEvent(log, { type: "company_profile_ready", domain: "initech.de" });
  await expect(
    page.getByText("Solider Mittelständler mit wachsendem Plattform-Team."),
  ).toBeVisible();
  await expect(page.getByText(RUNNING)).toHaveCount(0);
  await expect.poll(() => focusOnBody(page)).toBe(false);
}

async function runFirstDeepDive(page: Page, log: ApiLog) {
  await page.getByRole("button", { name: "Gehaltsband" }).click();
  await page.getByRole("button", { name: "Jetzt recherchieren" }).click();
  await expect(page.getByText("75-90 Tsd.")).toBeVisible();
  const sent = log.calls.find((call) => call.key === "POST /companies/initech.de/deep-dive");
  expect(sent?.body).toMatchObject({ focus: "Gehalt Senior Backend", company_name: "Initech AG" });
}

test.describe("company research", () => {
  test.use({ allowedConsoleErrors: [MISSING_PROFILE] });

  test("J3 company research: job, list, research, deep dive, back to the list", async ({
    page,
    mockApi,
  }) => {
    await fixNow(page);
    const companies = new CompaniesServer();
    const deepDive = {
      "POST /companies/initech.de/deep-dive": { body: { result: DEEP_DIVE_RESULT } },
    };
    const log = await mockApi(companiesRoutes(companies, deepDive, jobRoutes(ACME_JOB)));
    await jobToUnresearchedCompany(page);
    await researchInitech(page, companies, log);
    await runFirstDeepDive(page, log);
    await page.getByRole("link", { name: "Alle Firmen" }).click();
    await expect(companyRow(page, "Initech AG")).toContainText(
      "initech.de · Recherchiert am 09.10.2026 · 1 Stelle",
    );
  });

  test("J4 profile maintenance: rename, delete, the member's job still offers research", async ({
    page,
    mockApi,
  }) => {
    const companies = new CompaniesServer();
    await mockApi(companiesRoutes(companies, {}, jobRoutes(ACME_JOB)));
    await page.goto("/companies?domain=acme.de");
    await renameAcme(page);
    await page.reload();
    await expect(h1(page, "ACME SE")).toBeVisible();
    await deleteAcme(page);
    expect(companies.jobs.filter((job) => job.company_domain === "acme.de")).toHaveLength(2);
    companies.setMember();
    await expectMemberOffersResearch(page);
  });
});

/** The member's job keeps its domain, the shared profile is gone for them too: research is offered. */
async function expectMemberOffersResearch(page: Page) {
  const profile = page.waitForResponse((response) =>
    response.url().endsWith(`${MOCK_API_PREFIX}/companies/acme.de`),
  );
  await page.goto(jobUrl("firma"));
  expect((await profile).status()).toBe(HTTP_NOT_FOUND);
  await expect(
    page.getByRole("heading", { level: 3, name: "Stimmt die Web-Adresse?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Web-Adresse der Firma")).toHaveValue("acme.de");
  await expect(page.getByRole("button", { name: "Firma recherchieren" })).toBeVisible();
}

async function renameAcme(page: Page) {
  await page.getByRole("button", { name: "Umbenennen" }).click();
  const dialog = page.getByRole("dialog", { name: "Firmenprofil umbenennen" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("ACME SE");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(h1(page, "ACME SE")).toBeVisible();
}

async function deleteAcme(page: Page) {
  await page.getByRole("button", { name: "Profil löschen" }).click();
  await page
    .getByRole("dialog", { name: "Firmenprofil löschen?" })
    .getByRole("button", { name: "Profil löschen" })
    .click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
  ).toBeVisible();
}

/**
 * 7a ruling 34: asserts that after each key focus settles off the body (polled, so a transient
 * body focus while Enter navigates or Escape hands focus back is not caught).
 */
async function pressAndSettle(page: Page, key: string) {
  await page.keyboard.press(key);
  await expect.poll(() => focusOnBody(page)).toBe(false);
}

/** The job page's fixture as the first own job, so its hit opens a mocked page. */
function searchServer(): CompaniesServer {
  const server = new CompaniesServer();
  server.jobs.unshift({
    id: JOB_ID,
    user_id: CS_USERS.me,
    title: ACME_JOB.title ?? "",
    company: ACME_JOB.company ?? "",
    company_domain: "acme.de",
    status: ACME_JOB.status,
    is_archived: false,
  });
  return server;
}

/** Inbox, Bewerbungen and the job page under one mock; the inbox's shell answers win. */
function searchRoutes() {
  const base = { ...jobRoutes(ACME_JOB), ...applicationsRoutes(), ...inboxRoutes() };
  return companiesRoutes(searchServer(), {}, base);
}

async function openSearch(page: Page) {
  await pressAndSettle(page, "/");
  const field = searchDialog(page).getByRole("searchbox", { name: /durchsuchen/ });
  await expect(field).toBeFocused();
  await field.fill(SEARCH_TEXT);
  await expect(searchDialog(page).getByRole("link").first()).toBeVisible();
}

/** Escape closes the search and focus returns to the element marked before "/". */
async function expectEscapeReturnsTo(page: Page, target: Locator) {
  await target.evaluate((element, mark) => element.setAttribute("data-testid", mark), FOCUS_MARK);
  await target.focus();
  await openSearch(page);
  await pressAndSettle(page, "Escape");
  await expect(searchDialog(page)).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
    .toBe(FOCUS_MARK);
}

test("J5 search everywhere: / from the inbox, Bewerbungen and the job page", async ({
  page,
  mockApi,
}) => {
  await fixNow(page);
  await mockApi(searchRoutes());
  await page.goto("/inbox");
  await expect(h1(page, "Eingang")).toBeVisible();
  await openSearch(page);
  await pressAndSettle(page, "ArrowDown");
  await pressAndSettle(page, "Enter");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/jobs/${JOB_ID}`);
  await expect(h1(page, ACME_JOB.title ?? "")).toBeVisible();

  await page.goto("/applications");
  await expect(h1(page, "Bewerbungen")).toBeVisible();
  await expectEscapeReturnsTo(page, page.getByRole("main").getByRole("link").first());

  await page.goto(jobUrl());
  await expect(h1(page, ACME_JOB.title ?? "")).toBeVisible();
  await expectEscapeReturnsTo(page, page.getByRole("tab").first());
});
