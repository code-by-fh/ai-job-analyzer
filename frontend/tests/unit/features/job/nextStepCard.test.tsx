import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { DatesDrawerProvider } from "@/features/job/dates/DatesDrawerProvider";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { applyEvent } from "@/realtime/applyEvent";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date("2026-10-08T10:00:00Z");
const READY = { cv_html_present: true, cover_letter_html_present: true };

beforeEach(() => {
  // Only Date is faked, so promises and user-event timers keep running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  navigation.replace.mockReset();
});

afterEach(() => vi.useRealTimers());

function show(job: JobDetail) {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": [],
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/status": (call: RecordedCall) =>
      jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to }),
    "POST /jobs/job-1/generate-package": { status: "started" },
    "POST /jobs/job-1/generate": { status: "started" },
    "POST /jobs/job-1/interview-prep": { status: "queued", message: "", job_id: "job-1" },
    "GET /jobs/job-1": job,
  });
  const { queryClient } = renderWithProviders(
    <DatesDrawerProvider job={job}>
      <NextStepCard job={job} />
    </DatesDrawerProvider>,
  );
  return Object.assign(calls, { queryClient });
}

const bodyOf = (calls: readonly RecordedCall[], method: string, path: string) =>
  calls
    .filter((call) => call.method === method && call.url.endsWith(path))
    .map((call) => JSON.parse(call.body ?? "null"));

describe("NextStepCard", () => {
  it("offers Vormerken and Aussortieren for a match", async () => {
    const calls = show(buildJob({ status: "OPEN" }));
    expect(screen.getByRole("heading", { name: "Passt die Stelle zu dir?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vormerken" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "DRAFTED" }]));
  });

  it("blocks both triage buttons while one request runs", async () => {
    show(buildJob({ status: "OPEN" }));
    const answered = globalThis.fetch;
    // A PATCH that never answers keeps the request pending.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH" ? new Promise<Response>(() => undefined) : answered(input, init),
    );
    await userEvent.click(screen.getByRole("button", { name: "Aussortieren" }));
    expect(screen.getByRole("button", { name: "Vormerken" })).toHaveAttribute("aria-busy", "true");
  });

  it("sorts out with undo", async () => {
    const calls = show(buildJob({ status: "OPEN" }));
    await userEvent.click(screen.getByRole("button", { name: "Aussortieren" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    await waitFor(() =>
      expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([
        { is_archived: true },
        { is_archived: false },
      ]),
    );
  });

  it("restores a sorted-out job", async () => {
    const calls = show(buildJob({ status: "OPEN", is_archived: true, archive_reason: "USER" }));
    await userEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([{ is_archived: false }]),
    );
  });

  it("creates both documents when none exists", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(screen.getByRole("button", { name: "Unterlagen erstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: true },
      ]),
    );
  });

  it("creates only the missing letter when the CV exists", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    expect(screen.getByRole("heading", { name: "Anschreiben erstellen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Anschreiben erstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/generate")).toEqual([{ improvement_notes: null }]),
    );
    expect(bodyOf(calls, "POST", "/generate-package")).toEqual([]);
  });

  it("creates only the missing CV when the letter exists", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cover_letter_html_present: true }));
    expect(screen.getByRole("heading", { name: "Lebenslauf erstellen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lebenslauf erstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: false, include_profile_documents: true },
      ]),
    );
  });

  it("retries only the missing letter after a failed generation", async () => {
    const calls = show(buildJob({ status: "FAILED", cv_html_present: true }));
    expect(screen.getByRole("heading", { name: "Erstellung fehlgeschlagen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Anschreiben erstellen" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/generate")).toHaveLength(1));
    expect(bodyOf(calls, "POST", "/generate-package")).toEqual([]);
  });

  it("starts no generation for a failed job that kept both documents", () => {
    const calls = show(buildJob({ status: "FAILED", ...READY }));
    expect(screen.getByRole("heading", { name: "Bewerben" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /erstellen/i })).not.toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("uses the shared attach choice for the documents it creates", async () => {
    const job = buildJob({ status: "DRAFTED" });
    const calls = show(job);
    act(() => calls.queryClient.setQueryData(["attach-choice", "job-1"], false));
    await userEvent.click(screen.getByRole("button", { name: "Unterlagen erstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: false },
      ]),
    );
  });

  it("explains an incomplete profile after a failed generation", () => {
    show(
      buildJob({
        status: "FAILED",
        generation_error: "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen.",
      }),
    );
    expect(screen.getByText(/Dein Profil ist unvollständig/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Profil" })).toHaveAttribute("href", "/profile");
  });

  it("never shows raw generation errors", () => {
    show(buildJob({ status: "FAILED", generation_error: "Traceback: KeyError 'cv_data'" }));
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
  });

  it("warns when following up is overdue and records it", async () => {
    const calls = show(
      buildJob({ status: "APPLIED", ...READY, next_follow_up_at: "2026-10-01T07:00:00Z" }),
    );
    expect(screen.getByRole("region", { name: "Nachfassen" })).toHaveClass("tone-warn");
    expect(screen.getByText(/überfällig/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nachgefasst" }));
    await waitFor(() =>
      expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([
        { next_follow_up_at: "2026-10-18T10:00:00.000Z" },
      ]),
    );
  });

  it("records an invitation", async () => {
    const calls = show(buildJob({ status: "APPLIED", ...READY }));
    await userEvent.click(screen.getByRole("button", { name: "Einladung eintragen" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "INTERVIEW" }]));
  });

  it("starts the interview prep and opens its tab", async () => {
    const calls = show(buildJob({ status: "INTERVIEW", ...READY }));
    await userEvent.click(screen.getByRole("button", { name: "Vorbereitung erstellen" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/interview-prep")).toHaveLength(1));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=interview", { scroll: false });
  });

  it("shows a running prep instead of a second start until it is ready", async () => {
    const calls = show(buildJob({ status: "INTERVIEW", ...READY }));
    const start = screen.getByRole("button", { name: "Vorbereitung erstellen" });
    await userEvent.dblClick(start);
    expect(await screen.findByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vorbereitung erstellen" }),
    ).not.toBeInTheDocument();
    expect(bodyOf(calls, "POST", "/interview-prep")).toHaveLength(1);
    const deps = { queryClient: calls.queryClient, now: () => Date.now(), onGlobalError: vi.fn() };
    act(() => applyEvent({ type: "interview_prep_ready", user_id: 1, job_id: "job-1" }, deps));
    expect(await screen.findByRole("button", { name: "Vorbereitung erstellen" })).toBeEnabled();
  });

  it("shows a prep the server reports as running instead of the start button", () => {
    show(buildJob({ status: "INTERVIEW", ...READY, interview_prep_running: true }));
    expect(screen.getByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vorbereitung erstellen" }),
    ).not.toBeInTheDocument();
  });

  it("loads an existing prep instead of showing nothing when the server reports it exists", async () => {
    const job = buildJob({ status: "INTERVIEW", ...READY });
    const { queryClient } = show(job);
    stubRoutes({
      "POST /jobs/job-1/interview-prep": { status: "exists", message: "", job_id: "job-1" },
      "GET /jobs/job-1": job,
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: "Vorbereitung erstellen" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.job("job-1") }),
    );
    expect(screen.queryByText("Vorbereitung wird erstellt …")).not.toBeInTheDocument();
  });

  it("shows the interview date with its time", () => {
    show(buildJob({ status: "INTERVIEW", ...READY, interview_at: "2026-10-12T08:00:00Z" }));
    expect(screen.getByText("Interviewtermin 12.10.2026, 10:00")).toBeInTheDocument();
  });

  it("dates a follow-up in the interview phase by the follow-up", () => {
    show(buildJob({ status: "INTERVIEW", ...READY, next_follow_up_at: "2026-10-09T08:00:00Z" }));
    expect(screen.getByRole("heading", { name: "Nachfassen" })).toBeInTheDocument();
    expect(screen.getByText("Nachfassen am 09.10.2026")).toBeInTheDocument();
  });

  it("records a declined offer with a note", async () => {
    const calls = show(
      buildJob({ status: "OFFER", ...READY, next_follow_up_at: "2026-10-20T16:00:00Z" }),
    );
    expect(screen.getByText(/Antwort bis/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Angebot abgelehnt" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/status")).toEqual([
        { to: "REJECTED", note: "Angebot abgelehnt" },
      ]),
    );
    expect(await screen.findByText("Phase: Abgesagt.")).toBeInTheDocument();
  });

  it("has no action once closed", () => {
    show(buildJob({ status: "ACCEPTED" }));
    expect(screen.getByRole("heading", { name: "Abgeschlossen" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("opens the guarded outcome dialog once the interview day has passed", async () => {
    const calls = show(
      buildJob({ status: "INTERVIEW", ...READY, interview_at: "2026-10-01T07:00:00Z" }),
    );
    const card = screen.getByRole("region", { name: "Ergebnis festhalten" });
    expect(card).toHaveClass("next");
    expect(card).not.toHaveClass("tone-warn");
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis festhalten" }));
    await userEvent.click(await screen.findByRole("button", { name: "Absage erhalten" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "REJECTED" }]));
  });
});
