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
  UPDATED,
} from "./support/jobFixtures";
import { live, setRoutes, type ApiLog, type MutableRoutes } from "./support/mockApi";
import { VIEWPORTS } from "./support/constants";
import { clickInZoomedFrame, saveScreenshot } from "./support/page";
import { expect, SANDBOX_PROBE, test } from "./support/test";

const STARTED = { body: { status: "started" } };
// The company profile does not exist yet: the API answers 404 and Chromium logs that response.
const MISSING_PROFILE = /status of 404/;
const NEXT_STEP = "Nächster Schritt";
// The application date 2026-10-08 (09:00 Europe/Berlin, as the date input yields it) plus 10 days.
const FOLLOW_UP_ISO = "2026-10-18T07:00:00.000Z";
const INTERVIEW_AT = "2026-10-12T08:00:00+00:00";
// The stamp has pressed in and the strips are in flight; the whole moment lasts 2.3 s.
const CELEBRATION_PEAK_MS = 700;
const CELEBRATION_GONE_MS = 4000;

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
  await expect(page.getByText(/Wird geschrieben/)).toBeVisible();
  expect(bodiesOf(log, route)).toEqual([
    { generate_cv: true, generate_letter: true, include_profile_documents: true },
  ]);
  setRoutes(routes, {
    "GET /jobs/job-1": { body: jobBody({ status: "DRAFTED", ...READY }) },
  });
  await connected(log);
  pushEvent(log, { type: "job_update", job_id: "job-1", status: "DRAFTED" });
  await expect(page.getByRole("heading", { name: "Bewerben" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Lebenslauf" })).toContainText("Fertig");
});

test.describe("edit and download", () => {
  test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

  test("edits the CV on the sheet, then downloads the PDF rendered from it", async ({
    page,
    mockApi,
  }) => {
    const html = "/jobs/job-1/documents/html?kind=cv";
    let stored = "<html><body><p>Profil</p></body></html>";
    const routes = jobRoutes(jobBody({ status: "DRAFTED", ...READY }), {
      [`GET ${html}`]: live(() => ({ html: stored })),
      [`PUT ${html}`]: live((sent) => {
        stored = (sent as { html: string }).html;
        return { ok: true };
      }),
    });
    const log = await mockApi(routes);
    await openJob(page, "unterlagen");
    await page
      .getByRole("group", { name: "Lebenslauf" })
      .getByRole("button", { name: "Bearbeiten" })
      .click();
    const editorFrame = 'iframe[title="Lebenslauf bearbeiten"]';
    const frame = page.frameLocator(editorFrame);
    await clickInZoomedFrame(page, editorFrame, frame.locator("p"));
    await page.keyboard.press("End");
    await page.keyboard.type(" mit Führung");
    await page.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(page.getByText("Änderungen gespeichert.")).toBeVisible();
    expect(JSON.stringify(bodiesOf(log, `PUT ${html}`))).toContain("Profil mit Führung");
    // The preview shows the saved HTML again; no PDF is rendered or stored on save.
    const sheet = page
      .getByRole("dialog", { name: "Lebenslauf" })
      .frameLocator('iframe[title="Lebenslauf"]');
    await expect(sheet.locator("body")).toContainText("Profil mit Führung");
    await page
      .getByRole("dialog", { name: "Lebenslauf" })
      .getByRole("button", { name: "Schließen" })
      .click();
    const rendered = page.waitForRequest((request) =>
      request.url().endsWith("/documents/pdf?kind=cv"),
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("group", { name: "Lebenslauf" })
      .getByRole("button", { name: "PDF herunterladen" })
      .click();
    await rendered;
    // The mock sends no Content-Disposition, so the file is named after the document.
    expect((await download).suggestedFilename()).toBe("Lebenslauf.pdf");
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
  // Feedback 1 T13: once applied, the Firma tab is the work of the phase.
  await expect(page).toHaveURL(/\?tab=firma$/);
  await expect(page.getByRole("tab", { name: "Firma" })).toHaveAttribute("aria-selected", "true");
});

test("records an invitation and asks for its date in Termine & Daten", async ({
  page,
  mockApi,
}) => {
  const interview = jobBody({ status: "INTERVIEW", ...READY });
  const routes = jobRoutes(jobBody({ status: "APPLIED", ...READY }), {
    "POST /jobs/job-1/status": { body: interview },
    "PATCH /jobs/job-1": UPDATED,
  });
  const log = await mockApi(routes);
  await openJob(page);
  stageJob(routes, interview);
  await nextCard(page).getByRole("button", { name: "Einladung eintragen" }).click();
  const drawer = page.getByRole("dialog", { name: "Termine & Daten" });
  await expect(drawer.getByLabel("Interviewtermin", { exact: true })).toBeFocused();
  await drawer.getByLabel("Interviewtermin", { exact: true }).fill("2026-10-20");
  await drawer.getByRole("button", { name: "Speichern" }).click();
  await expect(drawer).toBeHidden();
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "INTERVIEW" }]);
  // 09:00 Europe/Berlin (summer time) for a day without a time, as in the drawer.
  expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([
    { interview_at: "2026-10-20T07:00:00.000Z" },
  ]);
});

test("asks for the optional interview date when the phase changes to Interview", async ({
  page,
  mockApi,
}) => {
  const interview = jobBody({ status: "INTERVIEW", ...READY });
  const routes = jobRoutes(jobBody({ status: "APPLIED", ...READY }), {
    "POST /jobs/job-1/status": { body: interview },
    "PATCH /jobs/job-1": UPDATED,
  });
  const log = await mockApi(routes);
  await page.setViewportSize(VIEWPORTS.desktop);
  await openJob(page);
  stageJob(routes, interview);
  await changePhase(page, "Interview");
  const dialog = page.getByRole("dialog", { name: "Steht der Interviewtermin schon?" });
  await dialog.getByLabel("Interviewtermin (optional)").fill("2026-10-20");
  await dialog.getByLabel("Uhrzeit (optional)").fill("14:30");
  await saveScreenshot(page, "job-phase-interview-1440");
  await dialog.getByRole("button", { name: "Auf Interview setzen" }).click();
  await expect(dialog).toBeHidden();
  await expectCurrentPhase(page, "Interview");
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "INTERVIEW" }]);
  expect(bodiesOf(log, "PATCH /jobs/job-1")).toEqual([
    { interview_at: "2026-10-20T12:30:00.000Z" },
  ]);
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

test("shows a running interview prep after a reload and its result when it is ready", async ({
  page,
  mockApi,
}) => {
  const interview = jobBody({ status: "INTERVIEW", ...READY, interview_at: INTERVIEW_AT });
  const routes = jobRoutes({ ...interview, interview_prep_running: true });
  const log = await mockApi(routes);
  await openJob(page, "interview");
  await expect(nextCard(page).getByText("Vorbereitung wird erstellt …")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("Vorbereitung wird erstellt …")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vorbereitung erstellen" })).toHaveCount(0);
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
  await page.setViewportSize(VIEWPORTS.desktop);
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
  // Feedback 1 T14: the celebration plays over the page, then "1. Arbeitstag" stays.
  await expect(page.locator(".celebrate")).toBeVisible();
  await expect(page.getByRole("tab", { name: "1. Arbeitstag" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.waitForTimeout(CELEBRATION_PEAK_MS);
  await saveScreenshot(page, "job-celebration-1440-light");
  await expect(page.locator(".celebrate")).toHaveCount(0, { timeout: CELEBRATION_GONE_MS });
  await expect(
    page.getByRole("heading", { name: "Glückwunsch, du fängst bei ACME GmbH an!" }),
  ).toBeVisible();
});

test("shows only the static success message under reduced motion", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "OFFER", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "ACCEPTED", ...READY }) },
  });
  await mockApi(routes);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openJob(page);
  stageJob(routes, jobBody({ status: "ACCEPTED", ...READY }));
  await page.getByRole("button", { name: "Angebot angenommen" }).click();
  await expect(
    page.getByRole("heading", { name: "Glückwunsch, du fängst bei ACME GmbH an!" }),
  ).toBeVisible();
  await expect(page.locator(".celebrate")).toBeHidden();
});

test("records the first-day checklist and the start date", async ({ page, mockApi }) => {
  // The server keeps what was patched: the job refetch after a write reports it, as the real one
  // does. A fixed job body would take the tick back whenever that refetch lands.
  let job = jobBody({ status: "ACCEPTED", ...READY });
  const log = await mockApi(
    jobRoutes(job, {
      "GET /jobs/job-1": live(() => job),
      "PATCH /jobs/job-1": live((sent) => {
        job = { ...job, ...(sent as Partial<JobDetailBody>) };
        return { status: "updated" };
      }),
    }),
  );
  await openJob(page, "erster-tag");
  // click + auto-retrying assertion: check() verifies the state once, right after the click, but
  // the optimistic cache write reaches the checkbox a macrotask later (query notify batching).
  const route = page.getByLabel("Anfahrt und Ankunftszeit geplant");
  await route.click();
  await expect(route).toBeChecked();
  await page.getByLabel("Erster Arbeitstag").fill("2026-11-02");
  await expect
    .poll(() => bodiesOf(log, "PATCH /jobs/job-1"))
    .toEqual([
      {
        first_day_checklist: {
          contract_signed: false,
          papers_ready: false,
          others_declined: false,
          route_planned: true,
          first_day_contact: false,
        },
      },
      { start_date: "2026-11-02" },
    ]);
  await expect(page.getByText("Start am 02.11.2026, in 25 Tagen.")).toBeVisible();
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
  await expect(page.getByRole("tab", { name: "Wie geht's weiter" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("link", { name: "Zum Eingang" })).toBeVisible();
  await expect(page.getByText("3 neue Treffer warten dort.")).toBeVisible();
  await expect(page.locator(".celebrate")).toHaveCount(0);
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

const RESEARCH = "POST /jobs/job-1/company-research";

/** No profile yet; the research can be started on the job. */
function companyRoutes(job: JobDetailBody): MutableRoutes {
  return jobRoutes(job, {
    "GET /companies/acme.de": { status: 404, body: { detail: "Company profile not found" } },
    [RESEARCH]: { body: { status: "queued", domain: "acme.de" } },
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
    expect(bodiesOf(log, RESEARCH)).toEqual([]);
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    expect(bodiesOf(log, RESEARCH)).toEqual([{ company_domain: "acme.de", force_refresh: false }]);
    setRoutes(routes, { "GET /companies/acme.de": { body: COMPANY_PROFILE } });
    await connected(log);
    pushEvent(log, { type: "company_profile_ready", domain: "acme.de", job_id: "job-1" });
    await expect(
      page.getByText("Solider Mittelständler mit wachsendem Plattform-Team."),
    ).toBeVisible();
  });

  test("asks once for the web address and researches the host of a pasted link", async ({
    page,
    mockApi,
  }) => {
    const job = jobBody({ status: "DRAFTED", ...READY });
    const routes = companyRoutes(job);
    const log = await mockApi(routes);
    await openJob(page, "firma");
    await expect(page.getByRole("heading", { name: "Stimmt die Web-Adresse?" })).toHaveCount(0);
    const running = { ...job, company_domain: "acme.de", company_research_running: true };
    setRoutes(routes, { "GET /jobs/job-1": { body: running } });
    await page.getByLabel("Web-Adresse der Firma").fill("https://www.acme.de/karriere");
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    expect(bodiesOf(log, RESEARCH)).toEqual([{ company_domain: "acme.de", force_refresh: false }]);
  });

  test("shows a research without address after a reload and asks for it when the AI found none", async ({
    page,
    mockApi,
  }) => {
    const job = jobBody({ status: "DRAFTED", ...READY });
    const routes = companyRoutes({ ...job, company_research_running: true });
    const log = await mockApi(routes);
    await openJob(page, "firma");
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    await expect(page.getByLabel("Web-Adresse der Firma")).toHaveCount(0);
    setRoutes(routes, {
      "GET /jobs/job-1": { body: { ...job, company_research_error: "DOMAIN_NOT_FOUND" } },
    });
    await connected(log);
    pushEvent(log, { type: "company_profile_ready", domain: null, job_id: "job-1" });
    await expect(
      page.getByText(/Die KI hat die Web-Adresse der Firma nicht gefunden/),
    ).toBeVisible();
    await expect(page.getByLabel("Web-Adresse der Firma")).toHaveValue("");
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
