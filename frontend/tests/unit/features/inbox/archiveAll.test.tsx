import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { inboxStubs } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/inbox",
}));

const HTTP_TOO_MANY = 429;
const RATE_LIMITED = "Zu viele Anfragen, bitte kurz warten.";

beforeEach(() => installFakeMatchMedia(false));

function renderInbox(extra: RouteTable) {
  const queryClient = createTestQueryClient();
  const server = {
    new: [buildListItem({ title: "Senior Kotlin Engineer" })],
    below: [],
    dismissed: [],
    due: [],
  };
  const calls = stubRoutes(inboxStubs(server, extra));
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  renderWithProviders(<InboxPage />, queryClient);
  return { calls, invalidate };
}

async function openArchive(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "Alle Stellen archivieren" }));
  return screen.findByRole("dialog", { name: "Alle Stellen archivieren" });
}

const archiveCalls = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "DELETE" && new URL(call.url).pathname === "/jobs");
const archiveQuery = (calls: RecordedCall[]) =>
  Object.fromEntries(new URL(archiveCalls(calls)[0]!.url).searchParams);

describe("Alle Stellen archivieren (Eingang)", () => {
  it("asks, sends both options and toasts the count", async () => {
    const { calls, invalidate } = renderInbox({
      "DELETE /jobs": { status: "archived", count: 3 },
    });
    const confirm = await openArchive();
    expect(confirm).toHaveTextContent(
      "Verschiebt alle Treffer im Eingang nach „Von dir aussortiert“.",
    );
    expect(archiveCalls(calls)).toHaveLength(0);
    const archive = within(confirm).getByRole("button", { name: "Archivieren" });
    expect(archive).toHaveClass("btn-primary");
    await userEvent.click(archive);
    expect(await screen.findByText("3 Stellen archiviert.")).toBeVisible();
    expect(archiveQuery(calls)).toEqual({ keep_favorites: "true", keep_applications: "true" });
    for (const queryKey of [
      queryKeys.jobsRoot,
      queryKeys.jobCounts,
      queryKeys.setupStatus,
      queryKeys.platforms,
      queryKeys.thresholdDistribution,
      queryKeys.thresholdPreviewRoot,
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("unchecked options are sent and named in the question", async () => {
    const { calls } = renderInbox({ "DELETE /jobs": { status: "archived", count: 1 } });
    const confirm = await openArchive();
    await userEvent.click(within(confirm).getByRole("checkbox", { name: "Favoriten behalten" }));
    await userEvent.click(within(confirm).getByRole("checkbox", { name: "Bewerbungen behalten" }));
    expect(confirm).toHaveTextContent("Auch Favoriten werden archiviert.");
    expect(confirm).toHaveTextContent("Auch Bewerbungen werden archiviert.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Archivieren" }));
    expect(await screen.findByText("1 Stelle archiviert.")).toBeVisible();
    expect(archiveQuery(calls)).toEqual({ keep_favorites: "false", keep_applications: "false" });
  });

  it("says when there was nothing to archive and returns focus to its button", async () => {
    renderInbox({ "DELETE /jobs": { status: "archived", count: 0 } });
    const confirm = await openArchive();
    await userEvent.click(within(confirm).getByRole("button", { name: "Archivieren" }));
    expect(await screen.findByText("Nichts zu archivieren.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Alle Stellen archivieren" })).toHaveFocus(),
    );
  });

  it("keeps the question open and toasts when the archive fails", async () => {
    renderInbox({
      "DELETE /jobs": () => jsonResponse(HTTP_TOO_MANY, { error: "Rate limit exceeded" }),
    });
    const confirm = await openArchive();
    await userEvent.click(within(confirm).getByRole("button", { name: "Archivieren" }));
    expect(await screen.findByText(RATE_LIMITED)).toBeVisible();
    expect(confirm).toBeInTheDocument();
  });
});
