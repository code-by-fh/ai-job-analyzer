import { expect, type Page, type Request } from "@playwright/test";
import type { CompanyProfileBody } from "../../../src/api/companies";
import type { JobDocumentBody } from "../../../src/api/jobDocuments";
import type { JobDetailBody, JobHistoryBody } from "../../../src/api/jobs";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import { ADMIN_USER_ID, AUTHENTICATED_ROUTES } from "./fixtures";
import {
  live,
  type ApiLog,
  type MockResponse,
  type MockRoutes,
  type MutableRoutes,
} from "./mockApi";

export const JOB_ID = "job-1";
/** The answer of a successful PATCH /jobs/{id}. */
export const UPDATED = { body: { status: "updated" } };
/** Fixed "now" of every job test (page.clock.setFixedTime), so due dates are stable. */
export const NOW_ISO = "2026-10-08T10:00:00+02:00";

const REASONING = `## Zusammenfassung
Du passt gut: Kotlin und Kafka sind dein Alltag, das Team sucht genau das.

## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren in Produktion
- Kafka und transaktionale Outbox
- Fachliche Führung eines kleinen Teams

## Lücken & Herausforderungen
- Keine Erfahrung mit GCP
- Reisebereitschaft 20 %

## Empfehlung
Bewirb dich und betone den Umbau des Zahlungsdienstes.`;

export function jobBody(overrides: Partial<JobDetailBody> = {}): JobDetailBody {
  return {
    id: JOB_ID,
    title: "Senior Backend Engineer (Kotlin)",
    company: "ACME GmbH",
    company_domain: null,
    description: "Wir suchen eine erfahrene Person für unser Plattform-Team in Hamburg.",
    match_score: 86,
    reasoning: REASONING,
    status: "OPEN",
    url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
    is_archived: false,
    checklist: null,
    todos: [{ id: "t1", text: "Gehaltsband recherchieren", done: false }],
    notes: "",
    created_at: "2026-10-03T07:00:00+00:00",
    next_follow_up_at: null,
    cv_html_present: false,
    cover_letter_html_present: false,
    ...overrides,
  };
}

export const CV_DOCUMENT: JobDocumentBody = {
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  file_size: 48_000,
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
  uploaded_at: "2026-10-07T09:12:00+00:00",
};
export const LETTER_DOCUMENT: JobDocumentBody = {
  ...CV_DOCUMENT,
  id: 5,
  original_filename: "Anschreiben_ACME.pdf",
  kind: "GENERATED_LETTER",
};
/** The stored PDFs of a job generated before CV and letter became HTML-only (Task 12). */
export const READY_DOCUMENTS = [CV_DOCUMENT, LETTER_DOCUMENT];
export const READY = { cv_html_present: true, cover_letter_html_present: true } as const;

const SHEET_STYLE =
  "<style>body{font-family:Georgia,serif;color:#222;margin:40px;font-size:13px;line-height:1.5}" +
  "h1{font-size:24px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;" +
  "border-bottom:1px solid #ccc;margin:22px 0 6px}</style>";
export const CV_HTML =
  `<html><head>${SHEET_STYLE}</head><body><h1>Jana Beispiel</h1>` +
  "<p>Senior Backend Engineer · Hamburg</p><h2>Erfahrung</h2>" +
  "<p><b>Zahlungsplattform GmbH</b> · seit 2021<br>Kotlin, Kafka, transaktionale Outbox</p>" +
  "<h2>Ausbildung</h2><p>M.Sc. Informatik</p></body></html>";
export const LETTER_HTML =
  `<html><head>${SHEET_STYLE}</head><body><p>Sehr geehrte Damen und Herren,</p>` +
  "<p>mit großem Interesse habe ich Ihre Stelle gelesen.</p></body></html>";

const step = (id: number, from: string, to: string, changedAt: string): JobHistoryBody => ({
  id,
  from_status: from,
  to_status: to,
  changed_at: changedAt,
  note: null,
});

// The path a job took up to its phase, so stepper dates and timeline match the shown status.
const HISTORY_STEPS: readonly JobHistoryBody[] = [
  step(1, "OPEN", "DRAFTED", "2026-10-04T08:00:00+00:00"),
  step(2, "DRAFTED", "APPLIED", "2026-10-05T09:30:00+00:00"),
  step(3, "APPLIED", "INTERVIEW", "2026-10-06T14:00:00+00:00"),
  step(4, "INTERVIEW", "OFFER", "2026-10-07T16:00:00+00:00"),
];
const STEPS_UP_TO: Readonly<Record<string, number>> = {
  DRAFTED: 1,
  GENERATING: 1,
  FAILED: 1,
  APPLIED: 2,
  INTERVIEW: 3,
  OFFER: 4,
  ACCEPTED: 4,
  REJECTED: 4,
};

/** The status history GET /jobs/{id}/history returns for a job in this status. */
export function historyFor(status: string): JobHistoryBody[] {
  return HISTORY_STEPS.slice(0, STEPS_UP_TO[status] ?? 0);
}

const PROFILE_DOCUMENTS: ProfileDocumentBody[] = [
  {
    id: 1,
    doc_type: "CERTIFICATE",
    label: "AWS Solutions Architect",
    original_filename: "aws.pdf",
  },
];

// A minimal one-page PDF; headless Chromium has no PDF viewer, so the page shows its fallback.
export const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
export const PDF_RESPONSE: MockResponse = { body: PDF, contentType: "application/pdf" };

export const COMPANY_PROFILE: CompanyProfileBody = {
  domain: "acme.de",
  name: "ACME GmbH",
  executive_summary: {
    assessment: "Solider Mittelständler mit wachsendem Plattform-Team.",
    confidence: "Moderate",
    suitable_for: ["Backend-Entwicklung mit Verantwortung"],
    not_suitable_for: ["Reine Frontend-Rollen"],
  },
  analysis: [{ area: "Kultur", assessment: "Direkt und pragmatisch.", confidence: "Low" }],
  key_insights: { facts: ["Rund 400 Beschäftigte"], interpretations: [], uncertainties: [] },
  risks: [
    {
      title: "Fluktuation",
      probability: "Medium",
      impact: "Medium",
      description: "Mehrere Wechsel im Management.",
    },
  ],
  market_comparison: null,
  deep_dive_buttons: [
    { title: "Gehaltsband", focus: "Gehalt Senior Backend", how_to_proceed: "Portale auswerten" },
  ],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T12:00:00+00:00",
};

export const PREP_MATERIAL = JSON.stringify({
  report_output: {
    executive_summary: "Deine Erfahrung mit Zahlungssystemen ist der stärkste Punkt.",
    deep_dive_analysis:
      "## Technisches Gespräch\n\nRechne mit Fragen zu Idempotenz und Retries im Zahlungsfluss.",
  },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Backend-Systeme und führe kleine Teams.",
    gap_analysis: [
      {
        requirement: "GCP",
        cv_status: "fehlt",
        gap_severity: "Medium",
        interview_strategy: "AWS-Erfahrung übertragen",
      },
      {
        requirement: "Kafka im Betrieb",
        cv_status: "Nur als Nutzer, nicht als Betreiber",
        gap_severity: "High",
        interview_strategy: "Das Outbox-Projekt erzählen und offen sagen, was du lernen willst.",
      },
      {
        requirement: "Scrum",
        cv_status: "Drei Jahre im Team",
        gap_severity: "Low",
        interview_strategy: "Ein Retro-Beispiel bereithalten.",
      },
    ],
  },
  deep_dive_buttons: [],
  confidence_assessment: {
    overall_confidence: "Moderate",
    uncertainties: ["Budget des Teams", "Anteil Bereitschaftsdienst"],
  },
  online_resources: ["https://acme.de/karriere"],
});

const path = (suffix = "") => `/jobs/${JOB_ID}${suffix}`;
const htmlOf = (request: Request) =>
  new URL(request.url()).searchParams.get("kind") === "cover_letter" ? LETTER_HTML : CV_HTML;

/** Freezes the browser clock at NOW_ISO; call it in every job spec's beforeEach. */
export async function fixNow(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(NOW_ISO));
}

/** Everything the job page loads, plus the authenticated shell. */
export function jobRoutes(job: JobDetailBody, extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    [`GET ${path()}`]: { body: job },
    [`GET ${path("/history")}`]: { body: historyFor(job.pre_generation_status ?? job.status) },
    [`GET ${path("/documents")}`]: { body: [] },
    // One plain key, so a spec's own "GET .../documents/html" replaces it for both kinds.
    [`GET ${path("/documents/html")}`]: live((_sent, request) => ({ html: htmlOf(request) })),
    [`GET ${path("/documents/pdf")}`]: PDF_RESPONSE,
    [`GET ${path("/documents/4/view")}`]: PDF_RESPONSE,
    [`GET ${path("/documents/5/view")}`]: PDF_RESPONSE,
    "GET /profile/documents": { body: PROFILE_DOCUMENTS },
    ...extra,
  };
}

/** Opens the phase menu of the job page and picks a phase. */
export async function changePhase(page: Page, target: string): Promise<void> {
  await page.getByRole("button", { name: "Phase ändern" }).click();
  await page.getByRole("menuitemradio", { name: target }).click();
}

/** The stepper marks this phase as the current one. */
export async function expectCurrentPhase(page: Page, label: string): Promise<void> {
  const track = page.getByRole("list", { name: "Phase der Bewerbung" });
  await expect(track.locator('[aria-current="step"]')).toContainText(label);
}

export function jobUrl(tab?: string): string {
  return tab ? `${path()}?tab=${tab}` : path();
}

/** Sends a realtime event for the signed-in user through the mocked socket; fails if none is connected. */
export function pushEvent(log: ApiLog, event: object): void {
  const socket = log.sockets[0];
  if (!socket) throw new Error("pushEvent: no realtime socket is connected yet");
  socket.send(JSON.stringify({ user_id: ADMIN_USER_ID, ...event }));
}
