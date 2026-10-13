import { QueryClient, onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { InboxPage } from "@/features/inbox/InboxPage";
import { DUE_GATE_MAX_WAIT_MS } from "@/features/inbox/useDueGate";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { inboxJobs, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const ROW = { name: "Senior Kotlin Engineer" };
const NEVER = new Promise<Response>(() => undefined);

function server(): InboxServer {
  const row = buildListItem({ id: "job-1", title: ROW.name, match_score: 86 });
  return { new: [row], below: [], dismissed: [], due: [] };
}

const isDue = (call: RecordedCall) => call.url.includes("statuses=APPLIED");

function routesWithDue(due: (call: RecordedCall) => Response | Promise<Response>) {
  const data = server();
  const list = inboxJobs(data);
  return inboxStubs(data, {
    "GET /jobs": (call: RecordedCall) => (isDue(call) ? due(call) : list(call)),
  });
}

beforeEach(() => installFakeMatchMedia(false));
afterEach(() => {
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe("the due gate of the inbox list", () => {
  it("opens after the maximum wait when the due request hangs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stubRoutes(routesWithDue(() => NEVER));
    renderWithProviders(<InboxPage />);
    await act(() => vi.advanceTimersByTimeAsync(DUE_GATE_MAX_WAIT_MS - 100));
    expect(screen.queryByRole("link", ROW)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByRole("link", ROW)).toBeInTheDocument();
  });

  it("opens at once while the due request is failing and being retried", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 2, retryDelay: 60_000 } },
    });
    stubRoutes(routesWithDue(() => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" })));
    renderWithProviders(<InboxPage />, client);
    expect(await screen.findByRole("link", ROW)).toBeInTheDocument();
  });

  it("opens when the due request is paused offline", async () => {
    const client = createTestQueryClient();
    const cached = { pages: [{ items: server().new, total: 1 }], pageParams: [0] };
    client.setQueryData(queryKeys.inboxList("new"), cached);
    onlineManager.setOnline(false);
    stubRoutes(routesWithDue(() => NEVER));
    renderWithProviders(<InboxPage />, client);
    await waitFor(() => expect(screen.getByRole("link", ROW)).toBeInTheDocument());
  });
});
