import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/api/jobList";
import { inboxListPath } from "@/api/jobListPaths";
import { queryKeys } from "@/api/queryKeys";
import { InboxPage } from "@/features/inbox/InboxPage";
import { useTriage, type TriageEvents } from "@/features/inbox/useTriage";
import { applyEvent } from "@/realtime/applyEvent";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { HTTP_OK, inboxJobs, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildJob } from "../../support/jobFactory";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
const KOTLIN = buildListItem({ id: "job-1", title: "Senior Kotlin Engineer", company: "N26" });
const JAVA = buildListItem({ id: "job-2", title: "Backend Engineer (Java)", company: "Personio" });
const PHP = buildListItem({
  id: "job-20",
  title: "Fullstack-Entwickler PHP",
  is_archived: true,
  archive_reason: "THRESHOLD",
});
const LEAD = buildListItem({
  id: "job-17",
  title: "Teamlead Java Backend",
  company: "Check24",
  status: "APPLIED",
  is_archived: true,
  archive_reason: "USER",
});

function server(): InboxServer {
  return { new: [KOTLIN, JAVA], below: [PHP], dismissed: [LEAD], due: [] };
}

/** A response the test releases later, so two requests really overlap. */
function deferred() {
  let release: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { response, release };
}

const ok = (body: unknown = { status: "updated" }) => jsonResponse(HTTP_OK, body);
const failed = () => jsonResponse(HTTP_SERVER_ERROR, { detail: "db" });
const without = (rows: JobListItem[], id: string) => rows.filter((row) => row.id !== id);
const pathOf = (call: RecordedCall) => `${call.method} ${new URL(call.url).pathname}`;
const bodies = (calls: RecordedCall[], key: string) =>
  calls.filter((call) => pathOf(call) === key).map((call) => JSON.parse(call.body ?? "null"));
const NEW_LIST = inboxListPath("new", 0);
const newListLoads = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "GET" && call.url.endsWith(NEW_LIST)).length;
const link = (name: string) => screen.queryByRole("link", { name });
const rowTitles = () =>
  within(screen.getByRole("tabpanel"))
    .getAllByRole("link")
    .map((row) => row.textContent);
const NEW_JOB_EVENT = { type: "new_job", user_id: 1, job: { id: "job-99" } } as const;
// With KOTLIN two rows more than a page, so "Weitere laden" still shows after one row left.
const FULL_PAGE = Array.from({ length: 51 }, (_, index) =>
  buildListItem({ id: `job-page-${index}`, title: `Stelle ${index}` }),
);
const OTHER = buildListItem({
  id: "job-18",
  title: "Java Architekt",
  company: "Otto",
  is_archived: true,
  archive_reason: "USER",
});

async function pressOn(name: string) {
  (await screen.findByRole("button", { name })).focus();
  await userEvent.keyboard("{Enter}");
}

/** Lets pending fetches and renders run; used only before asserting that something did NOT happen. */
const settleTicks = () => new Promise((resolve) => setTimeout(resolve, 20));

function TriageProbe({ events }: { events: TriageEvents }) {
  const triage = useTriage("new", events);
  return (
    <button type="button" onClick={() => triage.dismiss(KOTLIN)}>
      probe
    </button>
  );
}

/** PATCH /jobs/{id} that archives on the fake server once the test releases its response. */
function heldArchive(data: InboxServer, id: string) {
  const held = deferred();
  const route = async () => {
    const response = await held.response;
    if (response.ok) data.new = without(data.new, id);
    return response;
  };
  return { route, release: held.release };
}

/** PATCH /jobs/{id} that archives on the fake server at once. */
function archiveOn(data: InboxServer, id: string) {
  return () => {
    data.new = without(data.new, id);
    return ok();
  };
}

/** POST /jobs/job-1/status that moves Kotlin out of "Neu" and back again, like the server. */
function kotlinStatus(data: InboxServer) {
  return (call: RecordedCall) => {
    const to = JSON.parse(call.body ?? "{}").to as string;
    data.new = to === "OPEN" ? [KOTLIN, ...data.new] : without(data.new, "job-1");
    return ok(buildJob({ id: "job-1", status: to }));
  };
}

async function click(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.params = new URLSearchParams();
  // These suites describe the list below 1200 px, without the preview pane.
  installFakeMatchMedia(false);
});

describe("triage in Neu", () => {
  it("shortlists at once and undoes from the toast", async () => {
    const data = server();
    const calls = stubRoutes(inboxStubs(data, { "POST /jobs/job-1/status": kotlinStatus(data) }));
    renderWithProviders(<InboxPage />);
    await click("Vormerken: Senior Kotlin Engineer");
    await waitFor(() => expect(link("Senior Kotlin Engineer")).not.toBeInTheDocument());
    expect(
      await screen.findByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen."),
    ).toBeInTheDocument();
    await click("Rückgängig");
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(
      await screen.findByText("Rückgängig gemacht: N26 ist wieder unter Neu."),
    ).toBeInTheDocument();
    expect(bodies(calls, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }, { to: "OPEN" }]);
  });

  it("puts the row back and says why when the dismiss fails", async () => {
    stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-1": failed() }));
    renderWithProviders(<InboxPage />);
    await click("Aussortieren: Senior Kotlin Engineer");
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
  });

  it("sorting out two rows in a row keeps both out", async () => {
    const data = server();
    const first = heldArchive(data, "job-1");
    const second = heldArchive(data, "job-2");
    const routes = { "PATCH /jobs/job-1": first.route, "PATCH /jobs/job-2": second.route };
    const calls = stubRoutes(inboxStubs(data, routes));
    renderWithProviders(<InboxPage />);
    await click("Aussortieren: Senior Kotlin Engineer");
    await click("Aussortieren: Backend Engineer (Java)");
    expect(link("Senior Kotlin Engineer")).not.toBeInTheDocument();
    expect(link("Backend Engineer (Java)")).not.toBeInTheDocument();
    // Triage requests run one after the other: the second waits for the first answer.
    expect(bodies(calls, "PATCH /jobs/job-2")).toEqual([]);
    const loadsBefore = newListLoads(calls);
    first.release(ok());
    await waitFor(() =>
      expect(bodies(calls, "PATCH /jobs/job-2")).toEqual([{ is_archived: true }]),
    );
    // No refetch while the second triage runs, so its row cannot flicker back from a stale list.
    expect(newListLoads(calls)).toBe(loadsBefore);
    expect(link("Backend Engineer (Java)")).not.toBeInTheDocument();
    second.release(ok());
    expect(
      await screen.findByRole("heading", { level: 2, name: "Keine neuen Treffer" }),
    ).toBeVisible();
    expect(newListLoads(calls)).toBe(loadsBefore + 1);
    expect(screen.queryByRole("link", { name: /Engineer/ })).not.toBeInTheDocument();
  });

  it("puts back only the row whose dismiss failed", async () => {
    const data = server();
    const first = heldArchive(data, "job-1");
    const second = heldArchive(data, "job-2");
    const routes = { "PATCH /jobs/job-1": first.route, "PATCH /jobs/job-2": second.route };
    const calls = stubRoutes(inboxStubs(data, routes));
    renderWithProviders(<InboxPage />);
    await click("Aussortieren: Senior Kotlin Engineer");
    await click("Aussortieren: Backend Engineer (Java)");
    first.release(failed());
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    // Back at its old place, the top of the list.
    expect(rowTitles()[0]).toBe("Senior Kotlin Engineer");
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeInTheDocument();
    await waitFor(() => expect(bodies(calls, "PATCH /jobs/job-2")).toHaveLength(1));
    expect(link("Backend Engineer (Java)")).not.toBeInTheDocument();
    second.release(ok());
    await waitFor(() => expect(screen.getByText("Aussortiert: Personio.")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: "Senior Kotlin Engineer" })).toHaveLength(1);
    expect(link("Backend Engineer (Java)")).not.toBeInTheDocument();
  });

  it("undoes while the next triage still runs and brings the row back once", async () => {
    const data = server();
    const dismiss = heldArchive(data, "job-2");
    const routes = {
      "POST /jobs/job-1/status": kotlinStatus(data),
      "PATCH /jobs/job-2": dismiss.route,
    };
    const calls = stubRoutes(inboxStubs(data, routes));
    renderWithProviders(<InboxPage />);
    await click("Vormerken: Senior Kotlin Engineer");
    await screen.findByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen.");
    await click("Aussortieren: Backend Engineer (Java)");
    await click("Rückgängig");
    // The undo queues behind the running dismiss instead of racing it.
    expect(bodies(calls, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }]);
    expect(link("Senior Kotlin Engineer")).not.toBeInTheDocument();
    const loadsBefore = newListLoads(calls);
    dismiss.release(ok());
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    await screen.findByText("Rückgängig gemacht: N26 ist wieder unter Neu.");
    // One refetch, after the last of the two settled.
    await waitFor(() => expect(newListLoads(calls)).toBe(loadsBefore + 1));
    expect(screen.getAllByRole("link", { name: "Senior Kotlin Engineer" })).toHaveLength(1);
    expect(link("Backend Engineer (Java)")).not.toBeInTheDocument();
    expect(bodies(calls, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }, { to: "OPEN" }]);
  });

  it("undo puts a row back at the end when the list got shorter meanwhile", async () => {
    const data = server();
    let holdLists = false;
    const lists = inboxJobs(data);
    const archive = (id: string) => () => {
      data.new = without(data.new, id);
      return ok();
    };
    const undoJava = () => {
      data.new = [JAVA];
      return ok();
    };
    stubRoutes(
      inboxStubs(data, {
        // Held lists: what shows after the undo comes from the cache, not from a refetch.
        "GET /jobs": (call: RecordedCall) =>
          holdLists ? new Promise<Response>(() => undefined) : lists(call),
        "PATCH /jobs/job-1": archive("job-1"),
        "PATCH /jobs/job-2": (call: RecordedCall) =>
          JSON.parse(call.body ?? "{}").is_archived ? archive("job-2")() : undoJava(),
      }),
    );
    renderWithProviders(<InboxPage />);
    await click("Aussortieren: Backend Engineer (Java)");
    await screen.findByText("Aussortiert: Personio.");
    await click("Aussortieren: Senior Kotlin Engineer");
    await screen.findByRole("heading", { level: 2, name: "Keine neuen Treffer" });
    holdLists = true;
    const toast = screen.getByText("Aussortiert: Personio.").closest(".toast") as HTMLElement;
    await userEvent.click(within(toast).getByRole("button", { name: "Rückgängig" }));
    expect(
      await screen.findByRole("link", { name: "Backend Engineer (Java)" }),
    ).toBeInTheDocument();
    expect(rowTitles()).toEqual(["Backend Engineer (Java)"]);
  });

  it("a realtime event during a triage does not bring its row back (R15)", async () => {
    const data = server();
    const dismiss = heldArchive(data, "job-1");
    const calls = stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": dismiss.route }));
    const { queryClient } = renderWithProviders(<InboxPage />);
    await click("Aussortieren: Senior Kotlin Engineer");
    const loadsBefore = newListLoads(calls);
    applyEvent(NEW_JOB_EVENT, { queryClient, now: () => 0, onGlobalError: vi.fn() });
    expect(queryClient.getQueryState(queryKeys.inboxList("new"))?.isInvalidated).toBe(false);
    await settleTicks();
    expect(newListLoads(calls)).toBe(loadsBefore);
    expect(link("Senior Kotlin Engineer")).not.toBeInTheDocument();
    dismiss.release(ok());
    await screen.findByText("Aussortiert: N26.");
  });

  it("holds 'Weitere laden' while a triage runs (I2)", async () => {
    const data = { ...server(), new: [KOTLIN, ...FULL_PAGE] };
    const dismiss = heldArchive(data, "job-1");
    const calls = stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": dismiss.route }));
    renderWithProviders(<InboxPage />);
    await click("Aussortieren: Senior Kotlin Engineer");
    const more = screen.getByRole("button", { name: "Weitere laden" });
    expect(more).toHaveAttribute("aria-busy", "true");
    await userEvent.click(more);
    await settleTicks();
    expect(calls.some((call) => /offset=[1-9]/.test(call.url))).toBe(false);
    dismiss.release(ok());
    await waitFor(() => expect(more).not.toHaveAttribute("aria-busy"));
  });

  it("holds 'Weitere laden' until the refetch after a triage is back", async () => {
    const data = { ...server(), new: [KOTLIN, ...FULL_PAGE] };
    const refetch = deferred();
    let holding = false;
    const jobs = inboxJobs(data);
    const listRoute = async (call: RecordedCall) => {
      if (holding && call.url.endsWith(NEW_LIST)) await refetch.response;
      return jobs(call);
    };
    const archive = () => {
      data.new = without(data.new, "job-1");
      holding = true;
      return ok();
    };
    const calls = stubRoutes(
      inboxStubs(data, { "GET /jobs": listRoute, "PATCH /jobs/job-1": archive }),
    );
    renderWithProviders(<InboxPage />);
    await screen.findByRole("link", { name: "Senior Kotlin Engineer" });
    // The test client treats data as stale at once, so mounting the list may load it again.
    const loadsBefore = newListLoads(calls);
    await click("Aussortieren: Senior Kotlin Engineer");
    await waitFor(() => expect(newListLoads(calls)).toBe(loadsBefore + 1));
    const more = screen.getByRole("button", { name: "Weitere laden" });
    expect(more).toHaveAttribute("aria-busy", "true");
    await userEvent.click(more);
    await settleTicks();
    expect(calls.some((call) => /offset=[1-9]/.test(call.url))).toBe(false);
    refetch.release(ok());
    await waitFor(() => expect(more).not.toHaveAttribute("aria-busy"));
  });

  it("tells the caller when a triage failed after the row left (M4)", async () => {
    stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-1": failed() }));
    const events = { onRemoved: vi.fn(), onTriageFailed: vi.fn() };
    renderWithProviders(<TriageProbe events={events} />);
    await userEvent.click(screen.getByRole("button", { name: "probe" }));
    await waitFor(() => expect(events.onTriageFailed).toHaveBeenCalledWith("job-1"));
    expect(events.onRemoved).toHaveBeenCalledWith("job-1");
  });
});

describe("focus after a row leaves (I3)", () => {
  it("moves to the next row's link", async () => {
    const data = server();
    stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": archiveOn(data, "job-1") }));
    renderWithProviders(<InboxPage />);
    await pressOn("Aussortieren: Senior Kotlin Engineer");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("link", { name: "Backend Engineer (Java)" }),
      ),
    );
  });

  it("moves to the previous row's link after the last row", async () => {
    const data = server();
    stubRoutes(inboxStubs(data, { "PATCH /jobs/job-2": archiveOn(data, "job-2") }));
    renderWithProviders(<InboxPage />);
    await pressOn("Aussortieren: Backend Engineer (Java)");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("link", { name: "Senior Kotlin Engineer" }),
      ),
    );
  });

  it("moves to the list when its only row left", async () => {
    const data = { ...server(), new: [KOTLIN] };
    stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": archiveOn(data, "job-1") }));
    renderWithProviders(<InboxPage />);
    await pressOn("Aussortieren: Senior Kotlin Engineer");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tabpanel")));
  });

  it("moves to the next row once a deleted row is gone", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    const data = { ...server(), dismissed: [LEAD, OTHER] };
    const remove = () => {
      data.dismissed = [OTHER];
      return ok({ status: "deleted" });
    };
    stubRoutes(inboxStubs(data, { "DELETE /jobs/job-17": remove }));
    renderWithProviders(<InboxPage />);
    await click("Endgültig löschen: Teamlead Java Backend");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Endgültig löschen" }),
    );
    await waitFor(() => expect(link("Teamlead Java Backend")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Java Architekt" })),
    );
  });
});

describe("the archive tabs", () => {
  it("restores a job from Unter Schwellwert and offers to view it", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    const data = server();
    const restore = () => {
      data.below = [];
      return ok();
    };
    const calls = stubRoutes(inboxStubs(data, { "PATCH /jobs/job-20": restore }));
    renderWithProviders(<InboxPage />);
    await click("Wiederherstellen: Fullstack-Entwickler PHP");
    expect(await screen.findByText("ACME GmbH ist wieder im Eingang.")).toBeInTheDocument();
    expect(bodies(calls, "PATCH /jobs/job-20")).toEqual([{ is_archived: false }]);
    expect(screen.queryByRole("button", { name: /Endgültig löschen/ })).not.toBeInTheDocument();
    await waitFor(() => expect(link("Fullstack-Entwickler PHP")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Ansehen" }));
    expect(navigation.push).toHaveBeenCalledWith("/jobs/job-20");
  });

  it("a restore refreshes the threshold preview, whose counts it changed", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-20": ok() }));
    const { queryClient } = renderWithProviders(<InboxPage />);
    const previewKey = queryKeys.thresholdPreview(70);
    queryClient.setQueryData(previewKey, { threshold: 70, would_archive: 1, would_restore: 1 });
    await click("Wiederherstellen: Fullstack-Entwickler PHP");
    await screen.findByText("ACME GmbH ist wieder im Eingang.");
    await waitFor(() => expect(queryClient.getQueryState(previewKey)?.isInvalidated).toBe(true));
  });

  it("says that a former application goes back to Bewerbungen", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-17": ok() }));
    renderWithProviders(<InboxPage />);
    await click("Wiederherstellen: Teamlead Java Backend");
    expect(await screen.findByText("Check24 ist wieder unter Bewerbungen.")).toBeInTheDocument();
  });

  it("deletes for good only after asking", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    const data = server();
    const remove = () => {
      data.dismissed = [];
      return ok({ status: "deleted" });
    };
    const calls = stubRoutes(inboxStubs(data, { "DELETE /jobs/job-17": remove }));
    renderWithProviders(<InboxPage />);
    await click("Endgültig löschen: Teamlead Java Backend");
    const dialog = screen.getByRole("dialog", { name: "Endgültig löschen?" });
    expect(
      within(dialog).getByText(
        "„Teamlead Java Backend“ bei Check24 wird mit Verlauf und Unterlagen gelöscht. Das lässt sich nicht rückgängig machen.",
      ),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByText("Gelöscht: Check24.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      await screen.findByRole("heading", { level: 2, name: "Nichts aussortiert" }),
    ).toBeVisible();
  });

  it("says 'Archiviert' when the server archived instead of deleting (M5)", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    stubRoutes(inboxStubs(server(), { "DELETE /jobs/job-17": ok({ status: "archived" }) }));
    renderWithProviders(<InboxPage />);
    await click("Endgültig löschen: Teamlead Java Backend");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Endgültig löschen" }),
    );
    expect(await screen.findByText("Archiviert: Check24.")).toBeInTheDocument();
    expect(screen.queryByText("Gelöscht: Check24.")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and says why when the delete fails", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    stubRoutes(inboxStubs(server(), { "DELETE /jobs/job-17": failed() }));
    renderWithProviders(<InboxPage />);
    await click("Endgültig löschen: Teamlead Java Backend");
    const dialog = screen.getByRole("dialog", { name: "Endgültig löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Endgültig löschen?" })).toBeInTheDocument();
    expect(link("Teamlead Java Backend")).toBeInTheDocument();
  });

  it("closes the delete dialog without deleting on Abbrechen", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    const calls = stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    await click("Endgültig löschen: Teamlead Java Backend");
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
