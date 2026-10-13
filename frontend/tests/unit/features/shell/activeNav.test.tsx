import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { jobIdFromPath, navKeyForJob } from "@/features/shell/navigation";
import { useActiveNavKey } from "@/features/shell/useActiveNavKey";
import { buildJob } from "../../support/jobFactory";
import { createTestQueryClient } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ pathname: "/jobs/job-1" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("job navigation rules", () => {
  it("reads the job id from the path", () => {
    expect(jobIdFromPath("/jobs/job-1")).toBe("job-1");
    expect(jobIdFromPath("/jobs/job-1/")).toBe("job-1");
    expect(jobIdFromPath("/jobs")).toBeNull();
    expect(jobIdFromPath("/inbox")).toBeNull();
  });

  it("returns null for a malformed escape instead of throwing", () => {
    expect(jobIdFromPath("/jobs/%E0%A4%A")).toBeNull();
  });

  it.each([
    [{ status: "OPEN" }, "inbox"],
    [{ status: "DRAFTED", is_archived: true }, "inbox"],
    [{ status: "DRAFTED" }, "applications"],
    [{ status: "REJECTED" }, "applications"],
  ])("puts %o under %s", (job, key) => {
    expect(navKeyForJob(job)).toBe(key);
  });
});

describe("useActiveNavKey", () => {
  it("highlights Bewerbungen on an application's page", async () => {
    stubRoutes({ "GET /jobs/job-1": buildJob({ status: "APPLIED" }) });
    const { result } = renderHook(() => useActiveNavKey(true), { wrapper });
    await waitFor(() => expect(result.current).toBe("applications"));
  });

  it("uses the path elsewhere", () => {
    navigation.pathname = "/sources/3";
    const { result } = renderHook(() => useActiveNavKey(true), { wrapper });
    expect(result.current).toBe("sources");
    navigation.pathname = "/jobs/job-1";
  });
});
