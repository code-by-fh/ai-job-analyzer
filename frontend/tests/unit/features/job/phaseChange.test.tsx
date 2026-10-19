import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { PhaseTrack } from "@/features/job/phase/PhaseTrack";
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

const READY = { cv_html_present: true, cover_letter_html_present: true };
const HISTORY = [
  {
    id: 1,
    from_status: "OPEN",
    to_status: "DRAFTED",
    changed_at: "2026-10-03T10:00:00Z",
    note: null,
  },
];

beforeEach(() => navigation.replace.mockReset());

/** Echoes the posted target as the new status, like the server does. */
function setup(job: JobDetail, statusResponse?: Response): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": HISTORY,
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/status":
      statusResponse ??
      ((call: RecordedCall) =>
        jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to })),
  });
  renderWithProviders(<PhaseTrack job={job} />);
  return calls;
}

const statusPosts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "POST").map((call) => JSON.parse(call.body ?? ""));

const patchBodies = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));

async function choose(target: string) {
  await userEvent.click(screen.getByRole("button", { name: "Phase ändern" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: target }));
}

describe("PhaseTrack", () => {
  it("shows the read-only track with dates and a skipped phase", async () => {
    setup(buildJob({ status: "INTERVIEW", ...READY }));
    await screen.findByText(/03\.10\./);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("03.10.");
    expect(items[2]).toHaveClass("skipped");
    expect(items[3]).toHaveAttribute("aria-current", "step");
  });

  it("names a rejection or withdrawal neutrally on a closed job", async () => {
    setup(buildJob({ status: "REJECTED" }));
    const items = await screen.findAllByRole("listitem");
    expect(items[5]).toHaveTextContent("Abgesagt");
  });

  it("names an accepted offer on a closed job", async () => {
    setup(buildJob({ status: "ACCEPTED" }));
    const items = await screen.findAllByRole("listitem");
    expect(items[5]).toHaveTextContent("Zusage angenommen");
  });

  it("moves one phase forward without asking", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Beworben");
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
  });

  it("asks before moving back and sends the note", async () => {
    const calls = setup(buildJob({ status: "INTERVIEW", ...READY }));
    await choose("Vorgemerkt");
    const dialog = screen.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
    await userEvent.type(
      within(dialog).getByLabelText("Notiz für den Verlauf (optional)"),
      "Absage zurückgezogen",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "DRAFTED", note: "Absage zurückgezogen" }]),
    );
  });

  it("asks before skipping phases", async () => {
    setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Interview");
    expect(screen.getByRole("dialog", { name: "Beworben überspringen?" })).toBeInTheDocument();
  });

  it("warns before applying without documents and offers to create them", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", cv_html_present: true }));
    await choose("Beworben");
    const dialog = screen.getByRole("dialog", { name: "Ohne fertige Unterlagen?" });
    expect(dialog).toHaveTextContent("Anschreiben");
    await userEvent.click(within(dialog).getByRole("button", { name: "Unterlagen erstellen" }));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=unterlagen", {
      scroll: false,
    });
    expect(statusPosts(calls)).toEqual([]);
  });

  it("names the skipped phases when applying without documents from further back", async () => {
    setup(buildJob({ status: "OPEN" }));
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Ohne fertige Unterlagen?" });
    expect(dialog).toHaveTextContent("Vorgemerkt und Beworben");
  });

  it("puts a back-dated apply date into the status note", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Beworben überspringen?" });
    await userEvent.type(
      within(dialog).getByLabelText("Notiz für den Verlauf (optional)"),
      "am 01.10.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Auf Interview setzen" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "INTERVIEW", note: "am 01.10." }]),
    );
  });

  it("closes as withdrawn with a history note", async () => {
    const calls = setup(buildJob({ status: "OFFER", ...READY }));
    await choose("Abgeschlossen");
    const dialog = screen.getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Selbst abgesagt" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "REJECTED", note: "Selbst abgesagt" }]),
    );
  });

  it("closes as accepted", async () => {
    const calls = setup(buildJob({ status: "OFFER", ...READY }));
    await choose("Abgeschlossen");
    await userEvent.click(screen.getByRole("button", { name: "Zusage angenommen" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "ACCEPTED" }]));
  });

  it("locks the menu while documents are generated", async () => {
    setup(buildJob({ status: "GENERATING" }));
    await userEvent.click(await screen.findByRole("button", { name: "Phase ändern" }));
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(/bleibt die Phase gesperrt/)).toBeInTheDocument();
  });

  it("tells a seen job to be shortlisted or sorted out first, not that it is locked", async () => {
    setup(buildJob({ status: "SEEN" }));
    expect(await screen.findByText("Erst vormerken oder aussortieren.")).toBeInTheDocument();
    expect(screen.queryByText(/bleibt die Phase gesperrt/)).not.toBeInTheDocument();
  });

  it("blocks the menu while a status change runs", async () => {
    setup(
      buildJob({ status: "DRAFTED", ...READY }),
      // A status request that never answers keeps the change running.
      (() => new Promise<Response>(() => undefined)) as unknown as Response,
    );
    await choose("Beworben");
    const button = screen.getByRole("button", { name: "Phase ändern" });
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the menu available for an archived job", async () => {
    setup(buildJob({ status: "DRAFTED", is_archived: true, ...READY }));
    await choose("Beworben");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Phase: Beworben."));
  });

  it("undoes a change from the toast", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Beworben");
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }, { to: "DRAFTED" }]));
  });

  it("undoes a change made through the confirmation dialog", async () => {
    const calls = setup(buildJob({ status: "INTERVIEW", ...READY }));
    await choose("Vorgemerkt");
    const dialog = screen.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "DRAFTED" }, { to: "INTERVIEW" }]),
    );
    expect(await screen.findByText("Rückgängig gemacht: wieder Interview.")).toBeInTheDocument();
  });

  it("says when the server refuses the undo", async () => {
    const job = buildJob({ status: "DRAFTED", ...READY });
    let posts = 0;
    setup(job, ((call: RecordedCall) => {
      posts += 1;
      if (posts > 1) return jsonResponse(409, { detail: "locked" });
      return jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to });
    }) as unknown as Response);
    await choose("Beworben");
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    expect(
      await screen.findByText("Diese Phase lässt sich gerade nicht setzen."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Rückgängig gemacht/)).not.toBeInTheDocument();
  });

  it("says when the server refuses the change", async () => {
    setup(
      buildJob({ status: "DRAFTED", ...READY }),
      jsonResponse(409, { detail: "Cannot change status from 'GENERATING' to 'APPLIED'" }),
    );
    await choose("Beworben");
    expect(
      await screen.findByText("Diese Phase lässt sich gerade nicht setzen."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/GENERATING/)).not.toBeInTheDocument();
  });

  it("selects the Firma tab after a change to Beworben", async () => {
    setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Beworben");
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=firma", { scroll: false }),
    );
  });

  it("selects the Verlauf tab after a change to Angebot", async () => {
    setup(buildJob({ status: "INTERVIEW", ...READY }));
    await choose("Angebot");
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=verlauf", {
        scroll: false,
      }),
    );
  });

  it("keeps the tab when the server refuses the change", async () => {
    setup(buildJob({ status: "DRAFTED", ...READY }), jsonResponse(409, { detail: "locked" }));
    await choose("Beworben");
    await screen.findByText("Diese Phase lässt sich gerade nicht setzen.");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("asks for the interview date but changes to Interview without one", async () => {
    const calls = setup(buildJob({ status: "APPLIED", ...READY }));
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Steht der Interviewtermin schon?" });
    expect(within(dialog).getByLabelText("Interviewtermin (optional)")).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Auf Interview setzen" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "INTERVIEW" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patchBodies(calls)).toEqual([]);
  });

  it("saves an entered interview date after the change", async () => {
    const calls = setup(buildJob({ status: "APPLIED", ...READY }));
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Steht der Interviewtermin schon?" });
    await userEvent.type(within(dialog).getByLabelText("Interviewtermin (optional)"), "2026-10-20");
    await userEvent.type(within(dialog).getByLabelText("Uhrzeit (optional)"), "14:30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Auf Interview setzen" }));
    await waitFor(() =>
      expect(patchBodies(calls)).toEqual([
        { interview_at: new Date(2026, 9, 20, 14, 30).toISOString() },
      ]),
    );
    expect(statusPosts(calls)).toEqual([{ to: "INTERVIEW" }]);
  });

  it("says where to add the date when only its save fails", async () => {
    const job = buildJob({ status: "APPLIED", ...READY });
    stubRoutes({
      "GET /jobs/job-1/history": HISTORY,
      "PATCH /jobs/job-1": jsonResponse(500, { detail: "boom" }),
      "POST /jobs/job-1/status": jsonResponse(200, { ...job, status: "INTERVIEW" }),
    });
    renderWithProviders(<PhaseTrack job={job} />);
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Steht der Interviewtermin schon?" });
    await userEvent.type(within(dialog).getByLabelText("Interviewtermin (optional)"), "2026-10-20");
    await userEvent.click(within(dialog).getByRole("button", { name: "Auf Interview setzen" }));
    expect(
      await screen.findByText(/der Interviewtermin aber nicht gespeichert/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("names a stored interview date and keeps it when the field stays empty", async () => {
    const calls = setup(
      buildJob({ status: "OFFER", ...READY, interview_at: "2026-10-12T07:00:00Z" }),
    );
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Zurück auf Interview?" });
    expect(dialog).toHaveTextContent("Eingetragen: 12.10.2026. Leer lassen, um ihn zu behalten.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "INTERVIEW" }]));
    expect(patchBodies(calls)).toEqual([]);
  });

  it("offers the interview date also when the change skips phases", async () => {
    setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Interview");
    const dialog = screen.getByRole("dialog", { name: "Beworben überspringen?" });
    expect(within(dialog).getByLabelText("Interviewtermin (optional)")).toBeInTheDocument();
  });

  it("asks no interview date for other targets", async () => {
    setup(buildJob({ status: "INTERVIEW", ...READY }));
    await choose("Vorgemerkt");
    const dialog = screen.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
    expect(within(dialog).queryByLabelText("Interviewtermin (optional)")).not.toBeInTheDocument();
  });
});
