import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/api/jobList";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { HTTP_OK, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

/** A live URL: replace() updates the search params and re-renders, as the App Router does. */
const navigation = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { params: new URLSearchParams() };
  const setParams = (params: URLSearchParams) => {
    state.params = params;
    listeners.forEach((listener) => listener());
  };
  const replace = vi.fn((href: string) => setParams(new URL(href, "http://app").searchParams));
  return { state, listeners, setParams, replace, push: vi.fn() };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    navigation.listeners.add(listener);
    return () => navigation.listeners.delete(listener);
  };
  return {
    useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => navigation.state.params),
    usePathname: () => "/inbox",
  };
});

const HTTP_SERVER_ERROR = 500;
const REASONING =
  "## Zusammenfassung\nKotlin ist dein Alltag.\n\n## Stärken & Übereinstimmung\n- Kotlin\n- Kafka\n\n## Lücken & Herausforderungen\n- Go";
const KOTLIN = buildListItem({
  id: "job-1",
  title: "Senior Kotlin Engineer",
  company: "N26",
  reasoning: REASONING,
});
const JAVA = buildListItem({ id: "job-2", title: "Backend Engineer (Java)", company: "Personio" });
const PHP = buildListItem({
  id: "job-20",
  title: "Fullstack-Entwickler PHP",
  is_archived: true,
  archive_reason: "THRESHOLD",
});
const GO = buildListItem({ id: "job-3", title: "Go Developer", company: "Zalando" });
const SELECT = { scroll: false };
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";

function server(overrides: Partial<InboxServer> = {}): InboxServer {
  return { new: [KOTLIN, JAVA], below: [PHP], dismissed: [], due: [], ...overrides };
}

/** PATCH /jobs/{id} that archives on the fake server, as the real one does. */
function archiveOn(data: InboxServer, id: string) {
  return () => {
    data.new = data.new.filter((row: JobListItem) => row.id !== id);
    return jsonResponse(HTTP_OK, { status: "updated" });
  };
}

/** A response the test releases later. */
function deferred() {
  let release: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { response, release };
}

function open(params = "", data = server(), extra: RouteTable = {}) {
  navigation.setParams(new URLSearchParams(params));
  stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": archiveOn(data, "job-1"), ...extra }));
  renderWithProviders(<InboxPage />);
  return screen.findByRole("complementary", { name: "Vorschau" });
}

const previewTitle = (preview: HTMLElement, name: string) =>
  within(preview).findByRole("heading", { level: 2, name });

// Since R16(3) row and pane buttons share names, so each lookup names its region.
const paneButton = (preview: HTMLElement, name: string) =>
  within(preview).findByRole("button", { name });
// The list area appears once the due query has settled, so the panel is awaited too.
const rowButton = async (name: string) =>
  within(await screen.findByRole("tabpanel")).findByRole("button", { name });

beforeEach(() => {
  navigation.replace.mockClear();
  installFakeMatchMedia(true);
});

describe("preview pane from 1200 px", () => {
  it("shows the first match beside the list", async () => {
    const preview = await open();
    expect(await previewTitle(preview, "Senior Kotlin Engineer")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "Passt 2" })).toBeInTheDocument();
    expect(within(preview).getByRole("link", { name: "Ganze Seite öffnen" })).toHaveAttribute(
      "href",
      "/jobs/job-1",
    );
    expect(
      screen.getByRole("link", { name: "Senior Kotlin Engineer", current: true }),
    ).toBeInTheDocument();
  });

  it("says an unscored job is not rated yet in 13 px meta text, not the 12 px hint (M3)", async () => {
    const unscored = buildListItem({ id: "job-1", title: "Go Developer", reasoning: null });
    const preview = await open("", server({ new: [unscored] }));
    const line = await within(preview).findByText("Noch nicht bewertet");
    expect(line).toHaveClass("meta");
    expect(line).not.toHaveClass("hint");
  });

  it("names the job in the pane's action buttons (R16(3))", async () => {
    const preview = await open();
    expect(await paneButton(preview, "Vormerken: Senior Kotlin Engineer")).toHaveTextContent(
      "Vormerken",
    );
    expect(
      within(preview).getByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" }),
    ).toBeInTheDocument();
  });

  it("drops the selection when the tab changes", async () => {
    await open("job=job-2");
    await userEvent.click(await screen.findByRole("tab", { name: /Unter Schwellwert/ }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?tab=unter", SELECT);
  });

  it("asks to pick a job when the list is empty", async () => {
    const preview = await open("", server({ new: [] }));
    expect(await within(preview).findByText("Wähle links eine Stelle aus.")).toBeInTheDocument();
  });

  it("shows nothing in the pane while the list failed to load", async () => {
    const failing = () => jsonResponse(HTTP_SERVER_ERROR, { detail: "db" });
    const preview = await open("", server(), { "GET /jobs": failing });
    expect(
      (await screen.findAllByRole("button", { name: "Erneut versuchen" })).length,
    ).toBeGreaterThan(0);
    expect(preview).toBeEmptyDOMElement();
  });

  it("selects a row in the URL instead of leaving the page", async () => {
    await open();
    await userEvent.click(await screen.findByRole("link", { name: "Backend Engineer (Java)" }));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?job=job-2", SELECT);
  });

  it("leaves a modified click (new tab) to the browser", async () => {
    await open();
    fireEvent.click(await screen.findByRole("link", { name: "Backend Engineer (Java)" }), {
      ctrlKey: true,
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows the job named in the URL", async () => {
    const preview = await open("job=job-2");
    expect(await previewTitle(preview, "Backend Engineer (Java)")).toBeInTheDocument();
  });

  it("falls back to the first row for a job that is gone", async () => {
    const preview = await open("job=gone");
    expect(await previewTitle(preview, "Senior Kotlin Engineer")).toBeInTheDocument();
  });

  it("says why a job below the threshold is there and offers to restore it", async () => {
    const preview = await open("tab=unter");
    expect(await previewTitle(preview, "Fullstack-Entwickler PHP")).toBeInTheDocument();
    expect(
      within(preview).getByText(
        "Automatisch aussortiert: Die Passung liegt unter deinem Schwellwert.",
      ),
    ).toBeInTheDocument();
    expect(
      within(preview).getByRole("button", { name: "Wiederherstellen: Fullstack-Entwickler PHP" }),
    ).toBeInTheDocument();
  });

  it("links only a real posting URL and survives a malformed date", async () => {
    const odd = buildListItem({ url: "javascript:alert(1)", created_at: "not a date" });
    const preview = await open("", server({ new: [odd] }));
    expect(await previewTitle(preview, "Senior Backend Engineer")).toBeInTheDocument();
    expect(within(preview).queryByRole("link", { name: /Stellenanzeige/ })).not.toBeInTheDocument();
    expect(within(preview).queryByText(/Gefunden am/)).not.toBeInTheDocument();
  });

  // jsdom applies no CSS: the pane container exists (CSS hides it below 1200 px, R16(1)), but empty.
  it("has no preview content below 1200 px; rows stay links to the job page", async () => {
    installFakeMatchMedia(false);
    const preview = await open();
    const row = await screen.findByRole("link", { name: "Senior Kotlin Engineer" });
    await userEvent.click(row);
    expect(row).toHaveAttribute("href", "/jobs/job-1");
    expect(row).not.toHaveAttribute("aria-current");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(preview).toBeEmptyDOMElement();
  });
});

describe("selection after a triage", () => {
  it("hands the selection to the next row after sorting out the shown one", async () => {
    const preview = await open("job=job-1");
    await userEvent.click(await paneButton(preview, "Aussortieren: Senior Kotlin Engineer"));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?job=job-2", SELECT);
  });

  it("keeps the selection when another row is sorted out", async () => {
    const data = server();
    await open("job=job-1", data, { "PATCH /jobs/job-2": archiveOn(data, "job-2") });
    await userEvent.click(await rowButton("Aussortieren: Backend Engineer (Java)"));
    await screen.findByText("Aussortiert: Personio.");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("keeps focus on the pane's action when sorting out from the pane by keyboard", async () => {
    const preview = await open("job=job-1");
    (await paneButton(preview, "Aussortieren: Senior Kotlin Engineer")).focus();
    await userEvent.keyboard("{Enter}");
    expect(await previewTitle(preview, "Backend Engineer (Java)")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Senior Kotlin Engineer" })).toBeNull(),
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      within(preview).getByRole("button", { name: "Aussortieren: Backend Engineer (Java)" }),
    );
  });

  it("selects the row again when its triage failed", async () => {
    const failed = () => jsonResponse(HTTP_SERVER_ERROR, { detail: "db" });
    const preview = await open("job=job-1", server(), { "PATCH /jobs/job-1": failed });
    await userEvent.click(await paneButton(preview, "Aussortieren: Senior Kotlin Engineer"));
    await screen.findByText(SERVER_ERROR_TEXT);
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?job=job-2", SELECT);
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?job=job-1", SELECT);
    expect(await previewTitle(preview, "Senior Kotlin Engineer")).toBeInTheDocument();
  });

  it("keeps a row the user picked before the triage failed (R16(2))", async () => {
    const held = deferred();
    const data = server({ new: [KOTLIN, JAVA, GO] });
    const preview = await open("job=job-1", data, { "PATCH /jobs/job-1": () => held.response });
    await userEvent.click(await paneButton(preview, "Aussortieren: Senior Kotlin Engineer"));
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?job=job-2", SELECT);
    await userEvent.click(screen.getByRole("link", { name: "Go Developer" }));
    held.release(jsonResponse(HTTP_SERVER_ERROR, { detail: "db" }));
    await screen.findByText(SERVER_ERROR_TEXT);
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?job=job-3", SELECT);
    expect(await previewTitle(preview, "Go Developer")).toBeInTheDocument();
  });

  it("leaves the setup view alone when a triage fails after it opened", async () => {
    const held = deferred();
    const preview = await open("job=job-1", server(), { "PATCH /jobs/job-1": () => held.response });
    await userEvent.click(await paneButton(preview, "Aussortieren: Senior Kotlin Engineer"));
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?job=job-2", SELECT);
    act(() => navigation.setParams(new URLSearchParams("view=setup")));
    await screen.findByRole("heading", { level: 1, name: "Willkommen, admin" });
    held.release(jsonResponse(HTTP_SERVER_ERROR, { detail: "db" }));
    await screen.findByText(SERVER_ERROR_TEXT);
    expect(navigation.replace).toHaveBeenLastCalledWith("/inbox?job=job-2", SELECT);
    expect(
      screen.getByRole("heading", { level: 1, name: "Willkommen, admin" }),
    ).toBeInTheDocument();
  });
});
