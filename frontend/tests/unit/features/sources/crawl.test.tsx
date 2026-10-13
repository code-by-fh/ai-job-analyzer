import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { platformsQueryOptions } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { CrawlButton } from "@/features/sources/crawl/CrawlButton";
import { CrawlProgress } from "@/features/sources/crawl/CrawlProgress";
import { runningTaskOf } from "@/features/sources/SourceList";
import { SourcesPage } from "@/features/sources/SourcesPage";
import {
  EMPTY_ACTIVITY,
  reduceActivity,
  seedCrawlTask,
  type ActivityState,
} from "@/realtime/activity";
import { SEED_WAIT_MS, useActivity } from "@/realtime/useActivity";
import { ANNOUNCE_GAP_MS } from "@/ui/useAnnouncement";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const HTTP_CONFLICT = 409;
// Room for the renders after a timer fired.
const SLACK_MS = 1000;
const HTTP_BAD_GATEWAY = 502;
const USER_ID = 7;
const STARTED = { status: "Started", job_id: "c9" };
const RUNNING = {
  job_id: "crawl-1",
  platform: SOURCE_A.url,
  platform_id: 1,
  status: "crawling",
  total: 12,
  scraping_completed: 5,
};

const startButton = (name: string) =>
  screen.findByRole("button", { name: `${name} jetzt durchsuchen` });
const cancelButton = (name: string) =>
  screen.findByRole("button", { name: `Durchsuchen von ${name} abbrechen` });
const posts = (calls: readonly RecordedCall[], path: string) =>
  calls.filter((call) => call.method === "POST" && call.url.endsWith(path));
const crawlStatusCalls = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.url.endsWith("/scraper/crawl-status"));

function endCrawl(
  queryClient: ReturnType<typeof renderWithProviders>["queryClient"],
  type: "crawl_job_completed" | "crawl_job_cancelled",
) {
  act(() => {
    queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
      reduceActivity(
        state ?? EMPTY_ACTIVITY,
        { type, user_id: USER_ID, job_id: "crawl-1" },
        Date.now(),
      ),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Durchsuchen", () => {
  it("a second click while starting sends one request", async () => {
    let answer: (value: Response) => void = () => {};
    const calls = sourcesStubs(undefined, {
      "POST /platforms/1/crawl": () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderWithProviders(<SourcesPage />);
    const button = await startButton("StepStone");
    // A real double click delivers both clicks before React renders the busy state.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(posts(calls, "/platforms/1/crawl")).toHaveLength(1));
    answer(jsonResponse(200, STARTED));
    // Preflight ruling 17: count only once the start settled, so a queued second start would show.
    await screen.findByRole("progressbar", { name: "Fortschritt StepStone" });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(posts(calls, "/platforms/1/crawl")).toHaveLength(1);
  });

  it("shows the bar as soon as the start is accepted", async () => {
    sourcesStubs(undefined, { "POST /platforms/1/crawl": STARTED });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    expect(
      await screen.findByRole("progressbar", { name: "Fortschritt StepStone" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Startet …")).toBeInTheDocument();
    expect(await screen.findByText("StepStone wird durchsucht.")).toBeInTheDocument();
    expect(await startButton("StepStone")).toHaveAccessibleDescription("Läuft gerade.");
  });

  it("a second start says it is already running and asks for the running crawls again", async () => {
    const calls = sourcesStubs(undefined, {
      "POST /platforms/1/crawl": () =>
        jsonResponse(HTTP_CONFLICT, { detail: "Crawl already running" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    expect(await screen.findByText("StepStone wird schon durchsucht.")).toBeInTheDocument();
    await waitFor(() => expect(crawlStatusCalls(calls)).toHaveLength(2));
  });

  it("another refusal says what went wrong in general words", async () => {
    sourcesStubs(undefined, {
      "POST /platforms/1/crawl": () =>
        jsonResponse(HTTP_BAD_GATEWAY, { detail: "Crawler refused the crawl" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
    expect(screen.queryByText(/Crawler refused/)).not.toBeInTheDocument();
  });

  it("a paused source cannot be started", async () => {
    const calls = sourcesStubs([{ ...SOURCE_A, is_active: false }]);
    renderWithProviders(<SourcesPage />);
    const button = await startButton("StepStone");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Die Quelle ist pausiert.");
    await userEvent.click(button);
    expect(posts(calls, "/crawl")).toHaveLength(0);
  });

  it("a source whose setup is not finished says so", async () => {
    sourcesStubs([{ ...SOURCE_A, setup_status: "pending_setup" }]);
    renderWithProviders(<SourcesPage />);
    const button = await startButton("StepStone");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Die Einrichtung ist nicht abgeschlossen.");
  });
});

describe("a running crawl", () => {
  it("shows its step inline and Abbrechen cancels exactly this crawl", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    renderWithProviders(<SourcesPage />);
    expect(await screen.findByText("Links sammeln: 5 von 12")).toBeInTheDocument();
    expect(await startButton("StepStone")).toHaveAttribute("aria-disabled", "true");
    expect(await startButton("StepStone")).toHaveAccessibleDescription("Läuft gerade.");
    await userEvent.click(await cancelButton("StepStone"));
    await waitFor(() =>
      expect(JSON.parse(posts(calls, "/scraper/cancel-crawl")[0]!.body!)).toEqual({
        job_id: "crawl-1",
      }),
    );
  });

  it("a double click on Abbrechen sends one cancel", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    const { queryClient } = renderWithProviders(<SourcesPage />);
    const cancel = await cancelButton("StepStone");
    act(() => {
      fireEvent.click(cancel);
      fireEvent.click(cancel);
    });
    // Counted once every queued mutation settled, so a second cancel would have been sent.
    await waitFor(() => expect(posts(calls, "/scraper/cancel-crawl")).toHaveLength(1));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(posts(calls, "/scraper/cancel-crawl")).toHaveLength(1);
  });

  it("after a cancel, focus goes to the source's Durchsuchen", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    const { queryClient } = renderWithProviders(<SourcesPage />);
    const cancel = await cancelButton("StepStone");
    await userEvent.click(cancel);
    await waitFor(() => expect(posts(calls, "/scraper/cancel-crawl")).toHaveLength(1));
    expect(cancel).toHaveFocus();
    endCrawl(queryClient, "crawl_job_cancelled");
    await waitFor(async () => expect(await startButton("StepStone")).toHaveFocus());
  });

  it("a crawl that ends on its own does not move focus", async () => {
    sourcesStubs(undefined, { "GET /scraper/crawl-status": { jobs: [RUNNING] } });
    const { queryClient } = renderWithProviders(<SourcesPage />);
    await cancelButton("StepStone");
    const indeed = await startButton("Indeed");
    act(() => indeed.focus());
    endCrawl(queryClient, "crawl_job_completed");
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    // The handoff runs one frame later; flush it, so a focus move would show here.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(indeed).toHaveFocus();
  });

  it("names the bar's value with the step text, not a percentage", async () => {
    sourcesStubs(undefined, { "GET /scraper/crawl-status": { jobs: [RUNNING] } });
    renderWithProviders(<SourcesPage />);
    const bar = await screen.findByRole("progressbar", { name: "Fortschritt StepStone" });
    expect(bar).toHaveAttribute("aria-valuetext", "Links sammeln: 5 von 12");
  });

  it("a row with a clicked Abbrechen has one moving element", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    renderWithProviders(<SourcesPage />);
    const cancel = await cancelButton("StepStone");
    await userEvent.click(cancel);
    await waitFor(() => expect(posts(calls, "/scraper/cancel-crawl")).toHaveLength(1));
    await waitFor(() => expect(cancel).toHaveAttribute("aria-busy", "true"));
    expect(cancel.closest("li")!.querySelectorAll(".spin")).toHaveLength(1);
  });

  it("a cancel that loses the race against the crawl's own end is no error", async () => {
    let answer: (value: Response) => void = () => {};
    sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    const { queryClient } = renderWithProviders(<SourcesPage />);
    await userEvent.click(await cancelButton("StepStone"));
    endCrawl(queryClient, "crawl_job_completed");
    answer(jsonResponse(200, { status: "error", message: "Job not found" }));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText("Abbrechen hat nicht geklappt.")).not.toBeInTheDocument();
  });

  it("Abbrechen is not stuck behind a start whose running crawls never load", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": () => new Promise<Response>(() => {}),
      "POST /platforms/1/crawl": STARTED,
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    const cancel = await screen.findByRole(
      "button",
      { name: "Durchsuchen von StepStone abbrechen" },
      { timeout: SEED_WAIT_MS + SLACK_MS },
    );
    await userEvent.click(cancel);
    await waitFor(() =>
      expect(JSON.parse(posts(calls, "/scraper/cancel-crawl")[0]!.body!)).toEqual({ job_id: "c9" }),
    );
  });

  it("a cancel the scraper refuses says so", async () => {
    sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [RUNNING] },
      "POST /scraper/cancel-crawl": { status: "error", message: "Job not found" },
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await cancelButton("StepStone"));
    expect(await screen.findByText("Abbrechen hat nicht geklappt.")).toBeInTheDocument();
    expect(screen.queryByText("Job not found")).not.toBeInTheDocument();
  });
});

/** Stands in for the drawer header (later task): the controls replace each other in one place. */
function HeaderControls() {
  const platform = useQuery(platformsQueryOptions()).data?.[0];
  const activity = useActivity(true);
  if (!platform) return null;
  const task = runningTaskOf(activity, platform.id);
  return task ? (
    <CrawlProgress platform={platform} task={task} place="header" />
  ) : (
    <CrawlButton platform={platform} state="ok" place="header" />
  );
}

describe("crawl controls that replace each other", () => {
  it("a start from the header puts focus on its Abbrechen", async () => {
    sourcesStubs(undefined, { "POST /platforms/1/crawl": STARTED });
    renderWithProviders(<HeaderControls />);
    await userEvent.click(await startButton("StepStone"));
    await waitFor(async () => expect(await cancelButton("StepStone")).toHaveFocus());
  });
});

describe("the page's live region", () => {
  const liveRegion = () => document.querySelector(".src-live")!;
  const finishCrawl = (state: ActivityState, crawl: { id: string; platformId: number }) => {
    const seeded = seedCrawlTask(state, { ...crawl, source: "example.org" }, Date.now());
    const event = { type: "crawl_job_completed", user_id: USER_ID, job_id: crawl.id } as const;
    return reduceActivity(seeded, event, Date.now());
  };
  const finishIndeed = (state: ActivityState) => finishCrawl(state, { id: "c2", platformId: 2 });

  it("announces the end of a crawl that finished on this page", async () => {
    sourcesStubs();
    const { queryClient } = renderWithProviders(<SourcesPage />);
    await startButton("Indeed");
    // The toast provider has status regions too; the page's own region carries .src-live.
    expect(liveRegion().textContent).toBe("");
    act(() => {
      queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
        finishIndeed(state ?? EMPTY_ACTIVITY),
      );
    });
    await waitFor(() => expect(liveRegion()).toHaveTextContent("Indeed: Durchsuchen fertig."));
    expect(liveRegion()).toHaveAttribute("role", "status");
  });

  it("does not announce a crawl that ended before the page opened", async () => {
    sourcesStubs();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<ActivityState>(queryKeys.activity, finishIndeed(EMPTY_ACTIVITY));
    renderWithProviders(<SourcesPage />, queryClient);
    await startButton("Indeed");
    await act(
      () => new Promise<void>((resolve) => setTimeout(resolve, ANNOUNCE_GAP_MS + SLACK_MS)),
    );
    expect(liveRegion().textContent).toBe("");
  });

  describe("while a source drawer is open", () => {
    const INDEED_DONE = "Indeed: Durchsuchen fertig.";
    const regionsSaying = (text: string) =>
      [...document.querySelectorAll(".src-live")].filter((region) => region.textContent === text);
    const waitPastTheGap = () =>
      act(() => new Promise<void>((resolve) => setTimeout(resolve, ANNOUNCE_GAP_MS + SLACK_MS)));

    async function endWhileDrawerIsOpen() {
      liveNavigation.reset("quelle=1");
      sourcesStubs();
      const { queryClient } = renderWithProviders(<SourcesPage />);
      const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
      act(() => {
        queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
          finishIndeed(state ?? EMPTY_ACTIVITY),
        );
      });
      return panel;
    }

    it("announces an end once, inside the dialog", async () => {
      const panel = await endWhileDrawerIsOpen();
      await waitFor(() => expect(panel.querySelector(".src-live")).toHaveTextContent(INDEED_DONE));
      await waitPastTheGap();
      expect(regionsSaying(INDEED_DONE)).toHaveLength(1);
    });

    it("does not repeat that end on the page once the drawer closed", async () => {
      const panel = await endWhileDrawerIsOpen();
      await waitFor(() => expect(panel.querySelector(".src-live")).toHaveTextContent(INDEED_DONE));
      act(() => liveNavigation.replace("/sources"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitPastTheGap();
      expect(liveRegion().textContent).toBe("");
    });
  });

  it("announces a second end of the same source again", async () => {
    sourcesStubs();
    const { queryClient } = renderWithProviders(<SourcesPage />);
    await startButton("StepStone");
    const finishStepStone = (id: string) =>
      act(() => {
        queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
          finishCrawl(state ?? EMPTY_ACTIVITY, { id, platformId: 1 }),
        );
      });
    finishStepStone("c2");
    await waitFor(() => expect(liveRegion()).toHaveTextContent("StepStone: Durchsuchen fertig."));
    finishStepStone("c3");
    await waitFor(() => expect(liveRegion().textContent).toBe(""));
    await waitFor(() => expect(liveRegion()).toHaveTextContent("StepStone: Durchsuchen fertig."));
  });
});
