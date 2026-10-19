import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_SETUP } from "@/domain/sources";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, SOURCE_B, sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const SERVER_ERROR = 500;
// One failure, then a retry far in the future: the list stays without data and not yet in error.
const RETRY_LATER = { queries: { retry: 1, retryDelay: 600_000 } };
const RUNNING = {
  job_id: "c1",
  platform: SOURCE_A.url,
  platform_id: 1,
  status: "crawling",
  total: 12,
  scraping_completed: 5,
};

const rows = async () =>
  within(await screen.findByRole("list", { name: "Deine Quellen" })).getAllByRole("listitem");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Quellen list", () => {
  it("lists sources by name with schedule, last run and status", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const [indeed, stepstone] = await rows();
    expect(within(indeed!).getByRole("link").textContent).toBe("Indeed");
    expect(indeed).toHaveTextContent("Nur manuell");
    expect(indeed).toHaveTextContent("fehlgeschlagen (Seite nicht erreichbar)");
    expect(stepstone).toHaveTextContent("Mo–Fr 14:00");
    expect(stepstone).toHaveTextContent("12 gefunden, 3 passend, 2 unter Schwellwert");
    expect(stepstone).toHaveTextContent("In Ordnung");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Quellen");
    expect(screen.getByText("2 Quellen, 1 mit Fehler.")).toBeInTheDocument();
  });

  it("each row has a labelled edit button that opens the source's drawer", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const [indeed] = await rows();
    await userEvent.click(within(indeed!).getByRole("button", { name: "Indeed bearbeiten" }));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources?quelle=2", { scroll: false });
  });

  it("shows the site's favicon without a referrer, and the initials when it fails to load", async () => {
    const icon = "https://www.google.com/s2/favicons?sz=64&domain=www.stepstone.de";
    sourcesStubs([{ ...SOURCE_A, favicon_url: icon }, SOURCE_B]);
    const { container } = renderWithProviders(<SourcesPage />);
    await rows();
    const image = container.querySelector<HTMLImageElement>(".src-icon img")!;
    expect([image.getAttribute("src"), image.getAttribute("referrerpolicy")]).toEqual([
      icon,
      "no-referrer",
    ]);
    expect(container.querySelector(".src-icon .monogram")).toHaveTextContent("IN");
    fireEvent.error(image);
    expect(container.querySelectorAll(".src-icon .monogram")).toHaveLength(2);
  });

  it("names failing sources in one banner and opens a source from it", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Indeed: Seite nicht erreichbar, gestern/ }),
    );
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources?quelle=2", { scroll: false });
    expect(screen.getByText("Eine Quelle meldet einen Fehler.")).toBeInTheDocument();
  });

  it("a cancelled run is no error", async () => {
    sourcesStubs([{ ...SOURCE_B, last_run: { ...SOURCE_B.last_run, error: "cancelled" } }]);
    renderWithProviders(<SourcesPage />);
    const [indeed] = await rows();
    expect(indeed).toHaveTextContent("abgebrochen");
    expect(screen.queryByText(/einen Fehler/)).toBeNull();
  });

  it("tags a paused source and one whose setup never finished, neither as failing", async () => {
    const failed = { ...SOURCE_B.last_run, error: "failed" };
    sourcesStubs([
      { ...SOURCE_A, is_active: false, last_run: failed },
      { ...SOURCE_B, setup_status: PENDING_SETUP, last_run: failed },
    ]);
    renderWithProviders(<SourcesPage />);
    const [indeed, stepstone] = await rows();
    expect(indeed).toHaveTextContent("Nicht eingerichtet");
    expect(stepstone).toHaveTextContent("Pausiert");
    expect(screen.queryByText(/einen Fehler/)).toBeNull();
    expect(screen.getByText("2 Quellen, alle in Ordnung.")).toBeInTheDocument();
  });

  it("says the connection is stalled while the list is retried", async () => {
    sourcesStubs(() => jsonResponse(SERVER_ERROR, { detail: "boom" }));
    renderWithProviders(<SourcesPage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    expect(await screen.findByText(/Die Verbindung hakt/)).toBeVisible();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("shows a running crawl as running", async () => {
    sourcesStubs(undefined, { "GET /scraper/crawl-status": { jobs: [RUNNING] } });
    renderWithProviders(<SourcesPage />);
    const [, stepstone] = await rows();
    await waitFor(() => expect(stepstone).toHaveTextContent("Läuft"));
  });

  it("drops an unknown source id from the URL", async () => {
    liveNavigation.reset("quelle=999");
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }),
    );
  });

  it("starts all page queries at once, without waiting for the list", async () => {
    const calls = sourcesStubs(() => new Promise(() => {}));
    renderWithProviders(<SourcesPage />);
    await waitFor(() =>
      expect(calls.map((call) => new URL(call.url).pathname).sort()).toEqual([
        "/notification-templates",
        "/notifications/channel-types",
        "/notifications/channels",
        "/platforms",
        "/scraper/crawl-status",
        "/settings",
        "/setup-status",
      ]),
    );
  });

  it("offers the first source when there is none", async () => {
    sourcesStubs([]);
    renderWithProviders(<SourcesPage />);
    expect(
      await screen.findByRole("heading", { name: "Erste Quelle hinzufügen" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Noch keine Quelle.")).toBeInTheDocument();
  });
});
