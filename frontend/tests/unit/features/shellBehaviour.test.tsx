import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCrawlJobs } from "@/api/crawl";
import { ActivityButton } from "@/features/shell/ActivityButton";
import { BottomBar } from "@/features/shell/BottomBar";
import { GlobalSearch } from "@/features/shell/GlobalSearch";
import { MoreSheet } from "@/features/shell/MoreSheet";
import { RealtimeProvider } from "@/features/shell/RealtimeProvider";
import { NavBadge, Sidebar } from "@/features/shell/Sidebar";
import { useNavCounts } from "@/features/shell/useNavCounts";
import { openRealtime } from "@/realtime/openRealtime";
import { createTestQueryClient, renderWithProviders } from "../support/render";

const navigation = vi.hoisted(() => ({ pathname: "/inbox" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/realtime/openRealtime", () => ({ openRealtime: vi.fn() }));
vi.mock("@/api/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/jobs")>();
  const fetchJobCounts = vi.fn(async () => ({ status_counts: { OPEN: 4, APPLIED: 2 } }));
  // jobCountsQueryOptions calls the module's own fetchJobCounts; the nav must see the mocked one.
  return {
    ...actual,
    fetchJobCounts,
    jobCountsQueryOptions: () => ({ ...actual.jobCountsQueryOptions(), queryFn: fetchJobCounts }),
  };
});
vi.mock("@/api/jobList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/jobList")>();
  // The nav asks for the due list on every page; nothing is due here. The internal call is not mocked.
  return {
    ...actual,
    dueApplicationsQueryOptions: () => ({
      ...actual.dueApplicationsQueryOptions(),
      queryFn: async () => ({ items: [], total: 0 }),
    }),
  };
});
vi.mock("@/api/crawl", () => ({ fetchCrawlJobs: vi.fn(async () => []) }));
vi.mock("@/api/platforms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/platforms")>()),
  fetchPlatforms: vi.fn(async () => [
    { id: 1, is_active: true, last_run: { error: "boom" } },
    { id: 2, is_active: true, last_run: { error: null } },
    { id: 3, is_active: true, last_run: null },
  ]),
  // The fixture above is not a full platform; the counting logic reads is_active and last_run.error.
}));

const USER = { id: 7, username: "admin", is_admin: true };

beforeEach(() => {
  navigation.pathname = "/inbox";
});

function QueryWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("useNavCounts", () => {
  it("derives the badge numbers from the queries", async () => {
    const { result } = renderHook(() => useNavCounts(true), { wrapper: QueryWrapper });
    await waitFor(() =>
      expect(result.current).toEqual({ inbox: 4, sourceErrors: 1, applicationsDue: 0 }),
    );
  });

  it("stays at zero while disabled", () => {
    const { result } = renderHook(() => useNavCounts(false), { wrapper: QueryWrapper });
    expect(result.current).toEqual({ inbox: 0, sourceErrors: 0, applicationsDue: 0 });
  });
});

describe("RealtimeProvider", () => {
  it("closes the connection on unmount", () => {
    const close = vi.fn();
    vi.mocked(openRealtime).mockReturnValue({ close } as unknown as ReturnType<
      typeof openRealtime
    >);
    const { unmount } = renderWithProviders(
      <RealtimeProvider userId={USER.id}>
        <p>content</p>
      </RealtimeProvider>,
    );
    expect(openRealtime).toHaveBeenCalledWith(USER.id, expect.anything());
    unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar", () => {
  it("marks only the active link with aria-current", () => {
    navigation.pathname = "/sources/3";
    renderWithProviders(<Sidebar user={USER} />);
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/sources");
  });

  it("marks the settings link on the settings page", () => {
    navigation.pathname = "/settings";
    renderWithProviders(<Sidebar user={USER} />);
    expect(screen.getByRole("link", { name: "Einstellungen" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("BottomBar", () => {
  const RUNNING_CRAWL = {
    job_id: "c1",
    platform: "https://www.stepstone.de/jobs",
    status: "crawling",
    total: 12,
    scraping_completed: 5,
  };

  it("shows failing sources on Quellen as an alert pill with the sentence for screen readers", async () => {
    renderWithProviders(<BottomBar signedIn />);
    const sources = await screen.findByRole("link", { name: /Quellen.*1 Fehler/ });
    const pill = sources.querySelector(".count-badge-danger");
    expect(pill?.querySelector("svg")).not.toBeNull();
    expect(pill?.querySelector(".sr-only")).toHaveTextContent("1 Fehler");
    expect(sources.querySelector(".count-plain")).toBeNull();
  });

  it("shows the inbox count on Eingang", async () => {
    renderWithProviders(<BottomBar signedIn />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Eingang/ })).toHaveTextContent("4 neue Treffer"),
    );
  });

  it("signals running tasks on Mehr", async () => {
    vi.mocked(fetchCrawlJobs).mockResolvedValueOnce([RUNNING_CRAWL]);
    renderWithProviders(<BottomBar signedIn />);
    expect(await screen.findByRole("button", { name: "Mehr 1 Aufgabe läuft" })).toBeInTheDocument();
  });

  it("shows no busy signal on Mehr while nothing runs", async () => {
    renderWithProviders(<BottomBar signedIn />);
    await waitFor(() => expect(fetchCrawlJobs).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Mehr" })).toBeInTheDocument();
  });
});

describe("ActivityButton", () => {
  it("announces that it opens a dialog", () => {
    renderWithProviders(<ActivityButton enabled={false} />);
    expect(screen.getByRole("button", { name: "Aktivität" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
  });
});

describe("NavBadge for failing sources", () => {
  it("pairs the sentence with an alert icon", () => {
    const { container } = render(
      <NavBadge itemKey="sources" counts={{ inbox: 0, sourceErrors: 2, applicationsDue: 0 }} />,
    );
    expect(screen.getByText("2 Fehler")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("MoreSheet", () => {
  function renderSheet() {
    return renderWithProviders(
      <>
        <MoreSheet open onClose={vi.fn()} signedIn />
        <GlobalSearch />
      </>,
    );
  }

  it("opens the search dialog from the Suche entry", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Suche" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument());
  });

  it("leaves for /login with a full navigation even when the logout call fails", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { queryClient } = renderSheet();
    const clear = vi.spyOn(queryClient, "clear");
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
    expect(clear).not.toHaveBeenCalled();
  });

  it("marks the active link with aria-current", () => {
    navigation.pathname = "/settings";
    renderSheet();
    expect(screen.getByRole("link", { name: "Einstellungen" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Profil" })).not.toHaveAttribute("aria-current");
  });
});

describe("slash shortcut guards", () => {
  function press(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
      ...init,
    });
    act(() => void document.body.dispatchEvent(event));
  }

  it.each([
    ["a repeated key", { repeat: true }],
    ["an IME composition", { isComposing: true }],
  ])("ignores %s", (_name, init) => {
    render(<GlobalSearch />);
    press(init);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores events another handler already consumed", () => {
    render(<GlobalSearch />);
    const consume = (event: Event) => event.preventDefault();
    document.body.addEventListener("keydown", consume, { once: true });
    press({});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
