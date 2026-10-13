import { onlineManager, QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSED_APPLICATION_STATUSES } from "@/api/jobListPaths";
import { queryKeys } from "@/api/queryKeys";
import { STRIP_TICK_MAX } from "@/domain/applications";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { showAllPhases } from "@/features/applications/PhaseStrip";
import type { ApplicationsUrl } from "@/features/applications/useApplicationsUrl";
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

const EXTRA_DRAFTED = 6;
const SERVER_ERROR = 500;
// Retries wait far longer than any test runs, so a failed request stays "retrying".
const RETRY_LATER = { queries: { retry: 1, retryDelay: 600_000 } };

function server(drafted = 2): ApplicationsServer {
  const draftedRows = Array.from({ length: drafted }, (_, index) =>
    buildListItem({ id: `d${index}`, title: `Drafted ${index}`, status: "DRAFTED" }),
  );
  return {
    active: [
      ...draftedRows,
      buildListItem({ id: "a1", title: "Kotlin Developer", status: "APPLIED" }),
    ],
    closed: [buildListItem({ id: "c1", status: "REJECTED" })],
  };
}

const NO_APPLICATIONS: ApplicationsServer = { active: [], closed: [] };

const isClosedTotal = (call: RecordedCall) => {
  const params = new URL(call.url).searchParams;
  return (
    params.get("statuses") === CLOSED_APPLICATION_STATUSES.join(",") && params.get("limit") === "1"
  );
};

/** GET /jobs as the server answers it, except that the closed counter fails. */
function closedTotalFails(rows: ApplicationsServer) {
  const answer = applicationsJobs(rows);
  return (call: RecordedCall) =>
    isClosedTotal(call) ? jsonResponse(SERVER_ERROR, { detail: "boom" }) : answer(call);
}

const strip = () => screen.getByRole("group", { name: "Phasen" });
const stripButton = (name: RegExp) => within(strip()).getByRole("button", { name });

async function openPage(queryClient?: QueryClient) {
  renderWithProviders(<ApplicationsPage />, queryClient);
  await screen.findByRole("group", { name: "Phasen" });
}

beforeEach(() => liveNavigation.reset());
afterEach(() => onlineManager.setOnline(true));

describe("PhaseStrip", () => {
  it("counts every phase, the closed one included", async () => {
    stubRoutes(applicationsStubs(server()));
    await openPage();
    expect(stripButton(/^Vorgemerkt/)).toHaveAccessibleName("Vorgemerkt: 2 Bewerbungen");
    expect(stripButton(/^Abgeschlossen/)).toHaveAccessibleName("Abgeschlossen: 1 Bewerbung");
    expect(stripButton(/^Angebot/)).toHaveAccessibleName("Angebot: 0 Bewerbungen");
    expect(stripButton(/^Angebot/)).toHaveClass("stage-offer");
  });

  it("filters to one phase and keeps focus on the pressed button", async () => {
    stubRoutes(applicationsStubs(server()));
    await openPage();
    await userEvent.click(stripButton(/^Beworben/));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?phase=beworben", {
      scroll: false,
    });
    expect(stripButton(/^Beworben/)).toHaveAttribute("aria-pressed", "true");
    expect(stripButton(/^Vorgemerkt/)).toHaveAttribute("aria-pressed", "false");
    expect(stripButton(/^Beworben/)).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Vorgemerkt" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Beworben" })).toBeInTheDocument();
  });

  it("shows all phases again when the pressed one is pressed", async () => {
    liveNavigation.reset("phase=beworben");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    await userEvent.click(stripButton(/^Beworben/));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications", { scroll: false });
    expect(await screen.findByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
    expect(stripButton(/^Beworben/)).toHaveFocus();
  });

  it("ignores an unknown phase in the URL", async () => {
    liveNavigation.reset("phase=foo");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    expect(within(strip()).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(await screen.findByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
  });

  it("draws one tick per application up to the cap", async () => {
    stubRoutes(applicationsStubs(server(STRIP_TICK_MAX + EXTRA_DRAFTED)));
    await openPage();
    const drafted = stripButton(/^Vorgemerkt/);
    expect(drafted.querySelectorAll(".strip-tick")).toHaveLength(STRIP_TICK_MAX);
    expect(within(drafted).getByText(`+${EXTRA_DRAFTED}`)).toBeInTheDocument();
  });

  it("hides the decorative number and ticks from assistive technology", async () => {
    stubRoutes(applicationsStubs(server()));
    await openPage();
    const drafted = stripButton(/^Vorgemerkt/);
    expect(drafted.querySelector(".strip-no")).toHaveAttribute("aria-hidden", "true");
    expect(drafted.querySelector(".strip-ticks")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PhaseStrip empty phase", () => {
  it("offers all phases from an empty one and hands focus to its strip button", async () => {
    liveNavigation.reset("phase=angebot");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    const offer = await screen.findByRole("region", { name: "Angebot" });
    expect(
      within(offer).getByText("In dieser Phase ist gerade keine Bewerbung."),
    ).toBeInTheDocument();
    await userEvent.click(within(offer).getByRole("button", { name: "Alle Phasen zeigen" }));
    expect(stripButton(/^Angebot/)).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Angebot" })).not.toBeInTheDocument(),
    );
  });

  it("falls back to the page title when the strip button is gone", async () => {
    stubRoutes(applicationsStubs(NO_APPLICATIONS));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("heading", { name: "Noch keine Bewerbungen" });
    const url: ApplicationsUrl = {
      q: "",
      phase: "OFFER",
      closedOpen: false,
      setSearch: vi.fn(),
      setPhase: vi.fn(),
      setClosedOpen: vi.fn(),
    };
    showAllPhases(url, "OFFER");
    expect(url.setPhase).toHaveBeenCalledWith(null);
    expect(screen.getByRole("heading", { level: 1, name: "Bewerbungen" })).toHaveFocus();
  });
});

describe("PhaseStrip first run", () => {
  it("is not shown on the first run", async () => {
    stubRoutes(applicationsStubs(NO_APPLICATIONS));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("heading", { name: "Noch keine Bewerbungen" });
    expect(screen.queryByRole("group", { name: "Phasen" })).not.toBeInTheDocument();
  });

  it("treats a hand-written phase on the first run as the first run (RB14)", async () => {
    liveNavigation.reset("phase=angebot");
    stubRoutes(applicationsStubs(NO_APPLICATIONS));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Phasen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alle Phasen zeigen" })).not.toBeInTheDocument();
  });
});

describe("PhaseStrip waiting", () => {
  it("counts the closed phase as 0 once its count is being retried (RB13)", async () => {
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": closedTotalFails(rows) }));
    await openPage(new QueryClient({ defaultOptions: RETRY_LATER }));
    expect(stripButton(/^Abgeschlossen/)).toHaveAccessibleName("Abgeschlossen: 0 Bewerbungen");
  });

  it("counts the closed phase as 0 while offline holds its count back (RB13)", async () => {
    stubRoutes(applicationsStubs(server()));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.applicationsList("active", ""), {
      pages: [pageOf(server().active)],
      pageParams: [0],
    });
    onlineManager.setOnline(false);
    await openPage(queryClient);
    expect(stripButton(/^Abgeschlossen/)).toHaveAccessibleName("Abgeschlossen: 0 Bewerbungen");
  });

  it("stays a hidden placeholder while the list shows its error (SC6)", async () => {
    stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs": () => jsonResponse(SERVER_ERROR, { detail: "boom" }),
      }),
    );
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Phasen" })).not.toBeInTheDocument();
    expect(document.querySelector(".strip-pending")).toHaveAttribute("aria-hidden", "true");
    // R11: the placeholder carries the real labels, invisible, so its height matches the strip.
    expect(document.querySelectorAll(".strip-pending .strip-ghost")).toHaveLength(5);
    expect(document.querySelector(".strip-pending button")).toBeNull();
  });
});
