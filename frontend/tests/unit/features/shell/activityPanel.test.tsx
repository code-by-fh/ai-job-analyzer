import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CrawlProgress } from "@/api/crawlProgress";
import { platformSchema } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { ActivityButton } from "@/features/shell/ActivityButton";
import { ActivityPanel } from "@/features/shell/ActivityPanel";
import { CrawlStrip } from "@/features/shell/crawl/CrawlStrip";
import {
  EMPTY_ACTIVITY,
  type ActivityState,
  type ActivityTask,
  type FinishedTask,
} from "@/realtime/activity";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { SOURCE_A } from "../../support/sourcesRoutes";

vi.mock("@/api/crawl", () => ({ fetchCrawlJobs: vi.fn(async () => []) }));

const FINISHED_AT = Date.UTC(2026, 9, 15, 9, 30);
const STEPSTONE = platformSchema.parse(SOURCE_A);

const progressOf = (overrides: Partial<CrawlProgress>): CrawlProgress => ({
  stage: "fetching_pages",
  links_found: 48,
  links_matched: 20,
  links_new: 12,
  pages_fetched: 5,
  pages_failed: 0,
  jobs_analysed: 3,
  jobs_skipped: 0,
  work_done: 8,
  work_total: 24,
  ...overrides,
});

const crawl = (overrides: Partial<ActivityTask>): ActivityTask => ({
  id: "c1",
  source: "www.stepstone.de",
  platformId: STEPSTONE.id,
  step: "collecting",
  done: 5,
  total: 12,
  progress: progressOf({}),
  ...overrides,
});

const finishedRun = (overrides: Partial<FinishedTask>): FinishedTask => ({
  id: "c0",
  source: "www.stepstone.de",
  platformId: STEPSTONE.id,
  outcome: "completed",
  finishedAt: FINISHED_AT,
  ...overrides,
});

/** The activity and the source list as the shell's queries hold them. */
function seededClient(activity: ActivityState) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.activity, activity);
  queryClient.setQueryData(queryKeys.platforms, [STEPSTONE]);
  return queryClient;
}

function renderPanel(activity: ActivityState) {
  return renderWithProviders(<ActivityPanel activity={activity} />, seededClient(activity));
}

describe("ActivityPanel", () => {
  it("shows a running crawl under its source's name with stage and percentage", () => {
    renderPanel({ ...EMPTY_ACTIVITY, running: [crawl({})] });
    expect(screen.getByRole("link", { name: "StepStone" })).toHaveAttribute(
      "href",
      "/sources?quelle=1",
    );
    expect(screen.getByText("Lädt Seiten: 5 von 12")).toBeInTheDocument();
    expect(screen.getByText("33 %")).toBeInTheDocument();
  });

  it("lists the stations with their counts and states", () => {
    renderPanel({ ...EMPTY_ACTIVITY, running: [crawl({})] });
    const stations = within(screen.getByRole("list", { name: "Ablauf" })).getAllByRole("listitem");
    expect(stations.map((station) => station.textContent)).toEqual([
      "48gefundenerledigt",
      "12neuerledigt",
      "5geladenaktuell",
      "3bewertetoffen",
    ]);
  });

  it("names skipped postings and pages that failed to load", () => {
    const progress = progressOf({ jobs_skipped: 2, pages_failed: 1 });
    renderPanel({ ...EMPTY_ACTIVITY, running: [crawl({ progress })] });
    expect(screen.getByText("Schon bekannt: 2")).toBeInTheDocument();
    expect(screen.getByText("Nicht geladen: 1")).toHaveClass("t-danger");
  });

  it("falls back to the step text and shows no percentage without progress data", () => {
    renderPanel({ ...EMPTY_ACTIVITY, running: [crawl({ progress: undefined })] });
    expect(screen.getByText("Links sammeln: 5 von 12")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Ablauf" })).toBeNull();
  });

  it("shows an import under its host without a link", () => {
    renderPanel({
      ...EMPTY_ACTIVITY,
      running: [crawl({ platformId: null, source: "jobs.example.org" })],
    });
    expect(screen.getByText("jobs.example.org")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("lists the runs that ended with outcome, time and new jobs", () => {
    const progress = progressOf({ stage: "completed", jobs_analysed: 7, jobs_skipped: 2 });
    renderPanel({
      ...EMPTY_ACTIVITY,
      finished: [finishedRun({ progress }), finishedRun({ id: "c-1", outcome: "failed" })],
    });
    const runs = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(runs[0]).toHaveTextContent("Fertig");
    expect(runs[0]).toHaveTextContent("11:30");
    expect(runs[0]).toHaveTextContent("Neue Stellen: 5");
    expect(within(runs[1]!).getByText("Fehlgeschlagen")).toHaveClass("t-danger");
  });

  it("shows how long a running crawl has been running", () => {
    const startedAt = Date.now() - (2 * 60_000 + 5_000);
    const { container } = renderPanel({ ...EMPTY_ACTIVITY, running: [crawl({ startedAt })] });
    expect(container.querySelector(".crawl-card-step .elapsed-ticking")).toHaveTextContent(
      "seit 02:05",
    );
  });

  it("says when nothing runs", () => {
    renderPanel(EMPTY_ACTIVITY);
    expect(screen.getByText("Keine laufenden Aufgaben.")).toBeInTheDocument();
  });
});

describe("ActivityButton", () => {
  it("names how long the crawl runs in whole minutes", () => {
    const startedAt = Date.now() - (2 * 60_000 + 5_000);
    const activity = { ...EMPTY_ACTIVITY, running: [crawl({ startedAt })] };
    renderWithProviders(<ActivityButton enabled />, seededClient(activity));
    expect(
      screen.getByRole("button", {
        name: "1 Aufgabe läuft: StepStone, 33 %, Lädt Seiten: 5 von 12, läuft seit 2 Minuten",
      }),
    ).toBeInTheDocument();
  });

  it("shows the running crawl in the sidebar and opens the activity view", async () => {
    const activity = { ...EMPTY_ACTIVITY, running: [crawl({})] };
    renderWithProviders(<ActivityButton enabled />, seededClient(activity));
    const trigger = screen.getByRole("button", {
      name: "1 Aufgabe läuft: StepStone, 33 %, Lädt Seiten: 5 von 12",
    });
    expect(trigger).toHaveTextContent("33 %");
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Im Hintergrund" });
    expect(dialog).toHaveClass("dock");
    expect(within(dialog).getByText("Lädt Seiten: 5 von 12")).toBeInTheDocument();
  });

  it("reads Aktivität while nothing runs", () => {
    renderWithProviders(<ActivityButton enabled />, seededClient(EMPTY_ACTIVITY));
    expect(screen.getByRole("button", { name: "Aktivität" })).toBeInTheDocument();
  });

  it("closes the view when a source link is followed", async () => {
    const activity = { ...EMPTY_ACTIVITY, running: [crawl({})] };
    renderWithProviders(<ActivityButton enabled />, seededClient(activity));
    await userEvent.click(screen.getByRole("button", { name: /1 Aufgabe läuft/ }));
    await userEvent.click(screen.getByRole("link", { name: "StepStone" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CrawlStrip", () => {
  it("is absent while nothing runs", () => {
    const { container } = renderWithProviders(
      <CrawlStrip signedIn />,
      seededClient(EMPTY_ACTIVITY),
    );
    expect(container.querySelector(".crawl-dock")).toBeNull();
  });

  it("shows the running crawl and how many more run", () => {
    const activity = { ...EMPTY_ACTIVITY, running: [crawl({}), crawl({ id: "c2" })] };
    renderWithProviders(<CrawlStrip signedIn />, seededClient(activity));
    const strip = screen.getByRole("button", {
      name: "2 Aufgaben laufen: StepStone, 33 %, Lädt Seiten: 5 von 12, und 1 weitere",
    });
    expect(strip).toHaveTextContent("und 1 weitere");
    expect(strip).toHaveAttribute("aria-haspopup", "dialog");
  });
});
