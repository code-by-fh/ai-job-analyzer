import type { Page } from "@playwright/test";
import type { JobDetailBody } from "../../src/api/jobs";
import {
  changePhase,
  COMPANY_PROFILE,
  expectCurrentPhase,
  fixNow,
  jobBody,
  jobRoutes,
  jobUrl,
  pushEvent,
  PREP_MATERIAL,
  READY,
  READY_DOCUMENTS,
  UPDATED,
} from "./support/jobFixtures";
import { setRoutes, type ApiLog, type MutableRoutes } from "./support/mockApi";
import { expect, SANDBOX_PROBE, test } from "./support/test";

const STARTED = { body: { status: "started" } };
// The company profile does not exist yet: the API answers 404 and Chromium logs that response.
const MISSING_PROFILE = /status of 404/;
const NEXT_STEP = "Nächster Schritt";
// The application date 2026-10-08 (09:00 Europe/Berlin, as the date input yields it) plus 10 days.
const FOLLOW_UP_ISO = "2026-10-18T07:00:00.000Z";
const INTERVIEW_AT = "2026-10-12T08:00:00+00:00";

test.beforeEach(async ({ page }) => fixNow(page));

const bodiesOf = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

const nextCard = (page: Page) => page.getByRole("complementary", { name: NEXT_STEP });

/** The realtime socket connects after the page has loaded; events need it. */
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);

async function openJob(page: Page, tab?: string) {
  await page.goto(jobUrl(tab));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** The server's next job read already reports this state (what a status write leaves behind). */
function stageJob(routes: MutableRoutes, job: JobDetailBody): void {
  setRoutes(routes, { "GET /jobs/job-1": { body: job } });
}

test("generates both documents and shows them when the server is done", async ({
  page,
  mockApi,
}) => {
  const route = "POST /jobs/job-1/generate-package";
  // The job read after the start reports the running generation, as the real server does.
  let started = false;
  const routes = jobRoutes(jobBody({ status: "DRAFTED" }), {
    "GET /jobs/job-1": {
      body: null,
      respond: () => jobBody({ status: started ? "GENERATING" : "DRAFTED" }),
    },
    [route]: {
      ...STARTED,
      respond: () => {
        started = true;
        return STARTED.body;
      },
    },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await nextCard(page).getByRole("button", { name: "Unterlagen erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Unterlagen werden erstellt" })).toBeVisible();
  await expect(page.getByText(/Wird geschrieben und als PDF gesetzt/)).toBeVisible();
  expect(bodiesOf(log, route)).toEqual([
    { generate_cv: true, generate_letter: true, include_profile_documents: true },
  ]);
  setRoutes(routes, {
    "GET /jobs/job-1": { body: jobBody({ status: "DRAFTED", ...READY }) },
    "GET /jobs/job-1/documents": { body: READY_DOCUMENTS },
  });
  await connected(log);
  pushEvent(log, { type: "job_update", job_id: "job-1", status: "DRAFTED" });
  await expect(page.getByRole("heading", { name: "Bewerben" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Lebenslauf" })).toContainText("Fertig");
});

test.describe("edit and re-render", () => {
  test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

  test("edits the CV on the sheet and re-renders the PDF", async ({ page, mockApi }) => {
    const html = "/jobs/job-1/documents/html?kind=cv";
    const routes = jobRoutes(jobBody({ status: "DRAFTED", ...READY }), {
      [`GET ${html}`]: { body: { html: "<html><body><p>Profil</p></body></html>" } },
      [`PUT ${html}`]: { body: { ok: true } },
      "POST /jobs/job-1/documents/render?kind=cv": { body: { queued: true } },
    });
    const log = await mockApi(routes);
    await openJob(page, "unterlagen");
    await page
      .getByRole("group", { name: "Lebenslauf" })
      .getByRole("button", { name: "Bearbeiten" })
      .click();
    const frame = page.frameLocator('iframe[title="Lebenslauf bearbeiten"]');
    await frame.locator("p").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" mit Führung");
    await page.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(page.getByText("PDF wird neu gesetzt …").first()).toBeVisible();
    expect(JSON.stringify(bodiesOf(log, `PUT ${html}`))).toContain("Profil mit Führung");
    await expect
      .poll(() => bodiesOf(log, "POST /jobs/job-1/documents/render?kind=cv"))
      .toHaveLength(1);
    await connected(log);
    pushEvent(log, { type: "job_update", job_id: "job-1", rendered_kind: "cv" });
    await expect(page.getByText("PDF wird neu gesetzt …")).toHaveCount(0);
  });
});

test("applies with the checklist", async ({ page, mockApi }) => {
  const drafted = jobBody({ status: "DRAFTED", ...READY });
  const routes = jobRoutes(drafted, {
    "PATCH /jobs/job-1": UPDATED,
    "POST /jobs/job-1/status": { body: jobBody({ status: "APPLIED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  // The server keeps the tick, so the refetch after the write agrees with the page.
  const sent = { posting_opened: false, documents_checked: false, sent: true };
  setRoutes(routes, { "GET /jobs/job-1": { body: { ...drafted, checklist: sent } } });
  // click, not check(): the tick reaches the controlled checkbox one tick after the click.
  await page.getByLabel("Beim Arbeitgeber abgeschickt").click();
  await expect(page.getByLabel("Beim Arbeitgeber abgeschickt")).toBeChecked();
  await expect.poll(() => bodiesOf(log, "PATCH /jobs/job-1")).toEqual([{ checklist: sent }]);
  setRoutes(routes, { "GET /jobs/job-1": { body: jobBody({ status: "APPLIED", ...READY }) } });
  await page.getByRole("button", { name: "Als beworben markieren" }).click();
  await expect(page.getByRole("heading", { name: "Auf Antwort warten" })).toBeVisible();
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "APPLIED" }]);
  // The reminder follows ten days after the application date.
  await expect
    .poll(() => bodiesOf(log, "PATCH /jobs/job-1").slice(1))
    .toEqual([{ next_follow_up_at: FOLLOW_UP_ISO }]);
});

test("warns before applying without documents", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "DRAFTED", cv_html_present: true }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "APPLIED", cv_html_present: true }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, jobBody({ status: "APPLIED", cv_html_present: true }));
  await changePhase(page, "Beworben");
  const dialog = page.getByRole("dialog", { name: "Ohne fertige Unterlagen?" });
  await expect(dialog).toContainText("Anschreiben");
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([]);
  await dialog.getByRole("button", { name: "Trotzdem auf Beworben setzen" }).click();
  await expect.poll(() => bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "APPLIED" }]);
  await expectCurrentPhase(page, "Beworben");
});

test("prepares the interview and shows the preparation when it is ready", async ({
  page,
  mockApi,
}) => {
  const route = "POST /jobs/job-1/interview-prep";
  const interview = jobBody({ status: "INTERVIEW", ...READY, interview_at: INTERVIEW_AT });
  const routes = jobRoutes(interview, {
    [route]: { body: { status: "queued", message: "", job_id: "job-1" } },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await nextCard(page).getByRole("button", { name: "Vorbereitung erstellen" }).click();
  await expect(nextCard(page).getByText("Vorbereitung wird erstellt …")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("Vorbereitung wird erstellt …")).toBeVisible();
  expect(bodiesOf(log, route)).toHaveLength(1);
  setRoutes(routes, {
    "GET /jobs/job-1": { body: { ...interview, interview_prep_material: PREP_MATERIAL } },
  });
  await connected(log);
  pushEvent(log, { type: "interview_prep_ready", job_id: "job-1" });
  await expect(
    page.getByText("Ich baue robuste Backend-Systeme und führe kleine Teams."),
  ).toBeVisible();
});

test("accepts an offer", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "OFFER", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "ACCEPTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, jobBody({ status: "ACCEPTED", ...READY }));
  await page.getByRole("button", { name: "Angebot angenommen" }).click();
  await expect(page.getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "ACCEPTED" }]);
  await expectCurrentPhase(page, "Zusage angenommen");
});

test("closes an application as rejected through the phase menu", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "APPLIED", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "REJECTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, jobBody({ status: "REJECTED", ...READY }));
  await changePhase(page, "Abgeschlossen");
  const dialog = page.getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" });
  await dialog.getByRole("button", { name: "Absage erhalten" }).click();
  await expect.poll(() => bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "REJECTED" }]);
  await expectCurrentPhase(page, "Abgesagt");
});

test("asks before moving an application back", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "INTERVIEW", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "DRAFTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, jobBody({ status: "DRAFTED", ...READY }));
  await changePhase(page, "Vorgemerkt");
  const dialog = page.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([]);
  await dialog.getByLabel("Notiz für den Verlauf (optional)").fill("Termin abgesagt");
  await dialog.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect
    .poll(() => bodiesOf(log, "POST /jobs/job-1/status"))
    .toEqual([{ to: "DRAFTED", note: "Termin abgesagt" }]);
  await expectCurrentPhase(page, "Vorgemerkt");
});

const ANALYZE = "POST /companies/acme.de/analyze";

/** No profile yet; the research can be started and the job can be patched. */
function companyRoutes(job: JobDetailBody): MutableRoutes {
  return jobRoutes(job, {
    "GET /companies/acme.de": { status: 404, body: { detail: "Company profile not found" } },
    "PATCH /jobs/job-1": UPDATED,
    [ANALYZE]: { body: { status: "queued", domain: "acme.de", message: "" } },
  });
}

test.describe("company research", () => {
  test.use({ allowedConsoleErrors: [MISSING_PROFILE] });

  test("confirms the web address, researches and shows the profile when it is ready", async ({
    page,
    mockApi,
  }) => {
    const job = jobBody({ status: "DRAFTED", ...READY, company_domain: "acme.de" });
    const routes = companyRoutes(job);
    const log = await mockApi(routes);
    await openJob(page, "firma");
    // The stored address is only a suggestion until the user has confirmed it.
    await expect(page.getByRole("heading", { name: "Stimmt die Web-Adresse?" })).toBeVisible();
    await expect(page.getByLabel("Web-Adresse der Firma")).toHaveValue("acme.de");
    expect(bodiesOf(log, ANALYZE)).toEqual([]);
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([{ company_domain: "acme.de" }]);
    expect(bodiesOf(log, ANALYZE)).toEqual([{ force_refresh: false }]);
    setRoutes(routes, { "GET /companies/acme.de": { body: COMPANY_PROFILE } });
    await connected(log);
    pushEvent(log, { type: "company_profile_ready", domain: "acme.de" });
    await expect(
      page.getByText("Solider Mittelständler mit wachsendem Plattform-Team."),
    ).toBeVisible();
  });

  test("asks once for the web address and stores the host of a pasted link", async ({
    page,
    mockApi,
  }) => {
    const job = jobBody({ status: "DRAFTED", ...READY });
    const routes = companyRoutes(job);
    const log = await mockApi(routes);
    await openJob(page, "firma");
    await expect(page.getByRole("heading", { name: "Stimmt die Web-Adresse?" })).toHaveCount(0);
    setRoutes(routes, { "GET /jobs/job-1": { body: { ...job, company_domain: "acme.de" } } });
    await page.getByLabel("Web-Adresse der Firma").fill("https://www.acme.de/karriere");
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([{ company_domain: "acme.de" }]);
    await expect.poll(() => bodiesOf(log, ANALYZE)).toEqual([{ force_refresh: false }]);
  });
});

test("retries a failed generation and creates only the missing letter", async ({
  page,
  mockApi,
}) => {
  const route = "POST /jobs/job-1/generate";
  const cvOnly = { cv_html_present: true, cover_letter_html_present: false };
  const routes = jobRoutes(jobBody({ status: "DRAFTED", ...cvOnly }), { [route]: STARTED });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, jobBody({ status: "GENERATING", pre_generation_status: "DRAFTED", ...cvOnly }));
  await nextCard(page).getByRole("button", { name: "Anschreiben erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Unterlagen werden erstellt" })).toBeVisible();
  await connected(log);
  stageJob(routes, jobBody({ status: "FAILED", generation_error: "LLM timeout", ...cvOnly }));
  pushEvent(log, { type: "job_update", job_id: "job-1", error: "LLM timeout" });
  await expect(page.getByRole("heading", { name: "Erstellung fehlgeschlagen" })).toBeVisible();
  await expect(page.getByText(/LLM timeout/)).toHaveCount(0);
  stageJob(routes, jobBody({ status: "GENERATING", pre_generation_status: "DRAFTED", ...cvOnly }));
  await nextCard(page).getByRole("button", { name: "Anschreiben erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Unterlagen werden erstellt" })).toBeVisible();
  stageJob(routes, jobBody({ status: "DRAFTED", ...READY }));
  pushEvent(log, { type: "job_update", job_id: "job-1" });
  await expect(page.getByRole("heading", { name: "Bewerben" })).toBeVisible();
  expect(bodiesOf(log, route)).toEqual([{ improvement_notes: null }, { improvement_notes: null }]);
  expect(bodiesOf(log, "POST /jobs/job-1/generate-package")).toEqual([]);
});

test("records a follow-up and moves the reminder ten days ahead", async ({ page, mockApi }) => {
  const overdue = "2026-10-06T07:00:00+00:00";
  // The fixed now (2026-10-08 10:00 Berlin) plus FOLLOW_UP_DAYS.
  const next = "2026-10-18T08:00:00.000Z";
  const applied = (followUp: string) =>
    jobBody({ status: "APPLIED", ...READY, next_follow_up_at: followUp });
  const routes = jobRoutes(applied(overdue), { "PATCH /jobs/job-1": UPDATED });
  const log = await mockApi(routes);
  await openJob(page);
  await expect(nextCard(page).getByText(/überfällig/)).toBeVisible();
  stageJob(routes, applied(next));
  await nextCard(page).getByRole("button", { name: "Nachgefasst" }).click();
  await expect(
    page.getByText("Nachfassen festgehalten. Nächste Erinnerung am 18.10.2026."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Auf Antwort warten" })).toBeVisible();
  expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([{ next_follow_up_at: next }]);
});

test("saves an interview date in Termine & Daten and removes the follow-up date", async ({
  page,
  mockApi,
}) => {
  const followUp = "2026-10-20T07:00:00+00:00";
  // 2026-10-22 picked without a time is 09:00 Europe/Berlin.
  const interview = "2026-10-22T07:00:00.000Z";
  const applied = jobBody({ status: "APPLIED", ...READY, next_follow_up_at: followUp });
  const routes = jobRoutes(applied, { "PATCH /jobs/job-1": UPDATED });
  const log = await mockApi(routes);
  await openJob(page);
  const card = page.getByRole("region", { name: "Termine & Daten" });
  await card.getByRole("button", { name: "Bearbeiten" }).click();
  const drawer = page.getByRole("dialog", { name: "Termine & Daten" });
  await drawer.getByLabel("Interviewtermin", { exact: true }).fill("2026-10-22");
  // What the server stores, so the refetch after the save shows it.
  stageJob(routes, { ...applied, interview_at: interview });
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(card).toContainText("22.10.2026");
  await card.getByRole("button", { name: "Bearbeiten" }).click();
  await drawer.getByRole("button", { name: "Nachfassen am: Datum entfernen" }).click();
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toHaveCount(0);
  expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([
    { interview_at: interview },
    { next_follow_up_at: null },
  ]);
});
