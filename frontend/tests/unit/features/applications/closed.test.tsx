import { onlineManager, QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/api/jobList";
import { CLOSED_APPLICATION_STATUSES } from "@/api/jobListPaths";
import { queryKeys } from "@/api/queryKeys";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import {
  applicationsJobs,
  applicationsStubs,
  type ApplicationsServer,
} from "../../support/applicationsRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem, pageOf } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

const SERVER_ERROR = 500;
const PAGE_SIZE = 100;
// Retries wait far longer than any test runs, so a failed request stays "retrying".
const RETRY_LATER = { queries: { retry: 1, retryDelay: 600_000 } };
const CLOSED_STATUSES = CLOSED_APPLICATION_STATUSES.join(",");

const CLOSED_ROWS: JobListItem[] = [
  buildListItem({
    id: "c-old",
    title: "Engineering Manager",
    status: "ACCEPTED",
    status_changed_at: "2026-09-20T08:00:00Z",
  }),
  buildListItem({
    id: "c-new",
    title: "Lead Developer",
    status: "REJECTED",
    status_changed_at: "2026-10-01T08:00:00Z",
  }),
];

function server(closed = true): ApplicationsServer {
  return {
    active: [buildListItem({ id: "a1", title: "Kotlin Developer", status: "APPLIED" })],
    closed: closed ? CLOSED_ROWS : [],
  };
}

function manyActive(count: number): JobListItem[] {
  return Array.from({ length: count }, (_, index) =>
    buildListItem({ id: `d${String(index).padStart(3, "0")}`, status: "DRAFTED" }),
  );
}

const param = (call: RecordedCall, name: string) => new URL(call.url).searchParams.get(name);
const isClosed = (call: RecordedCall) => param(call, "statuses") === CLOSED_STATUSES;
const isClosedTotal = (call: RecordedCall) => isClosed(call) && param(call, "limit") === "1";
const isClosedRows = (call: RecordedCall) => isClosed(call) && !isClosedTotal(call);

/** GET /jobs as the server answers it, except that one kind of request fails. */
function failing(rows: ApplicationsServer, fails: (call: RecordedCall) => boolean) {
  const answer = applicationsJobs(rows);
  return (call: RecordedCall) =>
    fails(call) ? jsonResponse(SERVER_ERROR, { detail: "boom" }) : answer(call);
}

/** GET /jobs as the server answers it, except that one kind of request never answers. */
function hanging(rows: ApplicationsServer, hangs: (call: RecordedCall) => boolean) {
  const answer = applicationsJobs(rows);
  return (call: RecordedCall) => (hangs(call) ? new Promise<Response>(() => {}) : answer(call));
}

const listRegion = () => screen.getByRole("group", { name: "Bewerbungen nach Phase" });
const toggle = () => screen.getByRole("button", { name: "Abgeschlossen (2)" });
const closedRegion = () => screen.findByRole("region", { name: "Abgeschlossen" });
const rowTitles = (region: HTMLElement) =>
  within(region)
    .getAllByRole("listitem")
    .map((row) => within(row).getByRole("link").textContent);

beforeEach(() => liveNavigation.reset());
afterEach(() => onlineManager.setOnline(true));

describe("ClosedSection collapsed", () => {
  it("starts collapsed with its count and loads no closed rows", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Abgeschlossen (2)" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(calls.some(isClosedRows)).toBe(false);
  });

  it("opens through the URL, keeps focus on the toggle and shows the newest outcome first", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Abgeschlossen (2)" }));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?abgeschlossen=1", {
      scroll: false,
    });
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const closed = await closedRegion();
    await waitFor(() =>
      expect(rowTitles(closed)).toEqual(["Lead Developer", "Engineering Manager"]),
    );
    const rows = within(closed).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Abgesagt");
    expect(rows[0]).toHaveTextContent("01.10.2026");
    expect(rows[1]).toHaveTextContent("Zusage angenommen");
  });

  it("closes again through the URL", async () => {
    liveNavigation.reset("abgeschlossen=1");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    await closedRegion();
    await userEvent.click(toggle());
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications", { scroll: false });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Abgeschlossen" })).not.toBeInTheDocument();
  });

  it("shows the toggle and the strip when only closed applications exist (RB1)", async () => {
    stubRoutes(applicationsStubs({ active: [], closed: [CLOSED_ROWS[0]!] }));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Abgeschlossen (1)" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Phasen" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Noch keine Bewerbungen" })).toBeNull();
  });

  it("is absent when nothing is closed", async () => {
    stubRoutes(applicationsStubs(server(false)));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("region", { name: "Beworben" });
    // The strip appears only once the closed count answered, so the absence below is a real answer.
    expect(
      await screen.findByRole("button", { name: "Abgeschlossen: 0 Bewerbungen" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abgeschlossen \(/ })).not.toBeInTheDocument();
  });

  it("shows a closed-rows error with a retry but without a second alert (RB17)", async () => {
    liveNavigation.reset("abgeschlossen=1");
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": failing(rows, isClosedRows) }));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    expect(await within(closed).findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(within(closed).queryByRole("alert")).toBeNull();
  });
});

describe("ClosedSection under the closed filter", () => {
  it("shows the closed phase open, without the toggle, whatever ?abgeschlossen says", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    await waitFor(() => expect(within(closed).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Abgeschlossen (2)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Beworben" })).not.toBeInTheDocument();
  });

  it("does not offer to load more active rows", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs({ active: manyActive(PAGE_SIZE + 1), closed: CLOSED_ROWS }));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    await waitFor(() => expect(within(closed).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Weitere laden" })).toBeNull();
    expect(screen.queryByText(/von 101 Bewerbungen geladen/)).toBeNull();
  });

  it("offers all phases when the closed filter is empty", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server(false)));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    await userEvent.click(
      await within(closed).findByRole("button", { name: "Alle Phasen zeigen" }),
    );
    expect(screen.getByRole("button", { name: /^Abgeschlossen:/ })).toHaveFocus();
  });
});

describe("ClosedSection waiting (RB13)", () => {
  it("counts a retried closed count as 0: no toggle, the active rows still show", async () => {
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": failing(rows, isClosedTotal) }));
    renderWithProviders(<ApplicationsPage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    expect(
      await screen.findByRole("button", { name: "Abgeschlossen: 0 Bewerbungen" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Beworben" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Abgeschlossen \(/ })).toBeNull();
  });

  it("shows the closed rows under the filter while the closed count is retried", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": failing(rows, isClosedTotal) }));
    renderWithProviders(<ApplicationsPage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    const closed = await closedRegion();
    await waitFor(() => expect(within(closed).getAllByRole("listitem")).toHaveLength(2));
  });

  it("shows the known closed rows under the filter while offline holds the count back", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server()));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.applicationsList("active", ""), {
      pages: [pageOf(server().active)],
      pageParams: [0],
    });
    queryClient.setQueryData(queryKeys.applicationsList("closed", ""), {
      pages: [pageOf(CLOSED_ROWS)],
      pageParams: [0],
    });
    onlineManager.setOnline(false);
    renderWithProviders(<ApplicationsPage />, queryClient);
    const closed = await closedRegion();
    expect(rowTitles(closed)).toEqual(["Lead Developer", "Engineering Manager"]);
  });

  it("shows the stalled cue while the closed rows are retried under the filter (ruling 10)", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": failing(rows, isClosedRows) }));
    renderWithProviders(<ApplicationsPage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    expect(await screen.findByText(/Die Verbindung hakt/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Alle Phasen zeigen" })).toBeNull();
  });

  it("shows the skeleton, not an empty phase, while offline holds the closed rows back", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server()));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.applicationsList("active", ""), {
      pages: [pageOf(server().active)],
      pageParams: [0],
    });
    onlineManager.setOnline(false);
    renderWithProviders(<ApplicationsPage />, queryClient);
    expect(await within(listRegion()).findByRole("status", { busy: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alle Phasen zeigen" })).toBeNull();
  });
});

describe("ClosedSection fix round 1", () => {
  it("announces a closed-rows error under the filter exactly once (R11)", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": failing(rows, isClosedRows) }));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(within(listRegion()).getAllByRole("alert")).toHaveLength(1);
  });

  it("says a search found nothing, not that the closed phase is empty", async () => {
    liveNavigation.reset("phase=abgeschlossen&q=kotlin");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Suche zurücksetzen" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Alle Phasen zeigen" })).toBeNull();
  });

  it("puts a column head with the outcome and the closing date above the closed rows", async () => {
    liveNavigation.reset("abgeschlossen=1");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    await waitFor(() => expect(within(closed).getAllByRole("listitem")).toHaveLength(2));
    const head = closed.querySelector(".arows-head");
    expect(head).toHaveAttribute("aria-hidden", "true");
    expect(head).toHaveTextContent("Stelle / FirmaAusgangAbgeschlossen am");
  });

  it("marks the kept closed rows busy while the next search answer loads", async () => {
    liveNavigation.reset("abgeschlossen=1");
    const rows = server();
    stubRoutes(applicationsStubs(rows));
    renderWithProviders(<ApplicationsPage />);
    const closed = await closedRegion();
    await waitFor(() => expect(within(closed).getAllByRole("listitem")).toHaveLength(2));
    stubRoutes(
      applicationsStubs(rows, { "GET /jobs": hanging(rows, (call) => param(call, "q") !== null) }),
    );
    liveNavigation.replace("/applications?abgeschlossen=1&q=lead");
    await waitFor(() =>
      expect(closed.closest(".apps-closed")).toHaveAttribute("aria-busy", "true"),
    );
    expect(within(closed).getAllByRole("listitem")).toHaveLength(2);
  });
});
