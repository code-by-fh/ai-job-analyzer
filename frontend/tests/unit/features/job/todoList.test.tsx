import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { useJob } from "@/features/job/useJob";
import { TodoList } from "@/features/job/todos/TodoList";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const TODOS = [{ id: "a", text: "Gehalt recherchieren", done: false }];

function show(job: JobDetail, routes: Record<string, unknown> = {}): RecordedCall[] {
  const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" }, ...routes });
  renderWithProviders(<TodoList job={job} />);
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
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PATCH") {
      patches.push(String(init?.body));
      const status = await new Promise<number>((resolve) => waiting.push(resolve));
      return jsonResponse(status, { status: "updated" });
    }
    return jsonResponse(200, job);
  });
  const release = async (status = 200) => {
    await act(async () => waiting.shift()?.(status));
  };
  return { patches, release };
}

/** The job page's data flow: the list gets the job of an active query, which refetches after saves. */
function PageWithTodos() {
  const job = useJob("job-1");
  return job.data ? <TodoList job={job.data} /> : null;
}

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));

describe("TodoList", () => {
  it("adds a to-do and sends the whole list", async () => {
    const calls = show(buildJob({ todos: TODOS }));
    await userEvent.type(screen.getByLabelText("Neue Aufgabe"), "Referenz anfragen{Enter}");
    await waitFor(() => expect(patches(calls)[0].todos).toHaveLength(2));
    expect(patches(calls)[0].todos[1]).toMatchObject({ text: "Referenz anfragen", done: false });
  });

  it("toggles and removes a to-do", async () => {
    const calls = show(buildJob({ todos: TODOS }));
    await userEvent.click(screen.getByLabelText("Gehalt recherchieren"));
    await waitFor(() =>
      expect(patches(calls)[0]).toEqual({ todos: [{ ...TODOS[0], done: true }] }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Gehalt recherchieren löschen" }));
    await waitFor(() => expect(patches(calls)[1]).toEqual({ todos: [] }));
  });

  it("explains a too long to-do instead of sending it", async () => {
    const calls = show(buildJob({ todos: [] }));
    const input = screen.getByLabelText("Neue Aufgabe");
    await userEvent.click(input);
    await userEvent.paste("x".repeat(501));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Höchstens 500 Zeichen.")).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("counts the done to-dos", () => {
    show(buildJob({ todos: [...TODOS, { id: "b", text: "Mappe drucken", done: true }] }));
    expect(screen.getByText("1 von 2 erledigt")).toBeInTheDocument();
  });
});

describe("TodoList saving", () => {
  it("sends rapid toggles one after the other", async () => {
    const backend = gatedBackend(buildJob({ todos: TODOS }));
    renderWithProviders(<TodoList job={buildJob({ todos: TODOS })} />);
    await userEvent.click(screen.getByLabelText("Gehalt recherchieren"));
    await userEvent.click(screen.getByLabelText("Gehalt recherchieren"));
    await waitFor(() => expect(backend.patches).toHaveLength(1));
    expect(JSON.parse(backend.patches[0]).todos[0].done).toBe(true);
    await backend.release();
    await waitFor(() => expect(backend.patches).toHaveLength(2));
    expect(JSON.parse(backend.patches[1]).todos[0].done).toBe(false);
  });

  it("rolls back and tells the user when saving fails", async () => {
    show(buildJob({ todos: TODOS }), { "PATCH /jobs/job-1": jsonResponse(500, { detail: "x" }) });
    await userEvent.click(screen.getByLabelText("Gehalt recherchieren"));
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Gehalt recherchieren")).not.toBeChecked();
  });

  it("explains an id clash instead of sending", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("a" as ReturnType<typeof crypto.randomUUID>);
    const calls = show(buildJob({ todos: TODOS }));
    await userEvent.type(screen.getByLabelText("Neue Aufgabe"), "Neu{Enter}");
    expect(
      screen.getByText("Die Aufgabe konnte nicht angelegt werden. Bitte versuche es noch einmal."),
    ).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("keeps the saved state after the save and the refresh", async () => {
    let saved = false;
    const serve = (done: boolean) => () =>
      jsonResponse(200, buildJob({ todos: [{ ...TODOS[0], done }] }));
    const calls = stubRoutes({
      "GET /jobs/job-1": () => serve(saved)(),
      "PATCH /jobs/job-1": () => {
        saved = true;
        return jsonResponse(200, { status: "updated" });
      },
    });
    renderWithProviders(<PageWithTodos />);
    await userEvent.click(await screen.findByLabelText("Gehalt recherchieren"));
    await waitFor(() =>
      expect(calls.filter((call) => call.url.endsWith("/jobs/job-1"))).toHaveLength(3),
    );
    expect(screen.getByLabelText("Gehalt recherchieren")).toBeChecked();
  });
});
