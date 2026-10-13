import { onlineManager, QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/api/jobList";
import { applicationsListPath, CLOSED_APPLICATION_STATUSES } from "@/api/jobListPaths";
import { queryKeys } from "@/api/queryKeys";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { ListError } from "@/features/inbox/InboxList";
import {
  applicationsJobs,
  applicationsStubs,
  type ApplicationsServer,
} from "../../support/applicationsRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildListItem, pageOf } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/applications",
}));

const NOW = new Date("2026-10-08T10:00:00+02:00");
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const PAGE_SIZE = 100;
// Retries wait far longer than any test runs, so a failed request stays "retrying".
const RETRY_LATER = { queries: { retry: 1, retryDelay: 600_000 } };
const READY = { cv_html_present: true, cover_letter_html_present: true };
const CLOSED_STATUSES = CLOSED_APPLICATION_STATUSES.join(",");

function server(overrides: Partial<ApplicationsServer> = {}): ApplicationsServer {
  return {
    active: [
      buildListItem({
        id: "d1",
        title: "Platform Engineer",
        company: "Otto",
        status: "DRAFTED",
        ...READY,
      }),
      buildListItem({ id: "d2", title: "Java Developer", company: "Hermes", status: "FAILED" }),
      buildListItem({
        id: "a1",
        title: "Kotlin Developer",
        company: "N26",
        status: "APPLIED",
        ...READY,
        next_follow_up_at: "2026-10-06T07:00:00Z",
      }),
    ],
    closed: [buildListItem({ id: "c1", status: "REJECTED" })],
    ...overrides,
  };
}

function draftedRows(count: number): JobListItem[] {
  return Array.from({ length: count }, (_, index) =>
    buildListItem({ id: `d${String(index).padStart(3, "0")}`, status: "DRAFTED" }),
  );
}

const param = (call: RecordedCall, name: string) => new URL(call.url).searchParams.get(name);
const isClosed = (call: RecordedCall) => param(call, "statuses") === CLOSED_STATUSES;
const isClosedTotal = (call: RecordedCall) => isClosed(call) && param(call, "limit") === "1";
const isClosedRows = (call: RecordedCall) => isClosed(call) && !isClosedTotal(call);

/** GET /jobs as the server answers it, except that the closed counter never answers. */
function closedTotalHangs(rows: ApplicationsServer) {
  const answer = applicationsJobs(rows);
  return (call: RecordedCall) =>
    isClosedTotal(call) ? new Promise<Response>(() => undefined) : answer(call);
}

/** GET /jobs as the server answers it, except that the closed counter fails. */
function closedTotalFails(rows: ApplicationsServer) {
  const answer = applicationsJobs(rows);
  return (call: RecordedCall) =>
    isClosedTotal(call) ? jsonResponse(SERVER_ERROR, { detail: "boom" }) : answer(call);
}

const deck = () => document.querySelector(".mast-deck");
const sectionTitles = () =>
  screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  navigation.params = new URLSearchParams();
});
afterEach(() => {
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe("ApplicationsPage header", () => {
  it("shows the counts over all applications", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bewerbungen" })).toBeVisible();
    await waitFor(() => expect(deck()).toHaveTextContent("3 aktiv · 1 fällig"));
  });

  it("hides only the active count when the counts fail", async () => {
    stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs/counts": () => jsonResponse(SERVER_ERROR, { detail: "boom" }),
      }),
    );
    renderWithProviders(<ApplicationsPage />);
    await waitFor(() => expect(deck()).toHaveTextContent(/^1 fällig$/));
  });
});

describe("ApplicationsPage sections", () => {
  it("shows one section per phase with rows, a failed generation under Vorgemerkt", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const drafted = await screen.findByRole("region", { name: "Vorgemerkt" });
    expect(sectionTitles()).toEqual(["Vorgemerkt", "Beworben"]);
    expect(within(drafted).getAllByRole("listitem")).toHaveLength(2);
    expect(within(drafted).getByText("2 Bewerbungen")).toHaveClass("sr-only");
    expect(drafted).toHaveClass("stage-drafted");
    const applied = screen.getByRole("region", { name: "Beworben" });
    expect(within(applied).getByText("1 Bewerbung")).toHaveClass("sr-only");
    expect(within(applied).getByRole("link", { name: "Kotlin Developer" })).toHaveAttribute(
      "href",
      "/jobs/a1",
    );
    expect(within(applied).getByText("Nachfassen").closest(".next-cell")).toHaveClass("t-warn");
  });

  it("names the failed generation in crimson, with words", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const drafted = await screen.findByRole("region", { name: "Vorgemerkt" });
    const failed = within(drafted).getAllByRole("listitem")[1]!;
    const cell = failed.querySelector(".next-cell");
    expect(cell).toHaveClass("t-danger");
    expect(cell).not.toHaveClass("t-warn");
    expect(cell).toHaveTextContent("Erstellung fehlgeschlagen");
    expect(cell?.querySelector("svg.lucide-circle-alert")).toHaveAttribute("aria-hidden", "true");
  });

  it("tells two applications with the same title apart by their company", async () => {
    const twin = { title: "Kotlin Developer", status: "APPLIED" } as const;
    const active = [
      buildListItem({ id: "a1", company: "N26", ...twin }),
      buildListItem({ id: "a2", company: "Otto", ...twin }),
    ];
    stubRoutes(applicationsStubs(server({ active })));
    renderWithProviders(<ApplicationsPage />);
    const applied = await screen.findByRole("region", { name: "Beworben" });
    const links = within(applied).getAllByRole("link", { name: "Kotlin Developer" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/jobs/a1", "/jobs/a2"]);
    expect(links[0]).toHaveAccessibleDescription("N26");
    expect(links[1]).toHaveAccessibleDescription("Otto");
  });

  it("says when a step is due soon, when an offer needs an answer, and nothing without a date", async () => {
    const active = [
      buildListItem({ id: "a1", status: "APPLIED", next_follow_up_at: "2026-10-10T07:00:00Z" }),
      buildListItem({ id: "o1", status: "OFFER", next_follow_up_at: "2026-10-20T07:00:00Z" }),
      buildListItem({ id: "d1", status: "DRAFTED", created_at: null }),
    ];
    stubRoutes(applicationsStubs(server({ active })));
    renderWithProviders(<ApplicationsPage />);
    const whenOf = async (name: string) =>
      (await screen.findByRole("region", { name })).querySelector(".when-cell");
    expect(await whenOf("Beworben")).toHaveTextContent("fällig in 2 Tagen");
    expect(await whenOf("Angebot")).toHaveTextContent("Antwort bis 20.10.2026");
    expect(await whenOf("Vorgemerkt")).toHaveTextContent(/^–$/);
  });

  it("says how soon an interview is inside the due window, neutral", async () => {
    const active = [
      buildListItem({ id: "i1", status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" }),
    ];
    stubRoutes(applicationsStubs(server({ active })));
    renderWithProviders(<ApplicationsPage />);
    const interview = await screen.findByRole("region", { name: "Interview" });
    const cell = interview.querySelector(".when-cell");
    expect(cell).toHaveTextContent(/^Termin in 1 Tag$/);
    expect(cell).not.toHaveClass("t-warn");
  });

  it("labels every cell for screen readers", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const applied = await screen.findByRole("region", { name: "Beworben" });
    const row = within(applied).getByRole("listitem");
    expect(row).toHaveTextContent("Nächster Schritt: Nachfassen");
    expect(row).toHaveTextContent("Seit / Fällig: überfällig seit 06.10.2026");
    expect(row).toHaveTextContent("Unterlagen: Beide fertig");
  });
});

describe("ApplicationsPage first run", () => {
  it("points to the inbox when there are no applications at all", async () => {
    stubRoutes(applicationsStubs(server({ active: [], closed: [] })));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
    expect(screen.getByText(/einen passenden Treffer vor/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
  });

  it("waits for the closed count before calling it the first run", async () => {
    const rows = server({ active: [], closed: [] });
    const calls = stubRoutes(applicationsStubs(rows, { "GET /jobs": closedTotalHangs(rows) }));
    renderWithProviders(<ApplicationsPage />);
    await waitFor(() => expect(calls.some(isClosedTotal)).toBe(true));
    expect(screen.getByRole("status", { busy: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Noch keine Bewerbungen" })).toBeNull();
  });

  it("stops waiting once the closed count is being retried", async () => {
    const rows = server({ active: [], closed: [] });
    stubRoutes(applicationsStubs(rows, { "GET /jobs": closedTotalFails(rows) }));
    renderWithProviders(<ApplicationsPage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    expect(await screen.findByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
  });

  it("stops waiting while offline holds the closed count back", async () => {
    stubRoutes(applicationsStubs(server({ active: [], closed: [] })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.applicationsList("active", ""), {
      pages: [pageOf([])],
      pageParams: [0],
    });
    onlineManager.setOnline(false);
    renderWithProviders(<ApplicationsPage />, queryClient);
    expect(await screen.findByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
  });
});

describe("ApplicationsPage errors", () => {
  it("offers one retry when the list cannot load", async () => {
    const rows = server();
    stubRoutes(
      applicationsStubs(rows, { "GET /jobs": () => jsonResponse(NOT_FOUND, { detail: "boom" }) }),
    );
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeVisible();
    expect(screen.queryByText("boom")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Erneut versuchen" })).toHaveLength(1);
    vi.useRealTimers();
    stubRoutes(applicationsStubs(rows));
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("region", { name: "Beworben" })).toBeVisible();
  });

  it("can show a list error without a second alert", () => {
    render(<ListError error={new Error("x")} onRetry={vi.fn()} announce={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });
});

describe("ApplicationsPage requests", () => {
  it("does not load the closed rows while they are hidden", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("region", { name: "Beworben" });
    await waitFor(() => expect(calls.some(isClosedTotal)).toBe(true));
    expect(calls.some(isClosedRows)).toBe(false);
  });

  it.each([["abgeschlossen=1"], ["phase=abgeschlossen"]])(
    "starts the closed rows with %s before the closed count answers",
    async (query) => {
      navigation.params = new URLSearchParams(query);
      const rows = server();
      const calls = stubRoutes(applicationsStubs(rows, { "GET /jobs": closedTotalHangs(rows) }));
      renderWithProviders(<ApplicationsPage />);
      const closedRows = applicationsListPath({ group: "closed", q: "" }, 0);
      await waitFor(() => expect(calls.map((call) => call.url).join()).toContain(closedRows));
    },
  );
});

describe("ApplicationsPage paging", () => {
  it("loads the next page on request and says how much is loaded", async () => {
    stubRoutes(applicationsStubs(server({ active: draftedRows(PAGE_SIZE + 1) })));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("100 von 101 Bewerbungen geladen.")).toBeVisible();
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Weitere laden" }));
    const drafted = screen.getByRole("region", { name: "Vorgemerkt" });
    await waitFor(() => expect(within(drafted).getAllByRole("listitem")).toHaveLength(101));
    expect(screen.queryByRole("button", { name: "Weitere laden" })).toBeNull();
  });

  it("blocks loading more while the list refetches", async () => {
    const rows = server({ active: draftedRows(PAGE_SIZE + 1) });
    stubRoutes(applicationsStubs(rows));
    const { queryClient } = renderWithProviders(<ApplicationsPage />);
    const more = await screen.findByRole("button", { name: "Weitere laden" });
    stubRoutes(applicationsStubs(rows, { "GET /jobs": () => new Promise<Response>(() => {}) }));
    void queryClient.invalidateQueries({ queryKey: queryKeys.applicationsList("active", "") });
    await waitFor(() => expect(more).toHaveAttribute("aria-busy", "true"));
  });
});
