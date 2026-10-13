import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applicationsListPath,
  applicationsListQueryOptions,
  applicationsTotalQueryOptions,
  fetchJobPage,
} from "@/api/jobList";
import { CLOSED_APPLICATION_STATUSES, DUE_APPLICATION_STATUSES } from "@/api/jobListPaths";
import { activeApplicationCount, jobCountsQueryOptions } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { stubRoutes } from "../support/stubRoutes";

const ACTIVE = "statuses=DRAFTED%2CFAILED%2CGENERATING%2CAPPLIED%2CINTERVIEW%2COFFER";

describe("applications list paths", () => {
  it("asks for every active phase, newest first, in pages of 100", () => {
    expect(applicationsListPath({ group: "active", q: "" }, 0)).toBe(
      `/jobs?${ACTIVE}&is_archived=false&sort_by=date&limit=100&offset=0`,
    );
  });

  it("adds the search before the paging", () => {
    expect(applicationsListPath({ group: "active", q: "Kotlin Dev" }, 100)).toBe(
      `/jobs?${ACTIVE}&is_archived=false&sort_by=date&q=Kotlin+Dev&limit=100&offset=100`,
    );
  });

  it("asks for closed applications, one row for the counter", () => {
    expect(applicationsListPath({ group: "closed", q: "" }, 0, 1)).toBe(
      "/jobs?statuses=ACCEPTED%2CREJECTED&is_archived=false&sort_by=date&limit=1&offset=0",
    );
  });

  it("exports the due and closed status lists for fixtures", () => {
    expect(DUE_APPLICATION_STATUSES).toEqual(["APPLIED", "INTERVIEW", "OFFER", "GENERATING"]);
    expect(CLOSED_APPLICATION_STATUSES).toEqual(["ACCEPTED", "REJECTED"]);
  });
});

describe("applications query options", () => {
  it("keys lists and totals under the jobs root by group and search", () => {
    const query = { group: "active", q: "kotlin" } as const;
    expect(applicationsListQueryOptions(query).queryKey).toEqual([
      "jobs",
      "applications",
      "active",
      "kotlin",
    ]);
    expect(applicationsTotalQueryOptions({ group: "closed", q: "" }).queryKey).toEqual(
      queryKeys.applicationsTotal("closed", ""),
    );
    expect(queryKeys.applicationsTotal("closed", "")[0]).toBe("jobs");
  });

  it("keeps the previous answer while a new search loads", () => {
    const options = applicationsListQueryOptions({ group: "active", q: "" });
    expect(options.placeholderData).toBe(keepPreviousData);
  });

  it("reads the closed total from one row", async () => {
    const calls = stubRoutes({
      "GET /jobs": { items: [{ id: "job-10", status: "REJECTED" }], total: 7 },
    });
    const total = new QueryClient().fetchQuery(
      applicationsTotalQueryOptions({ group: "closed", q: "" }),
    );
    await expect(total).resolves.toBe(7);
    expect(new URL(calls[0]!.url).searchParams.get("limit")).toBe("1");
  });
});

describe("list item fields for Bewerbungen", () => {
  it("reads the status change time and the letter-draft flag, defaulting the flag", async () => {
    stubRoutes({
      "GET /jobs": {
        items: [
          {
            id: "a",
            status: "APPLIED",
            status_changed_at: "2026-10-05T09:30:00+00:00",
            application_draft_present: true,
          },
          { id: "b", status: "DRAFTED" },
        ],
        total: 2,
      },
    });
    const page = await fetchJobPage(applicationsListPath({ group: "active", q: "" }, 0));
    expect(page.items[0]).toMatchObject({
      status_changed_at: "2026-10-05T09:30:00+00:00",
      application_draft_present: true,
    });
    expect(page.items[1]?.application_draft_present).toBe(false);
  });

  it("keeps the checklist the server sends, so the next step matches the job page", async () => {
    stubRoutes({
      "GET /jobs": { items: [{ id: "a", status: "DRAFTED", checklist: { sent: true } }], total: 1 },
    });
    const page = await fetchJobPage(applicationsListPath({ group: "active", q: "" }, 0));
    expect(page.items[0]?.checklist).toEqual({
      posting_opened: false,
      documents_checked: false,
      sent: true,
    });
  });

  it("reads an odd checklist as none instead of failing the page", async () => {
    stubRoutes({
      "GET /jobs": { items: [{ id: "a", status: "DRAFTED", checklist: "legacy" }], total: 1 },
    });
    const page = await fetchJobPage(applicationsListPath({ group: "active", q: "" }, 0));
    expect(page.items[0]?.checklist).toBeNull();
  });
});

describe("activeApplicationCount", () => {
  it("sums every active status, generating and failed included", () => {
    const counts = {
      status_counts: {
        OPEN: 3,
        DRAFTED: 2,
        FAILED: 1,
        GENERATING: 1,
        APPLIED: 2,
        INTERVIEW: 1,
        OFFER: 1,
        REJECTED: 4,
        ACCEPTED: 1,
        ARCHIVE: 9,
      },
    };
    expect(activeApplicationCount(counts)).toBe(8);
  });

  it("is zero without counts", () => {
    expect(activeApplicationCount(undefined)).toBe(0);
  });

  it("shares the nav's counts query", () => {
    expect(jobCountsQueryOptions().queryKey).toEqual(queryKeys.jobCounts);
  });
});
