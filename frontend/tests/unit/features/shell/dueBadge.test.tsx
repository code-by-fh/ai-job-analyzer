import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavBadge } from "@/features/shell/Sidebar";
import { useDueCount } from "@/features/shell/useDueCount";
import { buildListItem, pageOf } from "../../support/listItemFactory";
import { createTestQueryClient } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00+02:00");
const NO_COUNTS = { inbox: 0, sourceErrors: 0, applicationsDue: 0 };

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => vi.useRealTimers());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("useDueCount", () => {
  it("counts the due steps of the due list", async () => {
    stubRoutes({
      "GET /jobs": pageOf([
        buildListItem({ id: "a", status: "APPLIED", next_follow_up_at: "2026-10-06T07:00:00Z" }),
        buildListItem({ id: "b", status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" }),
        buildListItem({ id: "c", status: "APPLIED", next_follow_up_at: "2026-10-30T07:00:00Z" }),
      ]),
    });
    const { result } = renderHook(() => useDueCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("asks nothing while disabled", () => {
    const calls = stubRoutes({ "GET /jobs": pageOf([]) });
    const { result } = renderHook(() => useDueCount(false), { wrapper });
    expect([result.current, calls.length]).toEqual([null, 0]);
  });
});

describe("NavBadge for Bewerbungen", () => {
  it("shows the due count with a sentence for screen readers", () => {
    render(<NavBadge itemKey="applications" counts={{ ...NO_COUNTS, applicationsDue: 2 }} />);
    expect(screen.getByText("2 fällig")).toHaveClass("sr-only");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("is a neutral pill, vermilion stays for new matches", () => {
    const { container } = render(
      <NavBadge itemKey="applications" counts={{ ...NO_COUNTS, applicationsDue: 2 }} />,
    );
    expect(container.querySelector(".count-badge")).toHaveClass("count-badge-neutral");
  });

  it("shows nothing when nothing is due", () => {
    const { container } = render(<NavBadge itemKey="applications" counts={NO_COUNTS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
