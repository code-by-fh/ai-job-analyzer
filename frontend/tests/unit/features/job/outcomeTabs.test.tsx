import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { JobPage } from "@/features/job/JobPage";
import { CELEBRATION_MS } from "@/features/job/outcome/Celebration";
import { FirstDayTab } from "@/features/job/outcome/FirstDayTab";
import { MoveOnTab } from "@/features/job/outcome/MoveOnTab";
import { firstQuoteIndex, QUOTES } from "@/features/job/outcome/quotes";
import { de } from "@/i18n/de";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const PATCHED = { status: "updated" };
const START_DATE = "2026-12-01";
const NOTES_SAVE_TIMEOUT_MS = 2000;

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

afterEach(() => {
  vi.useRealTimers();
});

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));

function showFirstDay(job: JobDetail): RecordedCall[] {
  const calls = stubRoutes({ "PATCH /jobs/job-1": PATCHED, "GET /jobs/job-1": job });
  renderWithProviders(<FirstDayTab job={job} />);
  return calls;
}

function showMoveOn(job: JobDetail, openMatches = 3): RecordedCall[] {
  const calls = stubRoutes({
    "PATCH /jobs/job-1": PATCHED,
    "GET /jobs/job-1": job,
    "GET /jobs/counts": { status_counts: { OPEN: openMatches } },
  });
  renderWithProviders(<MoveOnTab job={job} />);
  return calls;
}

describe("FirstDayTab", () => {
  it("congratulates by company name as the static success message", () => {
    showFirstDay(buildJob({ status: "ACCEPTED" }));
    expect(
      screen.getByRole("heading", { name: "Glückwunsch, du fängst bei ACME GmbH an!" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Laufende Bewerbungen ansehen" })).toHaveAttribute(
      "href",
      "/applications",
    );
  });

  it("stores a ticked item with every key of the first-day checklist", async () => {
    const calls = showFirstDay(buildJob({ status: "ACCEPTED" }));
    await userEvent.click(screen.getByLabelText("Vertrag unterschrieben zurückgeschickt"));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        {
          first_day_checklist: {
            contract_signed: true,
            papers_ready: false,
            others_declined: false,
            route_planned: false,
            first_day_contact: false,
          },
        },
      ]),
    );
  });

  it("counts the done items and links to the applications until they are withdrawn", () => {
    showFirstDay(
      buildJob({
        status: "ACCEPTED",
        first_day_checklist: {
          contract_signed: false,
          papers_ready: false,
          others_declined: true,
          route_planned: true,
          first_day_contact: false,
        },
      }),
    );
    expect(screen.getByText("2 von 5 erledigt")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Laufende Bewerbungen ansehen" })).toBeNull();
  });

  it("saves a complete start date at once and names the day", async () => {
    const calls = showFirstDay(buildJob({ status: "ACCEPTED" }));
    fireEvent.change(screen.getByLabelText("Erster Arbeitstag"), {
      target: { value: START_DATE },
    });
    await waitFor(() => expect(patches(calls)).toEqual([{ start_date: START_DATE }]));
    expect(screen.getByText(/^Start am 01\.12\.2026, /)).toBeInTheDocument();
  });

  it("clears a stored start date only when the emptied field is left", async () => {
    const calls = showFirstDay(buildJob({ status: "ACCEPTED", start_date: START_DATE }));
    const field = screen.getByLabelText("Erster Arbeitstag");
    fireEvent.change(field, { target: { value: "" } });
    expect(patches(calls)).toEqual([]);
    fireEvent.blur(field);
    await waitFor(() => expect(patches(calls)).toEqual([{ start_date: null }]));
  });

  it("autosaves the outcome notes, not the Verlauf notes", async () => {
    const calls = showFirstDay(buildJob({ status: "ACCEPTED", notes: "Gehalt" }));
    await userEvent.type(screen.getByLabelText("Notizen zum Start"), "Um 9 Uhr am Empfang");
    await waitFor(
      () => expect(patches(calls)).toEqual([{ outcome_notes: "Um 9 Uhr am Empfang" }]),
      { timeout: NOTES_SAVE_TIMEOUT_MS },
    );
  });
});

describe("MoveOnTab", () => {
  it("shows a stable quote per job and another one on request", async () => {
    showMoveOn(buildJob({ status: "REJECTED" }));
    const first = QUOTES[firstQuoteIndex("job-1")];
    const second = QUOTES[(firstQuoteIndex("job-1") + 1) % QUOTES.length];
    expect(screen.getByText(de[first.text])).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Anderer Spruch" }));
    expect(screen.getByText(de[second.text])).toBeInTheDocument();
    expect(screen.getByText(de[second.source])).toBeInTheDocument();
  });

  it("leads back to the inbox with its new matches", async () => {
    showMoveOn(buildJob({ status: "REJECTED" }));
    expect(screen.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
    expect(await screen.findByText("3 neue Treffer warten dort.")).toBeInTheDocument();
  });

  it("names no count while the inbox is empty", async () => {
    const calls = showMoveOn(buildJob({ status: "REJECTED" }), 0);
    await waitFor(() => expect(calls.some((call) => call.url.includes("/jobs/counts"))).toBe(true));
    expect(screen.queryByText(/Treffer/)).toBeNull();
  });

  it("autosaves the closing notes into the outcome notes", async () => {
    const calls = showMoveOn(buildJob({ status: "REJECTED" }));
    await userEvent.type(screen.getByLabelText("Notizen zum Abschluss"), "Mehr Kotlin zeigen");
    await waitFor(() => expect(patches(calls)).toEqual([{ outcome_notes: "Mehr Kotlin zeigen" }]), {
      timeout: NOTES_SAVE_TIMEOUT_MS,
    });
  });
});

const celebration = () => document.querySelector(".celebrate");

function showOffer() {
  const job = buildJob({ status: "OFFER", cv_html_present: true, cover_letter_html_present: true });
  stubRoutes({
    "GET /jobs/job-1": job,
    "GET /jobs/job-1/history": [],
    "POST /jobs/job-1/status": (call: RecordedCall) =>
      jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to }),
  });
  renderWithProviders(<JobPage jobId="job-1" />);
}

describe("Accepted offer", () => {
  it("celebrates, opens 1. Arbeitstag and clears the celebration after it played", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    showOffer();
    await user.click(await screen.findByRole("button", { name: "Angebot angenommen" }));
    // Decorative and aria-hidden, so it has no role or name to find it by.
    await waitFor(() => expect(celebration()).not.toBeNull());
    expect(celebration()).toHaveAttribute("aria-hidden", "true");
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=erster-tag", {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(CELEBRATION_MS));
    expect(celebration()).toBeNull();
  });

  it("opens Wie geht's weiter without a celebration when the offer is declined", async () => {
    showOffer();
    await userEvent.click(await screen.findByRole("button", { name: "Angebot abgelehnt" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=wie-weiter", {
        scroll: false,
      }),
    );
    expect(celebration()).toBeNull();
  });
});

describe("Outcome tabs in the tab bar", () => {
  function showClosed(status: string) {
    stubRoutes({
      "GET /jobs/job-1": buildJob({ status }),
      "GET /jobs/job-1/history": [],
      "GET /jobs/counts": { status_counts: {} },
    });
    renderWithProviders(<JobPage jobId="job-1" />);
  }

  it("opens an accepted job on 1. Arbeitstag", async () => {
    showClosed("ACCEPTED");
    const tab = await screen.findByRole("tab", { name: "1. Arbeitstag" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Wie geht's weiter" })).toBeNull();
  });

  it("ignores a hidden outcome tab in the address", async () => {
    navigation.search = "tab=erster-tag";
    showClosed("REJECTED");
    const tablist = await screen.findByRole("tablist");
    expect(within(tablist).queryByRole("tab", { name: "1. Arbeitstag" })).toBeNull();
    expect(within(tablist).getByRole("tab", { name: "Wie geht's weiter" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
