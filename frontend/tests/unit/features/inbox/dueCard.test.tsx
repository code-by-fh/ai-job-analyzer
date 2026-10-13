import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { DueCard } from "@/features/inbox/DueCard";
import { de } from "@/i18n/de";
import { jsonResponse } from "../../support/fakeFetch";
import { inboxJobs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00Z");
const HTTP_SERVER_ERROR = 500;
const REGION = { name: "Anstehend" };
const LOAD_ERROR = "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
const RETRY = { name: "Erneut versuchen: Anstehende Schritte" };

function server(due: InboxServer["due"]): InboxServer {
  return { new: [], below: [], dismissed: [], due };
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => vi.useRealTimers());

describe("DueCard", () => {
  it("lists due applications, earliest first, overdue in amber", async () => {
    stubRoutes({
      "GET /jobs": inboxJobs(
        server([
          buildListItem({
            id: "b",
            title: "Kotlin Developer",
            company: "Hermes",
            status: "INTERVIEW",
            interview_at: "2026-10-09T12:00:00Z",
          }),
          buildListItem({
            id: "a",
            title: "Platform Engineer",
            company: "Otto",
            status: "APPLIED",
            next_follow_up_at: "2026-10-01T08:00:00Z",
          }),
          buildListItem({
            id: "c",
            title: "Java Engineer",
            company: "Tchibo",
            status: "APPLIED",
            next_follow_up_at: "2026-10-30T08:00:00Z",
          }),
        ]),
      ),
    });
    renderWithProviders(<DueCard />);
    const card = await screen.findByRole("region", REGION);
    const links = within(card).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/jobs/a", "/jobs/b"]);
    expect(links[0]).toHaveTextContent(de["next.followUp.title"]);
    expect(links[0]).toHaveTextContent("Otto · Platform Engineer");
    expect(within(card).getByText("überfällig seit 01.10.2026")).toHaveClass("t-warn");
  });

  it("words a past interview neutrally and keeps it out of amber", async () => {
    stubRoutes({
      "GET /jobs": inboxJobs(
        server([
          buildListItem({
            id: "i",
            status: "INTERVIEW",
            interview_at: "2026-10-05T12:00:00Z",
          }),
        ]),
      ),
    });
    renderWithProviders(<DueCard />);
    const card = await screen.findByRole("region", REGION);
    const when = within(card).getByText("seit 05.10.2026");
    expect(when).not.toHaveClass("t-warn");
    expect(card).not.toHaveTextContent("überfällig");
  });

  it("stays hidden when nothing is due", async () => {
    const calls = stubRoutes({
      "GET /jobs": inboxJobs(server([buildListItem({ status: "APPLIED" })])),
    });
    const { queryClient } = renderWithProviders(<DueCard />);
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.dueApplications)?.status).toBe("success"),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", REGION)).not.toBeInTheDocument();
  });

  it("offers a retry that is busy while it loads", async () => {
    stubRoutes({ "GET /jobs": jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }) });
    renderWithProviders(<DueCard />);
    expect(await screen.findByText(LOAD_ERROR, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    vi.useRealTimers();
    const pending = new Promise<Response>(() => undefined);
    stubRoutes({ "GET /jobs": () => pending });
    await userEvent.click(screen.getByRole("button", RETRY));
    await waitFor(() =>
      expect(screen.getByRole("button", RETRY)).toHaveAttribute("aria-busy", "true"),
    );
  });

  it("loads again after the retry", async () => {
    stubRoutes({ "GET /jobs": jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }) });
    renderWithProviders(<DueCard />);
    await screen.findByText(LOAD_ERROR, { exact: false });
    vi.useRealTimers();
    stubRoutes({ "GET /jobs": inboxJobs(server([])) });
    await userEvent.click(screen.getByRole("button", RETRY));
    await waitFor(() =>
      expect(screen.queryByText(LOAD_ERROR, { exact: false })).not.toBeInTheDocument(),
    );
  });
});
