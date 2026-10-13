import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobQueryOptions, type JobChecklist, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { blockAnchorNavigation } from "../../support/blockNavigation";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date("2026-10-08T10:00:00Z");
const READY = { status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true };
const DOCUMENTS = [
  {
    id: 4,
    original_filename: "Lebenslauf_ACME.pdf",
    file_size: 1,
    mime_type: "application/pdf",
    kind: "GENERATED_CV",
    uploaded_at: null,
  },
  {
    id: 5,
    original_filename: "Anschreiben_ACME.pdf",
    file_size: 1,
    mime_type: "application/pdf",
    kind: "GENERATED_LETTER",
    uploaded_at: null,
  },
];
const pdf = () => new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });

blockAnchorNavigation();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
});

afterEach(() => vi.useRealTimers());

function show(job: JobDetail, seedCache = false, overrides: Record<string, unknown> = {}) {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": [],
    "GET /jobs/job-1/documents": DOCUMENTS,
    "GET /jobs/job-1/documents/4/download": pdf,
    "GET /jobs/job-1/documents/5/download": pdf,
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/status": (call: RecordedCall) =>
      jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to }),
    ...overrides,
  });
  const { queryClient } = renderWithProviders(<NextStepCard job={job} />);
  // The page reads the job from this cache entry; seeding it mirrors that.
  if (seedCache) queryClient.setQueryData(queryKeys.job(job.id), job);
  return Object.assign(calls, { queryClient });
}

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));
const statusPosts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.url.endsWith("/status")).map((call) => JSON.parse(call.body ?? ""));

describe("ApplyChecklist", () => {
  it("shows the three steps with their stored state", () => {
    show(
      buildJob({
        ...READY,
        checklist: { posting_opened: true, documents_checked: false, sent: false },
      }),
    );
    expect(screen.getByLabelText("Stellenanzeige geöffnet")).toBeChecked();
    expect(screen.getByLabelText("Unterlagen geprüft")).not.toBeChecked();
    expect(screen.getByLabelText("Beim Arbeitgeber abgeschickt")).not.toBeChecked();
  });

  it("sends all three keys when ticking one", async () => {
    const calls = show(
      buildJob({
        ...READY,
        checklist: { posting_opened: true, documents_checked: false, sent: false },
      }),
    );
    await userEvent.click(screen.getByLabelText("Beim Arbeitgeber abgeschickt"));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: true, documents_checked: false, sent: true } },
      ]),
    );
  });

  it("keeps an earlier tick when a second one follows before the job refreshes", async () => {
    const calls = show(buildJob(READY), true);
    await userEvent.click(screen.getByLabelText("Stellenanzeige geöffnet"));
    await userEvent.click(screen.getByLabelText("Unterlagen geprüft"));
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1]).toEqual({
      checklist: { posting_opened: true, documents_checked: true, sent: false },
    });
  });

  it.each(["data:text/html,<b>x</b>", "ftp://acme.de/job"])(
    "offers no posting button for %s",
    (url) => {
      show(buildJob({ ...READY, url }));
      expect(screen.queryByRole("link", { name: /Anzeige bei/ })).not.toBeInTheDocument();
    },
  );

  it("offers the posting button for an http URL", () => {
    show(buildJob(READY));
    expect(screen.getByRole("link", { name: "Anzeige bei ACME GmbH öffnen" })).toHaveAttribute(
      "href",
      "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
    );
  });

  it("ticks the posting step when the posting is opened", async () => {
    const calls = show(buildJob(READY));
    const link = screen.getByRole("link", { name: "Anzeige bei ACME GmbH öffnen" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await userEvent.click(link);
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: true, documents_checked: false, sent: false } },
      ]),
    );
  });

  it("downloads both PDFs and ticks the documents step", async () => {
    const calls = show(buildJob(READY));
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: false, documents_checked: true, sent: false } },
      ]),
    );
    expect(calls.filter((call) => call.url.endsWith("/download"))).toHaveLength(2);
  });

  it("marks as applied today and suggests a follow-up date", async () => {
    const calls = show(buildJob(READY));
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
    await waitFor(() => expect(patches(calls)[0].next_follow_up_at).toMatch(/^2026-10-18T/));
  });

  it("refreshes the lists and the nav counts after saving the follow-up date", async () => {
    const calls = show(buildJob(READY));
    const invalidate = vi.spyOn(calls.queryClient, "invalidateQueries");
    const invalidated = (key: readonly string[]) =>
      invalidate.mock.calls.filter(([filters]) => filters?.queryKey?.join() === key.join()).length;
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    // Once for the status change, once more for the new follow-up date.
    await waitFor(() => expect(invalidated(queryKeys.jobCounts)).toBe(2));
    expect(invalidated(queryKeys.jobsRoot)).toBe(2);
  });

  it("records a past apply date in the note", async () => {
    const calls = show(buildJob(READY));
    const date = screen.getByLabelText("Datum der Bewerbung");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-05");
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "APPLIED", note: "Beworben am 05.10.2026" }]),
    );
  });
});

describe("ApplyWithoutDocuments", () => {
  it("warns which document is missing before marking as applied", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    await userEvent.click(
      screen.getByRole("button", { name: "Ohne Unterlagen als beworben markieren" }),
    );
    expect(
      screen.getByText(/Lebenslauf fertig, Anschreiben fehlt/).closest('[role="alert"]'),
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Trotzdem als beworben markieren" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
  });

  it("can be cancelled", async () => {
    show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Ohne Unterlagen als beworben markieren" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(
      screen.queryByText(/Hast du dich mit eigenen Unterlagen beworben/),
    ).not.toBeInTheDocument();
  });
});

const NONE_TICKED: JobChecklist = { posting_opened: false, documents_checked: false, sent: false };
const TICKS = ["Stellenanzeige geöffnet", "Unterlagen geprüft", "Beim Arbeitgeber abgeschickt"];

interface FakeServer {
  checklist: JobChecklist;
  calls: RecordedCall[];
  /** Answers PATCH number `failing` (1-based) with a server error. */
  failing?: number;
}

function LiveCard() {
  const job = useQuery(jobQueryOptions("job-1")).data;
  return job ? <NextStepCard job={job} /> : null;
}

/** A job whose GET always answers with what the last successful PATCH stored. */
function serve(server: FakeServer): void {
  let patchCount = 0;
  server.calls = stubRoutes({
    "GET /jobs/job-1": () => jsonResponse(200, buildJob({ ...READY, checklist: server.checklist })),
    "GET /jobs/job-1/history": [],
    "PATCH /jobs/job-1": (call: RecordedCall) => {
      patchCount += 1;
      if (patchCount === server.failing) return jsonResponse(500, { detail: "boom" });
      server.checklist = JSON.parse(call.body ?? "").checklist;
      return jsonResponse(200, { status: "updated" });
    },
  });
}

/** Holds back the first PATCH until `release()`, like a slow network. */
function delayFirstPatch(): () => void {
  const send = globalThis.fetch;
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH" && first) {
      first = false;
      await gate;
    }
    return send(input, init);
  });
  return release;
}

async function tickAll(): Promise<void> {
  for (const label of TICKS) await userEvent.click(await screen.findByLabelText(label));
}

describe("rapid ticks", () => {
  it("keeps all three ticks while the first request is slow and the refetch is stale", async () => {
    const server: FakeServer = { checklist: NONE_TICKED, calls: [] };
    serve(server);
    const release = delayFirstPatch();
    renderWithProviders(<LiveCard />);
    await tickAll();
    release();
    await waitFor(() => expect(patches(server.calls)).toHaveLength(3));
    expect(patches(server.calls)[2]).toEqual({
      checklist: { posting_opened: true, documents_checked: true, sent: true },
    });
    for (const label of TICKS)
      await waitFor(() => expect(screen.getByLabelText(label)).toBeChecked());
  });

  it("rolls a failed tick back and keeps the others", async () => {
    const server: FakeServer = { checklist: NONE_TICKED, calls: [], failing: 2 };
    serve(server);
    renderWithProviders(<LiveCard />);
    await userEvent.click(await screen.findByLabelText(TICKS[0]));
    await waitFor(() => expect(patches(server.calls)).toHaveLength(1));
    await userEvent.click(screen.getByLabelText(TICKS[1]));
    await waitFor(() => expect(screen.getByLabelText(TICKS[1])).not.toBeChecked());
    expect(screen.getByLabelText(TICKS[0])).toBeChecked();
  });

  it("reports a failing middle tick and ends on what the server stored", async () => {
    const server: FakeServer = { checklist: NONE_TICKED, calls: [], failing: 2 };
    serve(server);
    const release = delayFirstPatch();
    renderWithProviders(<LiveCard />);
    await tickAll();
    release();
    await waitFor(() => expect(patches(server.calls)).toHaveLength(3));
    await waitFor(() => expect(screen.getByLabelText(TICKS[2])).toBeChecked());
    expect(screen.getByLabelText(TICKS[0])).toBeChecked();
    expect(screen.getByLabelText(TICKS[1])).toBeChecked();
  });
});

describe("apply date validation", () => {
  it("refuses a future date", async () => {
    const calls = show(buildJob(READY));
    const date = screen.getByLabelText("Datum der Bewerbung");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-09");
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    expect(
      screen.getByText("Bitte ein gültiges Datum wählen, nicht in der Zukunft."),
    ).toBeInTheDocument();
    expect(statusPosts(calls)).toEqual([]);
  });

  it("refuses an empty date", async () => {
    const calls = show(buildJob(READY));
    await userEvent.clear(screen.getByLabelText("Datum der Bewerbung"));
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    expect(
      screen.getByText("Bitte ein gültiges Datum wählen, nicht in der Zukunft."),
    ).toBeInTheDocument();
    expect(statusPosts(calls)).toEqual([]);
  });

  it("says so when the status is saved but the follow-up date is not", async () => {
    const calls = show(buildJob(READY), false, {
      "PATCH /jobs/job-1": () => jsonResponse(500, { detail: "x" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    expect(
      await screen.findByText(
        "Als beworben gespeichert, aber das Nachfassdatum konnte nicht gespeichert werden.",
      ),
    ).toBeInTheDocument();
    expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]);
  });
});

describe("download step", () => {
  it("revokes the object URL after saving", async () => {
    show(buildJob(READY));
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file"));
  });

  it("shows the Drive message and does not tick when a file is not downloadable", async () => {
    const calls = show(buildJob(READY), false, {
      "GET /jobs/job-1/documents/4/download": () => jsonResponse(400, { detail: "drive" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    expect(
      await screen.findByText("Dateien aus Google Drive lassen sich hier noch nicht öffnen."),
    ).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("does not tick when the second download fails", async () => {
    const calls = show(buildJob(READY), false, {
      "GET /jobs/job-1/documents/5/download": () => jsonResponse(500, { detail: "x" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Beide PDFs herunterladen" })).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    expect(patches(calls)).toEqual([]);
  });

  it("does not tick when there is nothing to download", async () => {
    const calls = show(buildJob(READY), false, { "GET /jobs/job-1/documents": [] });
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    expect(
      await screen.findByText("Es gibt noch keine Unterlagen zum Herunterladen."),
    ).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });
});
