import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { sourceLinkId } from "@/features/sources/useFocusFallback";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { SOURCE_A, SOURCE_B, sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;
const COMPLETED_RUN = {
  finished_at: "2026-10-08T06:00:00+00:00",
  found: 12,
  new: 5,
  matched: 3,
  seeded: false,
  error: null,
};
const FAILED_RUN = {
  finished_at: "2026-10-07T06:00:00+00:00",
  found: 0,
  new: 0,
  matched: 0,
  seeded: false,
  error: "unreachable",
};
const SEED_RUN = {
  finished_at: "2026-10-06T06:00:00+00:00",
  found: 40,
  new: 40,
  matched: 0,
  seeded: true,
  error: null,
};
const RUNS = [COMPLETED_RUN, FAILED_RUN, SEED_RUN];
const SEED_NOTE =
  "Beim ersten Lauf wurden die gefundenen Stellen nur als bekannt gemerkt, nicht bewertet; sie zählen weder als passend noch als unter Schwellwert.";
const RUNNING = {
  jobs: [{ job_id: "c1", platform: SOURCE_A.url, platform_id: 1, status: "crawling" }],
};

const panel = (name = "StepStone") => screen.findByRole("dialog", { name: `Quelle ${name}` });
const confirmDialog = (name = "StepStone") =>
  screen.findByRole("dialog", { name: `„${name}“ löschen?` });
const deletes = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.method === "DELETE");

async function askToDelete(name = "StepStone"): Promise<HTMLElement> {
  await userEvent.click(
    await within(await panel(name)).findByRole("button", { name: "Quelle löschen" }),
  );
  return confirmDialog(name);
}

beforeEach(async () => {
  // A drawer closed by the previous test schedules its focus fallback for the next frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset("quelle=1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("run history", () => {
  it("lists the runs newest first with result, failure and seed run", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": RUNS });
    renderWithProviders(<SourcesPage />);
    const runs = await within(await panel()).findByRole("list", { name: "Letzte Läufe" });
    await waitFor(() => expect(within(runs).getAllByRole("listitem")).toHaveLength(3));
    expect(
      within(runs)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "heute 08:00: 12 gefunden, 3 passend, 2 unter Schwellwert",
      "gestern 08:00: fehlgeschlagen (Seite nicht erreichbar)",
      expect.stringMatching(/: 40 als bekannt gemerkt$/),
    ]);
  });

  it("marks only a failed run in crimson", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": RUNS });
    renderWithProviders(<SourcesPage />);
    const runs = await within(await panel()).findByRole("list", { name: "Letzte Läufe" });
    await waitFor(() => expect(within(runs).getAllByRole("listitem")).toHaveLength(3));
    const crimson = within(runs)
      .getAllByRole("listitem")
      .map((item) => item.classList.contains("t-danger"));
    expect(crimson).toEqual([false, true, false]);
  });

  it("explains the seed run's counts only when the list shows one", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": RUNS });
    renderWithProviders(<SourcesPage />);
    expect(await within(await panel()).findByText(SEED_NOTE)).toBeInTheDocument();
  });

  it("shows no seed note without a seed run", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": [COMPLETED_RUN] });
    renderWithProviders(<SourcesPage />);
    const runs = await within(await panel()).findByRole("list", { name: "Letzte Läufe" });
    await waitFor(() => expect(within(runs).getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByText(SEED_NOTE)).not.toBeInTheDocument();
  });

  it("says when there is no run yet", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": [] });
    renderWithProviders(<SourcesPage />);
    expect(await within(await panel()).findByText("Noch kein Lauf.")).toBeInTheDocument();
  });

  it("a failed load says so and loads again on retry", async () => {
    let fail = true;
    sourcesStubs(undefined, {
      "GET /platforms/1/runs": () =>
        fail ? jsonResponse(SERVER_ERROR, { detail: "x" }) : jsonResponse(200, RUNS),
    });
    renderWithProviders(<SourcesPage />);
    const drawer = await panel();
    expect(
      await within(drawer).findByText("Die Läufe konnten nicht geladen werden."),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(drawer).getByRole("button", { name: "Erneut versuchen" }));
    const runs = await within(drawer).findByRole("list", { name: "Letzte Läufe" });
    await waitFor(() => expect(within(runs).getAllByRole("listitem")).toHaveLength(3));
  });
});

describe("delete", () => {
  it("is blocked while the source runs", async () => {
    sourcesStubs(undefined, { "GET /scraper/crawl-status": RUNNING });
    renderWithProviders(<SourcesPage />);
    const button = await within(await panel()).findByRole("button", { name: "Quelle löschen" });
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).toHaveAccessibleDescription("Erst das Durchsuchen abbrechen.");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog", { name: "„StepStone“ löschen?" })).not.toBeInTheDocument();
  });

  it("says that the found jobs stay, and Abbrechen deletes nothing", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await askToDelete();
    expect(dialog).toHaveTextContent(
      "Zeitplan, Benachrichtigungen und Laufverlauf gehen verloren. Gefundene Stellen und Bewerbungen bleiben erhalten.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(dialog).not.toBeInTheDocument();
    expect(deletes(calls)).toHaveLength(0);
  });

  it("asks, deletes, says how many jobs stay and moves focus to the title", async () => {
    const calls = sourcesStubs(undefined, {
      "DELETE /platforms/1": { status: "deleted", kept_jobs: 4 },
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await askToDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(
      await screen.findByText("Quelle „StepStone“ gelöscht. 4 gefundene Stellen bleiben erhalten."),
    ).toBeInTheDocument();
    expect(deletes(calls)).toHaveLength(1);
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false });
    await waitFor(() =>
      expect(document.activeElement).toBe(document.querySelector(MASTHEAD_TITLE_SELECTOR)),
    );
  });

  it("moves focus to the next source's row when there is one", async () => {
    liveNavigation.reset("quelle=2");
    sourcesStubs(undefined, { "DELETE /platforms/2": { status: "deleted", kept_jobs: 0 } });
    renderWithProviders(<SourcesPage />);
    const dialog = await askToDelete("Indeed");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Quelle „Indeed“ gelöscht.")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(sourceLinkId(1))),
    );
  });

  it("refreshes the lists whose jobs lost their source and the setup status", async () => {
    sourcesStubs(undefined, { "DELETE /platforms/1": { status: "deleted", kept_jobs: 4 } });
    const queryClient = createTestQueryClient();
    const touched = [queryKeys.inboxList("new"), queryKeys.jobCounts, queryKeys.setupStatus];
    for (const queryKey of touched) queryClient.setQueryData(queryKey, {});
    renderWithProviders(<SourcesPage />, queryClient);
    await userEvent.click(within(await askToDelete()).getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(touched.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated)).toEqual(
        [true, true, true],
      ),
    );
  });

  it("a delete the server refuses during a crawl keeps the drawer and says why", async () => {
    sourcesStubs(undefined, {
      "DELETE /platforms/1": () => jsonResponse(CONFLICT, { detail: "Crawl running" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(within(await askToDelete()).getByRole("button", { name: "Löschen" }));
    expect(
      await screen.findByText("„StepStone“ wird gerade durchsucht – erst abbrechen."),
    ).toBeInTheDocument();
    expect(await panel()).toBeInTheDocument();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });

  it("after a refused delete the crawl it did not know about blocks the button", async () => {
    let crawling = false;
    sourcesStubs(undefined, {
      "DELETE /platforms/1": () => {
        crawling = true;
        return jsonResponse(CONFLICT, { detail: "Crawl running" });
      },
      "GET /scraper/crawl-status": () => jsonResponse(200, crawling ? RUNNING : { jobs: [] }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(within(await askToDelete()).getByRole("button", { name: "Löschen" }));
    const button = within(await panel()).getByRole("button", { name: "Quelle löschen" });
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).toHaveAccessibleDescription("Erst das Durchsuchen abbrechen.");
  });

  it("a source that is already gone (404) closes like a delete, without a count", async () => {
    // Gone on the server (another tab deleted it): the list no longer has it either.
    let gone = false;
    const list = () => jsonResponse(200, gone ? [SOURCE_B] : [SOURCE_A, SOURCE_B]);
    sourcesStubs(list, {
      "DELETE /platforms/1": () => {
        gone = true;
        return jsonResponse(NOT_FOUND, { detail: "Platform not found" });
      },
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(within(await askToDelete()).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Quelle „StepStone“ gelöscht.")).toBeInTheDocument();
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quelle StepStone" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: "StepStone" })).not.toBeInTheDocument();
  });

  it("asks about unsaved edits of another section before it asks to delete", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const drawer = await panel();
    const name = within(drawer).getByLabelText("Name");
    await userEvent.type(name, " Jobs");
    await userEvent.click(within(drawer).getByRole("button", { name: "Quelle löschen" }));
    const leave = await screen.findByRole("dialog", { name: "Änderungen verwerfen?" });
    await userEvent.click(within(leave).getByRole("button", { name: "Weiter bearbeiten" }));
    expect(screen.queryByRole("dialog", { name: "„StepStone“ löschen?" })).not.toBeInTheDocument();
    expect(name).toHaveValue("StepStone Jobs");
    expect(deletes(calls)).toHaveLength(0);
  });

  it("opens the delete question once the unsaved edits are discarded", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const drawer = await panel();
    await userEvent.type(within(drawer).getByLabelText("Name"), " Jobs");
    await userEvent.click(within(drawer).getByRole("button", { name: "Quelle löschen" }));
    const leave = await screen.findByRole("dialog", { name: "Änderungen verwerfen?" });
    await userEvent.click(within(leave).getByRole("button", { name: "Änderungen verwerfen" }));
    expect(await confirmDialog()).toBeInTheDocument();
  });

  it("a confirmed delete after discarding closes without a second leave question", async () => {
    const calls = sourcesStubs(undefined, {
      "DELETE /platforms/1": { status: "deleted", kept_jobs: 0 },
    });
    renderWithProviders(<SourcesPage />);
    const drawer = await panel();
    await userEvent.type(within(drawer).getByLabelText("Name"), " Jobs");
    await userEvent.click(within(drawer).getByRole("button", { name: "Quelle löschen" }));
    const leave = await screen.findByRole("dialog", { name: "Änderungen verwerfen?" });
    await userEvent.click(within(leave).getByRole("button", { name: "Änderungen verwerfen" }));
    await userEvent.click(within(await confirmDialog()).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Quelle „StepStone“ gelöscht.")).toBeInTheDocument();
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Änderungen verwerfen?" })).not.toBeInTheDocument();
    expect(deletes(calls)).toHaveLength(1);
  });
});
