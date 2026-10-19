import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { useJob } from "@/features/job/useJob";
import { HistoryTab } from "@/features/job/history/HistoryTab";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const HISTORY = [
  {
    id: 2,
    from_status: "DRAFTED",
    to_status: "APPLIED",
    changed_at: "2026-10-05T10:00:00Z",
    note: "Beworben am 05.10.2026",
  },
  {
    id: 1,
    from_status: "OPEN",
    to_status: "DRAFTED",
    changed_at: "2026-10-03T10:00:00Z",
    note: null,
  },
];

function show(job: JobDetail, routes: Record<string, unknown> = {}): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": HISTORY,
    "PATCH /jobs/job-1": { status: "updated" },
    ...routes,
  });
  renderWithProviders(<HistoryTab job={job} />);
  return calls;
}

interface GatedBackend {
  patches: string[];
  /** Answers the oldest PATCH that is still waiting. */
  release: (status?: number) => Promise<void>;
}

/** Holds every PATCH until the test releases it, to observe ordering. */
function gatedBackend(job: JobDetail): GatedBackend {
  const patches: string[] = [];
  const waiting: Array<(status: number) => void> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PATCH") {
      patches.push(String(init?.body));
      const status = await new Promise<number>((resolve) => waiting.push(resolve));
      return jsonResponse(status, { status: "updated" });
    }
    return jsonResponse(200, String(input).endsWith("/history") ? HISTORY : job);
  });
  const release = async (status = 200) => {
    await act(async () => waiting.shift()?.(status));
  };
  return { patches, release };
}

const unloadWarned = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));

describe("Timeline", () => {
  it("colours each dot by a phase class, not an inline style", async () => {
    show(buildJob({ status: "APPLIED" }));
    const timeline = await screen.findByRole("list", { name: "Verlauf" });
    const row = (await within(timeline).findByText(/Phase: Beworben/)).closest("li");
    const dot = row?.querySelector(".tl-dot");
    expect(dot).toHaveClass("tl-dot--applied");
    expect(dot).not.toHaveAttribute("style");
  });

  it("names a declined offer neutrally", async () => {
    const declined = {
      id: 3,
      from_status: "OFFER",
      to_status: "REJECTED",
      changed_at: "2026-10-07T10:00:00Z",
      note: "Angebot abgelehnt",
    };
    show(buildJob({ status: "REJECTED" }), { "GET /jobs/job-1/history": [declined, ...HISTORY] });
    const timeline = await screen.findByRole("list", { name: "Verlauf" });
    const first = await within(timeline).findByText(/Phase: Abgesagt/);
    expect(first.closest("li")).toHaveTextContent("Angebot abgelehnt");
  });

  it("lists every phase change with its note, newest first", async () => {
    show(buildJob({ status: "APPLIED" }));
    const timeline = await screen.findByRole("list", { name: "Verlauf" });
    const items = await waitFor(() => {
      const found = within(timeline).getAllByRole("listitem");
      expect(found.length).toBeGreaterThan(1);
      return found;
    });
    expect(items[0]).toHaveTextContent("Phase: Beworben");
    expect(items[0]).toHaveTextContent("Beworben am 05.10.2026");
    expect(items[1]).toHaveTextContent("Phase: Vorgemerkt");
    expect(items[items.length - 1]).toHaveTextContent("Gefunden");
  });
});

describe("NotesEditor", () => {
  it("saves the notes after a pause in typing", async () => {
    const calls = show(buildJob({ notes: "" }));
    await userEvent.type(screen.getByLabelText("Notizen"), "Rückruf Montag");
    await waitFor(() => expect(patches(calls)).toEqual([{ notes: "Rückruf Montag" }]), {
      timeout: 2000,
    });
    expect(await screen.findByText("Gespeichert")).toBeInTheDocument();
  });
});

const MAX_NOTES = 20_000;

describe("NotesEditor leaving and failing", () => {
  it("sends a pending save when the tab is left within the pause", async () => {
    const calls = stubRoutes({
      "GET /jobs/job-1/history": HISTORY,
      "PATCH /jobs/job-1": { status: "updated" },
    });
    const view = renderWithProviders(<HistoryTab job={buildJob({ notes: "" })} />);
    await userEvent.type(screen.getByLabelText("Notizen"), "Rückruf");
    expect(patches(calls)).toEqual([]);
    view.unmount();
    await waitFor(() => expect(patches(calls)).toEqual([{ notes: "Rückruf" }]));
  });

  it("marks unsaved changes until the save is confirmed", async () => {
    const backend = gatedBackend(buildJob({ notes: "" }));
    renderWithProviders(<HistoryTab job={buildJob({ notes: "" })} />);
    expect(unloadWarned()).toBe(false);
    await userEvent.type(screen.getByLabelText("Notizen"), "a");
    expect(unloadWarned()).toBe(true);
    await waitFor(() => expect(backend.patches).toHaveLength(1));
    expect(unloadWarned()).toBe(true);
    await backend.release();
    await waitFor(() => expect(unloadWarned()).toBe(false));
  });

  it("names the failure instead of advising to keep typing", async () => {
    show(buildJob({ notes: "" }), { "PATCH /jobs/job-1": jsonResponse(422, { detail: "bad" }) });
    await userEvent.type(screen.getByLabelText("Notizen"), "x");
    expect(await screen.findByText(/Nicht gespeichert\./, {}, { timeout: 2000 })).toHaveTextContent(
      "Die Eingabe ist ungültig.",
    );
    expect(screen.queryByText(/Tippe weiter/)).not.toBeInTheDocument();
  });

  it("refuses notes beyond the server limit and says so", async () => {
    const calls = show(buildJob({ notes: "" }));
    const area = screen.getByLabelText("Notizen");
    expect(area).toHaveAttribute("maxlength", String(MAX_NOTES));
    fireEvent.change(area, { target: { value: "x".repeat(MAX_NOTES + 1) } });
    expect(
      await screen.findByText("Die Notizen sind zu lang (höchstens 20000 Zeichen)."),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(patches(calls)).toEqual([]);
  });

  it("saves in order and only the latest answer settles the state", async () => {
    const backend = gatedBackend(buildJob({ notes: "" }));
    renderWithProviders(<HistoryTab job={buildJob({ notes: "" })} />);
    await userEvent.type(screen.getByLabelText("Notizen"), "a");
    await waitFor(() => expect(backend.patches).toHaveLength(1), { timeout: 2000 });
    await userEvent.type(screen.getByLabelText("Notizen"), "b");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(backend.patches).toHaveLength(1);
    await backend.release();
    await waitFor(() => expect(backend.patches).toHaveLength(2));
    expect(JSON.parse(backend.patches[1])).toEqual({ notes: "ab" });
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
    await backend.release();
    expect(await screen.findByText("Gespeichert")).toBeInTheDocument();
  });

  it("announces only settled states in the live region", async () => {
    const backend = gatedBackend(buildJob({ notes: "" }));
    renderWithProviders(<HistoryTab job={buildJob({ notes: "" })} />);
    await userEvent.type(screen.getByLabelText("Notizen"), "a");
    const saving = await screen.findByText("Wird gespeichert …");
    expect(saving.closest("[aria-live]")).toBeNull();
    await waitFor(() => expect(backend.patches).toHaveLength(1), { timeout: 2000 });
    await backend.release();
    expect((await screen.findByText("Gespeichert")).closest("[aria-live]")).not.toBeNull();
  });
});

describe("Timeline states", () => {
  it("shows a loading text, then an empty text without status changes", async () => {
    show(buildJob(), { "GET /jobs/job-1/history": [] });
    // A loading text is transitional: it must not be announced as a status (pristine live regions).
    expect(screen.getByText("Verlauf wird geladen …")).not.toHaveAttribute("role");
    expect(await screen.findByText("Noch keine Statuswechsel.")).toBeInTheDocument();
  });

  it("names a failed load and retries on request", async () => {
    const calls = show(buildJob(), {
      "GET /jobs/job-1/history": jsonResponse(500, { detail: "x" }),
    });
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() =>
      expect(calls.filter((call) => call.url.endsWith("/history"))).toHaveLength(2),
    );
  });

  it("puts rows without a date after the dated ones", async () => {
    show(buildJob(), {
      "GET /jobs/job-1/history": [
        { id: 9, from_status: null, to_status: "REJECTED", changed_at: null, note: "ohne Datum" },
        ...HISTORY,
      ],
    });
    const timeline = await screen.findByRole("list", { name: "Verlauf" });
    await waitFor(() => expect(within(timeline).getAllByRole("listitem").length).toBe(4));
    const items = within(timeline).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Phase: Beworben");
    expect(items[2]).toHaveTextContent("ohne Datum");
  });
});

/** Keeps the page (and its query) alive while the history tab is shown and hidden like a tab switch. */
function SwitchableTab() {
  const [shown, setShown] = useState(true);
  const job = useJob("job-1");
  const { requestLeave } = useUnsavedChanges();
  const [answer, setAnswer] = useState("");
  return (
    <>
      <button onClick={() => setShown((value) => !value)}>switch</button>
      <button onClick={() => void requestLeave().then((leave) => setAnswer(String(leave)))}>
        ask
      </button>
      <output>{answer}</output>
      {shown && job.data ? <HistoryTab job={job.data} /> : null}
    </>
  );
}

describe("NotesEditor leaving without a dialog", () => {
  it("never asks to discard notes in the app, but still warns on unload", async () => {
    stubRoutes({ "GET /jobs/job-1": buildJob({ notes: "" }), "GET /jobs/job-1/history": HISTORY });
    renderWithProviders(<SwitchableTab />);
    await userEvent.type(await screen.findByLabelText("Notizen"), "x");
    expect(unloadWarned()).toBe(true);
    await userEvent.click(screen.getByText("ask"));
    expect(await screen.findByText("true")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error toast when the save sent on leaving fails", async () => {
    stubRoutes({
      "GET /jobs/job-1": buildJob({ notes: "" }),
      "GET /jobs/job-1/history": HISTORY,
      "PATCH /jobs/job-1": jsonResponse(500, { detail: "x" }),
    });
    renderWithProviders(<SwitchableTab />);
    await userEvent.type(await screen.findByLabelText("Notizen"), "x");
    await userEvent.click(screen.getByText("switch"));
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
  });

  it("adopts the saved notes when the tab is reopened while the save is in flight", async () => {
    const backend = gatedBackend(buildJob({ notes: "" }));
    renderWithProviders(<SwitchableTab />);
    await userEvent.type(await screen.findByLabelText("Notizen"), "Rückruf");
    await userEvent.click(screen.getByText("switch"));
    await waitFor(() => expect(backend.patches).toHaveLength(1));
    await userEvent.click(screen.getByText("switch"));
    expect(await screen.findByLabelText("Notizen")).toHaveValue("");
    await backend.release();
    await waitFor(() => expect(screen.getByLabelText("Notizen")).toHaveValue("Rückruf"));
  });

  it("does not send adopted notes again when the tab is left", async () => {
    const backend = gatedBackend(buildJob({ notes: "" }));
    renderWithProviders(<SwitchableTab />);
    await userEvent.type(await screen.findByLabelText("Notizen"), "Rückruf");
    await userEvent.click(screen.getByText("switch"));
    await waitFor(() => expect(backend.patches).toHaveLength(1));
    await userEvent.click(screen.getByText("switch"));
    await backend.release();
    await waitFor(() => expect(screen.getByLabelText("Notizen")).toHaveValue("Rückruf"));
    await userEvent.click(screen.getByText("switch"));
    await act(async () => undefined);
    expect(backend.patches).toEqual([JSON.stringify({ notes: "Rückruf" })]);
  });
});
