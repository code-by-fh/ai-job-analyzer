import { describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, login } from "@/api/auth";
import { fetchCrawlJobs } from "@/api/crawl";
import { fetchJobCounts, openMatchCount } from "@/api/jobs";
import { countFailingPlatforms, fetchPlatforms } from "@/api/platforms";
import { fetchLanguagePreference, saveLanguagePreference } from "@/api/settings";
import {
  createFakeFetch,
  jsonResponse,
  type RecordedCall,
  type Responder,
} from "../support/fakeFetch";

function stubApi(responder: Responder): RecordedCall[] {
  const fake = createFakeFetch(responder);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

describe("auth", () => {
  it("posts credentials url-encoded and does not refresh on a wrong password", async () => {
    const calls = stubApi(() => jsonResponse(401, { detail: "Incorrect username or password" }));
    await expect(login({ username: "admin", password: "wrong" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(calls).toEqual([
      expect.objectContaining({
        url: "http://api.test/auth/login",
        method: "POST",
        body: "username=admin&password=wrong",
      }),
    ]);
  });

  it("reads the current user", async () => {
    stubApi(() => jsonResponse(200, { id: 1, username: "admin", is_admin: true }));
    await expect(fetchCurrentUser()).resolves.toEqual({ id: 1, username: "admin", is_admin: true });
  });
});

describe("settings", () => {
  it("returns a supported server language", async () => {
    stubApi(() => jsonResponse(200, { role: "Dev", language: "en" }));
    await expect(fetchLanguagePreference()).resolves.toBe("en");
  });

  it("returns null for an unsupported server language", async () => {
    stubApi(() => jsonResponse(200, { language: "fr" }));
    await expect(fetchLanguagePreference()).resolves.toBeNull();
  });

  it("saves the language as JSON", async () => {
    const calls = stubApi(() => jsonResponse(200, { status: "ok", language: "en" }));
    await saveLanguagePreference("en");
    expect(calls[0]).toMatchObject({
      url: "http://api.test/language-preference",
      method: "POST",
      body: '{"language":"en"}',
    });
  });
});

describe("jobs", () => {
  it("counts open matches for the inbox badge", async () => {
    stubApi(() =>
      jsonResponse(200, { status_counts: { OPEN: 3, DRAFTED: 1, ARCHIVE: 9 }, domain_counts: [] }),
    );
    expect(openMatchCount(await fetchJobCounts())).toBe(3);
  });

  it("treats missing counts as zero", () => {
    expect(openMatchCount(undefined)).toBe(0);
  });
});

describe("platforms", () => {
  it("counts platforms whose last run failed", async () => {
    stubApi(() =>
      jsonResponse(200, [
        {
          id: 1,
          name: "StepStone",
          url: "https://www.stepstone.de/jobs",
          last_run: { error: null },
        },
        {
          id: 2,
          name: "Indeed",
          url: "https://de.indeed.com/jobs",
          last_run: { error: "unreachable" },
        },
        { id: 3, name: "Neu", url: "https://jobs.example.com", last_run: null },
      ]),
    );
    expect(countFailingPlatforms(await fetchPlatforms())).toBe(1);
  });
});

describe("crawl", () => {
  it("fills missing progress numbers with zero", async () => {
    stubApi(() =>
      jsonResponse(200, {
        jobs: [{ job_id: "c1", platform: "https://a.example", status: "starting" }],
      }),
    );
    await expect(fetchCrawlJobs()).resolves.toEqual([
      {
        job_id: "c1",
        platform: "https://a.example",
        status: "starting",
        total: 0,
        scraping_completed: 0,
      },
    ]);
  });
});
