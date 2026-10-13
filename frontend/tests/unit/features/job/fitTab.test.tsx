import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId, STALL_AFTER_MS } from "@/domain/pendingTasks";
import { FitTab } from "@/features/job/fit/FitTab";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00Z");
const REASONING = `## Zusammenfassung
Du passt gut.
## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren
- Kafka
## Lücken & Herausforderungen
- Kein GCP
## Empfehlung
Bewirb dich.`;
const REASONING_WITH_EXTRA = `${REASONING}
## Gehaltsrahmen
Eher **unter** deinem Wunsch.
- Bonus unklar`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("FitTab", () => {
  it("lists what fits and what is missing", () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    expect(screen.getByRole("heading", { name: /Passt/ })).toHaveTextContent("2");
    expect(screen.getByRole("heading", { name: /Lücken/ })).toHaveTextContent("1");
    expect(screen.getByText("Kotlin").tagName).toBe("STRONG");
    expect(screen.getByText(/Du passt gut/)).toBeInTheDocument();
  });

  it("renders sections outside the known four as markdown after them", () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING_WITH_EXTRA })} />);
    const heading = screen.getByRole("heading", { name: "Gehaltsrahmen" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("unter").tagName).toBe("STRONG");
    expect(screen.getByText("Bonus unklar")).toBeInTheDocument();
    const recommendation = screen.getByText(/Bewirb dich/);
    expect(
      recommendation.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows unknown reasoning formats as text", () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: "Passt gut, aber Gehalt unklar." })} />);
    expect(screen.getByText("Passt gut, aber Gehalt unklar.")).toBeInTheDocument();
  });

  it("keeps the posting text behind a disclosure", async () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    await userEvent.click(screen.getByRole("button", { name: "Text der Stellenanzeige" }));
    expect(screen.getByText(/Plattform-Team/)).toBeVisible();
  });

  it("starts a first analysis and shows that it runs", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/analyze": { status: "started" } });
    renderWithProviders(<FitTab job={buildJob({ reasoning: null, match_score: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Jetzt bewerten" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText("Wird bewertet …")).toBeInTheDocument();
  });

  it("hides Neu bewerten while a re-analysis runs", async () => {
    stubRoutes({ "POST /jobs/job-1/analyze": { status: "started" } });
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    await userEvent.click(screen.getByRole("button", { name: "Neu bewerten" }));
    expect(await screen.findByText("Wird bewertet …")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Neu bewerten" })).not.toBeInTheDocument();
  });

  it("says too many requests when the analysis is rate limited", async () => {
    stubRoutes({
      "POST /jobs/job-1/analyze": jsonResponse(429, {
        error: "Rate limit exceeded: 10 per 1 minute",
      }),
    });
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    await userEvent.click(screen.getByRole("button", { name: "Neu bewerten" }));
    expect(await screen.findByText("Zu viele Anfragen, bitte kurz warten.")).toBeInTheDocument();
    expect(screen.queryByText("Wird bewertet …")).not.toBeInTheDocument();
  });

  it("offers a retry when the analysis stalls", async () => {
    stubRoutes({});
    const { queryClient } = renderWithProviders(
      <FitTab job={buildJob({ reasoning: REASONING })} />,
    );
    act(() =>
      queryClient.setQueryData(queryKeys.pendingTasks, {
        [pendingTaskId.analysis("job-1")]: {
          startedAt: NOW.getTime() - STALL_AFTER_MS,
          failed: false,
        },
      }),
    );
    // The query cache notifies observers on a macrotask, so wait for the stalled line.
    expect(await screen.findByText(/dauert ungewöhnlich lange/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
