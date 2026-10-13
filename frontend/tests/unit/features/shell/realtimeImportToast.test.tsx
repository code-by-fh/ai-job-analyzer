import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeProvider } from "@/features/shell/RealtimeProvider";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import { markImportStarted } from "@/realtime/importSignals";
import { openRealtime } from "@/realtime/openRealtime";
import { ToastProvider } from "@/ui/ToastProvider";
import { createTestQueryClient, renderWithProviders } from "../../support/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/realtime/openRealtime", () => ({ openRealtime: vi.fn() }));

const USER_ID = 7;
const CRAWL = "crawl-9";

function openedDeps(): RealtimeDeps {
  const call = vi.mocked(openRealtime).mock.calls.at(-1);
  if (!call) throw new Error("the provider did not open the socket");
  return call[1];
}

beforeEach(() => {
  vi.mocked(openRealtime).mockReset();
  vi.mocked(openRealtime).mockReturnValue({ close: vi.fn() } as unknown as ReturnType<
    typeof openRealtime
  >);
});

describe("RealtimeProvider import toast", () => {
  it("shows the toast when an import started in this tab finishes", async () => {
    const { queryClient } = renderWithProviders(
      <RealtimeProvider userId={USER_ID}>x</RealtimeProvider>,
    );
    markImportStarted(queryClient, CRAWL, Date.now());
    const send = (event: object) =>
      handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, openedDeps());
    send({ type: "new_job", crawl_job_id: CRAWL, job: { id: "job-30", match_score: 80 } });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(await screen.findByText("Importiert und bewertet: 80 · Stark.")).toBeInTheDocument();
  });

  it("reports a completed crawl without a job as unreadable", async () => {
    const { queryClient } = renderWithProviders(
      <RealtimeProvider userId={USER_ID}>x</RealtimeProvider>,
    );
    markImportStarted(queryClient, CRAWL, Date.now());
    handleRealtimeMessage(
      JSON.stringify({ type: "crawl_job_completed", user_id: USER_ID, job_id: CRAWL }),
      USER_ID,
      openedDeps(),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Anzeige konnte nicht gelesen werden.",
    );
  });

  it("shows the toast of an import finished before it was marked as started", async () => {
    const { queryClient } = renderWithProviders(
      <RealtimeProvider userId={USER_ID}>x</RealtimeProvider>,
    );
    handleRealtimeMessage(
      JSON.stringify({
        type: "job_skipped",
        user_id: USER_ID,
        job_id: CRAWL,
        existing_job_id: "j1",
      }),
      USER_ID,
      openedDeps(),
    );
    handleRealtimeMessage(
      JSON.stringify({ type: "crawl_job_completed", user_id: USER_ID, job_id: CRAWL }),
      USER_ID,
      openedDeps(),
    );
    markImportStarted(queryClient, CRAWL, Date.now());
    expect(await screen.findByText("Diese Stelle ist schon da.")).toBeInTheDocument();
  });
});

describe("RealtimeProvider cleanup (M8a)", () => {
  it("reports no import through a provider that was unmounted", async () => {
    const queryClient = createTestQueryClient();
    const tree = (mounted: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {mounted ? <RealtimeProvider userId={USER_ID}>x</RealtimeProvider> : null}
        </ToastProvider>
      </QueryClientProvider>
    );
    const view = render(tree(true));
    const deps = openedDeps();
    view.rerender(tree(false));
    const send = (event: object) =>
      handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, deps);
    send({ type: "job_skipped", job_id: CRAWL, existing_job_id: "j1" });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    // act flushes a toast a stale listener would show.
    await act(async () => markImportStarted(queryClient, CRAWL, Date.now()));
    expect(screen.queryByText("Diese Stelle ist schon da.")).not.toBeInTheDocument();
  });
});
