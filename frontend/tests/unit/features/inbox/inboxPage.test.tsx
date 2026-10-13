import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inboxListPath } from "@/api/jobListPaths";
import type { PlatformBody } from "@/api/platforms";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { HTTP_OK, inboxJobs, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
  listeners: new Set<() => void>(),
}));
// useSyncExternalStore lets a test follow a router.replace like the real router does.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    navigation.listeners.add(listener);
    return () => navigation.listeners.delete(listener);
  };
  return {
    useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => navigation.params),
    usePathname: () => "/inbox",
  };
});

/** Makes router.replace update the search params, as the app router would. */
function followReplace(): void {
  navigation.replace.mockImplementation((href: string) => {
    navigation.params = new URL(href, "http://localhost").searchParams;
    act(() => navigation.listeners.forEach((listener) => listener()));
  });
}

const HTTP_SERVER_ERROR = 500;
const REASONING = "## Zusammenfassung\nKotlin und Kafka sind dein Alltag.";
const NOW = new Date("2026-10-08T10:00:00+02:00");
const RUN = { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3 };

function server(overrides: Partial<InboxServer> = {}): InboxServer {
  return {
    new: [
      buildListItem({
        id: "job-1",
        title: "Senior Kotlin Engineer",
        company: "N26",
        match_score: 86,
        reasoning: REASONING,
      }),
      buildListItem({
        id: "job-2",
        title: "Backend Engineer (Java)",
        company: "Personio",
        match_score: 72,
      }),
    ],
    below: [
      buildListItem({
        id: "job-20",
        title: "Fullstack-Entwickler PHP",
        is_archived: true,
        archive_reason: "THRESHOLD",
        match_score: 54,
      }),
    ],
    dismissed: [],
    due: [],
    ...overrides,
  };
}

function platformsWithRun(run: PlatformBody["last_run"]): PlatformBody[] {
  return [{ id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs", last_run: run }];
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.params = new URLSearchParams();
  // These suites describe the list below 1200 px, without the preview pane.
  installFakeMatchMedia(false);
});

describe("InboxPage", () => {
  it("shows the masthead with the new matches and the strongest one", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    // The setup status decides between onboarding and inbox first (Task 14), so the heading is async.
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(await screen.findByText("2 neue Treffer.")).toBeInTheDocument();
    expect(screen.getByText(/Am stärksten: N26 mit 86\./)).toBeInTheDocument();
  });

  it("shows the list only together with the due card, so nothing shifts", async () => {
    let releaseDue: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      releaseDue = resolve;
    });
    const data = server({
      due: [
        buildListItem({ id: "d", status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00Z" }),
      ],
    });
    const jobs = (call: RecordedCall) =>
      new URL(call.url).searchParams.get("statuses")?.includes("APPLIED")
        ? held
        : inboxJobs(data)(call);
    const calls = stubRoutes(inboxStubs(data, { "GET /jobs": jobs }));
    renderWithProviders(<InboxPage />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("link", { name: "Senior Kotlin Engineer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Unter Schwellwert/ })).not.toBeInTheDocument();
    const dueCall = calls.find((call) => call.url.includes("statuses=APPLIED"))!;
    releaseDue(inboxJobs(data)(dueCall));
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Anstehend" })).toBeInTheDocument();
  });

  it("shows the list when the due card fails", async () => {
    const jobs = (call: RecordedCall) =>
      new URL(call.url).searchParams.get("statuses")?.includes("APPLIED")
        ? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" })
        : inboxJobs(server())(call);
    stubRoutes(inboxStubs(server(), { "GET /jobs": jobs }));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Erneut versuchen: Anstehende Schritte" }),
    ).toBeInTheDocument();
  });

  it("lists the matches as links to the job page with fit line and score", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    const link = await screen.findByRole("link", { name: "Senior Kotlin Engineer" });
    expect(link).toHaveAttribute("href", "/jobs/job-1");
    const row = link.closest("li") as HTMLElement;
    expect(within(row).getByText("Kotlin und Kafka sind dein Alltag.")).toBeInTheDocument();
    expect(within(row).getByText("86")).toBeInTheDocument();
    expect(await within(row).findByText(/N26 · .* · StepStone/)).toBeInTheDocument();
  });

  it("names the phase of a former application among the sorted-out jobs", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    const former = buildListItem({
      title: "Teamlead Java Backend",
      company: "Check24",
      status: "APPLIED",
      is_archived: true,
      archive_reason: "USER",
    });
    stubRoutes(inboxStubs(server({ dismissed: [former] })));
    renderWithProviders(<InboxPage />);
    const link = await screen.findByRole("link", { name: "Teamlead Java Backend" });
    const row = link.closest("li") as HTMLElement;
    expect(within(row).getByText(/Check24 · .* · Beworben$/)).toBeInTheDocument();
  });

  it("counts every tab", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("tab", { name: "Neu 2 neue Treffer" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Unter Schwellwert 1" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Von dir aussortiert 0" })).toBeInTheDocument();
  });

  it("keeps the chosen tab in the URL", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Unter Schwellwert/ }));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?tab=unter", { scroll: false });
  });

  it("shows the tab from the URL", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByRole("link", { name: "Fullstack-Entwickler PHP" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Unter Schwellwert/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("says when everything is seen", async () => {
    stubRoutes(inboxStubs(server({ new: [] })));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Keine neuen Treffer" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alles gesichtet." })).not.toBeInTheDocument();
    expect(
      screen.getByText("Alles gesichtet. Neue Treffer erscheinen nach dem nächsten Lauf."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quellen ansehen" })).toHaveAttribute(
      "href",
      "/sources",
    );
  });

  it("focuses the Unter Schwellwert tab after the empty state switched to it", async () => {
    followReplace();
    stubRoutes(inboxStubs(server({ new: [] })));
    renderWithProviders(<InboxPage />);
    const toBelow = await screen.findByRole("button", { name: "Unter Schwellwert ansehen" });
    toBelow.focus();
    await userEvent.keyboard("{Enter}");
    const tab = screen.getByRole("tab", { name: /Unter Schwellwert/ });
    await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
    expect(tab).toHaveFocus();
  });

  it("starts the Neu list with the setup status on a deep link to another tab (M5)", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    const unanswered = () => new Promise<Response>(() => undefined);
    const calls = stubRoutes(inboxStubs(server(), { "GET /setup-status": unanswered }));
    renderWithProviders(<InboxPage />);
    // The deck and the Neu count read this list; it must not wait for /setup-status.
    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith(inboxListPath("new", 0)))).toBe(true),
    );
  });

  it("shows an error with retry and loads again", async () => {
    const data = server();
    let failing = true;
    const jobs = (call: RecordedCall) =>
      failing ? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }) : inboxJobs(data)(call);
    stubRoutes(inboxStubs(data, { "GET /jobs": jobs }));
    renderWithProviders(<InboxPage />);
    // Since R19(1) list and due card fail before the inbox mounts, so both errors show at once.
    expect(
      await within(await screen.findByRole("tabpanel")).findByText(
        "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    failing = false;
    // The due request fails as well; the gate opens as soon as it has failed (retries are off in
    // tests, with retries it opens while they run), so the list shows its error and its retry.
    // The due card's retry button has its own name.
    const retry = await screen.findByRole("button", { name: "Erneut versuchen" });
    await userEvent.click(retry);
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
  });

  it("announces only the list error as an alert when the API is down (M4)", async () => {
    const failed = () => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" });
    stubRoutes(inboxStubs(server(), { "GET /jobs": failed, "GET /platforms": failed }));
    renderWithProviders(<InboxPage />);
    const listError = await within(await screen.findByRole("tabpanel")).findByText(
      "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
    );
    expect(
      await screen.findByText("Der letzte Lauf konnte nicht geladen werden."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Anstehend:")).toBeInTheDocument();
    // The toast stack keeps its own (empty) alert region; only the page's alerts count.
    const alerts = screen
      .getAllByRole("alert")
      .filter((alert) => !alert.classList.contains("toast-region"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContainElement(listError);
  });

  it("loads the next page on request", async () => {
    const many = Array.from({ length: 51 }, (_, index) =>
      buildListItem({ id: `job-${index}`, title: `Stelle ${index}` }),
    );
    const calls = stubRoutes(inboxStubs(server({ new: many })));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Weitere laden" }));
    expect(await screen.findByRole("link", { name: "Stelle 50" })).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("limit=50&offset=50"))).toBe(true);
  });
});

function scheduled(run: PlatformBody["last_run"]): PlatformBody[] {
  return platformsWithRun(run).map((platform) => ({
    ...platform,
    schedule_time: "14:00",
    schedule_days: [0, 1, 2, 3, 4],
  }));
}

async function runLineText(): Promise<string | null> {
  const line = (await screen.findByText(/Nächster Lauf/)).closest("p");
  return line?.textContent ?? null;
}

describe("InboxPage run line text", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("separates the last and the next run and puts the action last", async () => {
    stubRoutes(inboxStubs(server(), { "GET /platforms": scheduled(RUN) }));
    renderWithProviders(<InboxPage />);
    expect(await runLineText()).toBe(
      "Letzter Lauf: StepStone, heute 08:00. 12 gefunden, 3 passend, 2 unter Schwellwert" +
        " · Nächster Lauf heute 14:00. Ansehen",
    );
    expect(screen.getByText("StepStone", { selector: ".runline b" })).toBeInTheDocument();
  });

  it("separates a failed run from the next one and ends with the sources link", async () => {
    stubRoutes(
      inboxStubs(server(), { "GET /platforms": scheduled({ ...RUN, error: "unreachable" }) }),
    );
    renderWithProviders(<InboxPage />);
    expect(await runLineText()).toBe(
      "Letzter Lauf: StepStone, heute 08:00, fehlgeschlagen (Seite nicht erreichbar)" +
        " · Nächster Lauf heute 14:00. Quellen ansehen",
    );
  });

  it("shows a cancelled run neutrally, without the sources link", async () => {
    stubRoutes(
      inboxStubs(server(), { "GET /platforms": scheduled({ ...RUN, error: "cancelled" }) }),
    );
    renderWithProviders(<InboxPage />);
    expect(await runLineText()).toBe(
      "Letzter Lauf: StepStone, heute 08:00, abgebrochen · Nächster Lauf heute 14:00.",
    );
    expect(document.querySelector(".runline .t-danger")).toBeNull();
    expect(screen.queryByRole("link", { name: "Quellen ansehen" })).not.toBeInTheDocument();
  });

  it("offers no way to the jobs below the threshold while that tab is open", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    stubRoutes(inboxStubs(server(), { "GET /platforms": scheduled(RUN) }));
    renderWithProviders(<InboxPage />);
    expect(await runLineText()).toBe(
      "Letzter Lauf: StepStone, heute 08:00. 12 gefunden, 3 passend, 2 unter Schwellwert" +
        " · Nächster Lauf heute 14:00.",
    );
    expect(
      screen.queryByRole("button", { name: "Unter Schwellwert ansehen" }),
    ).not.toBeInTheDocument();
  });
});

describe("InboxPage run line", () => {
  it("reports the last run with its counts and opens the tab below the threshold", async () => {
    stubRoutes(inboxStubs(server(), { "GET /platforms": platformsWithRun(RUN) }));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByText(/12 gefunden, 3 passend, 2 unter Schwellwert\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Letzter Lauf: /)).toHaveTextContent(/^Letzter Lauf: StepStone, /);
    const view = screen.getByRole("button", { name: "Unter Schwellwert ansehen" });
    expect(view).toHaveTextContent(/^Ansehen$/);
    await userEvent.click(view);
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?tab=unter", { scroll: false });
  });

  it("says when no source has run yet", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByText("Noch kein Lauf.")).toBeInTheDocument();
  });

  it("names the reason of a failed run and links to the sources", async () => {
    const failed = platformsWithRun({ ...RUN, error: "unreachable" });
    stubRoutes(inboxStubs(server(), { "GET /platforms": failed }));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByText(/fehlgeschlagen \(Seite nicht erreichbar\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quellen ansehen" })).toHaveAttribute(
      "href",
      "/sources",
    );
  });

  it("shows an unknown run error neutrally, never as raw text", async () => {
    const failed = platformsWithRun({ ...RUN, error: "Traceback: boom" });
    stubRoutes(inboxStubs(server(), { "GET /platforms": failed }));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByText(/fehlgeschlagen \(Grund unbekannt\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
  });

  it("shows an error with retry when the sources cannot be loaded", async () => {
    let failing = true;
    const platforms = () =>
      failing
        ? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" })
        : jsonResponse(HTTP_OK, platformsWithRun(RUN));
    stubRoutes(inboxStubs(server(), { "GET /platforms": platforms }));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByText("Der letzte Lauf konnte nicht geladen werden."),
    ).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(
      await screen.findByText(/12 gefunden, 3 passend, 2 unter Schwellwert\./),
    ).toBeInTheDocument();
  });
});
