import { describe, expect, it } from "vitest";
import {
  changeJobStatus,
  fetchJob,
  fetchJobHistory,
  patchJob,
  reanalyzeJob,
  startInterviewPrep,
} from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { buildJob } from "../support/jobFactory";
import { stubRoutes } from "../support/stubRoutes";

describe("fetchJob", () => {
  it("reads the job detail", async () => {
    stubRoutes({ "GET /jobs/job-1": buildJob({ status: "DRAFTED" }) });
    await expect(fetchJob("job-1")).resolves.toMatchObject({ id: "job-1", status: "DRAFTED" });
  });

  it("encodes the id in the path", async () => {
    const calls = stubRoutes({ "GET /jobs/a%2Fb": buildJob({ id: "a/b" }) });
    await fetchJob("a/b");
    expect(calls[0].url).toBe("http://api.test/jobs/a%2Fb");
  });

  it("shows unexpected JSON columns as empty instead of failing", async () => {
    stubRoutes({
      "GET /jobs/job-1": { ...buildJob(), contact_persons: "Frau Muster", checklist: { x: 1 } },
    });
    await expect(fetchJob("job-1")).resolves.toMatchObject({
      contact_persons: null,
      checklist: { posting_opened: false, documents_checked: false, sent: false },
    });
  });

  it("fills the presence flags with false when they are missing", async () => {
    const legacy: Record<string, unknown> = { ...buildJob() };
    delete legacy.cv_html_present;
    delete legacy.cover_letter_html_present;
    stubRoutes({ "GET /jobs/job-1": legacy });
    await expect(fetchJob("job-1")).resolves.toMatchObject({
      cv_html_present: false,
      cover_letter_html_present: false,
    });
  });
});

describe("contacts and recruiter", () => {
  const ANNA = { name: "Anna", role: "Teamlead", email: "a@acme.de", phone: "+49 40 1" };
  const BEN = { name: "Ben", role: "Agentur", email: "b@agentur.de", phone: "+49 30 2" };

  it("keeps the contact phone and the recruiter role", async () => {
    stubRoutes({
      "GET /jobs/job-1": { ...buildJob(), contact_persons: [ANNA], recruiter_info: BEN },
    });
    const job = await fetchJob("job-1");
    expect(job.contact_persons).toEqual([ANNA]);
    expect(job.recruiter_info).toEqual(BEN);
  });

  it("reads null fields as empty text instead of dropping the whole object", async () => {
    const nulls = { role: null, email: null, phone: null };
    stubRoutes({
      "GET /jobs/job-1": {
        ...buildJob(),
        contact_persons: [{ name: "Anna", ...nulls }],
        recruiter_info: { name: "Ben", ...nulls },
      },
    });
    const job = await fetchJob("job-1");
    const empty = { role: "", email: "", phone: "" };
    expect(job.contact_persons).toEqual([{ name: "Anna", ...empty }]);
    expect(job.recruiter_info).toEqual({ name: "Ben", ...empty });
  });
});

describe("interview and follow-up dates", () => {
  it("reads interview_at and pre_generation_status", async () => {
    stubRoutes({
      "GET /jobs/job-1": buildJob({
        interview_at: "2026-10-20T09:00:00+00:00",
        pre_generation_status: "running",
      }),
    });
    await expect(fetchJob("job-1")).resolves.toMatchObject({
      interview_at: "2026-10-20T09:00:00+00:00",
      pre_generation_status: "running",
    });
  });

  it("sends an explicit null to clear a date", async () => {
    const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" } });
    await patchJob("job-1", { interview_at: null, next_follow_up_at: null });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      interview_at: null,
      next_follow_up_at: null,
    });
  });
});

describe("changeJobStatus", () => {
  it("posts the target and the note and returns the new detail", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/status": buildJob({ status: "APPLIED" }) });
    const job = await changeJobStatus("job-1", { to: "APPLIED", note: "Beworben am 05.10.2026" });
    expect(job.status).toBe("APPLIED");
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      to: "APPLIED",
      note: "Beworben am 05.10.2026",
    });
  });
});

describe("patchJob", () => {
  it("sends only the given fields", async () => {
    const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" } });
    await patchJob("job-1", { notes: "Rückruf Montag" });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: '{"notes":"Rückruf Montag"}' });
  });
});

describe("fetchJobHistory", () => {
  it("reads the status history", async () => {
    const entry = {
      id: 2,
      from_status: "DRAFTED",
      to_status: "APPLIED",
      changed_at: "2026-10-05T10:00:00Z",
      note: "Beworben am 05.10.2026",
    };
    stubRoutes({ "GET /jobs/job-1/history": [entry] });
    await expect(fetchJobHistory("job-1")).resolves.toEqual([entry]);
  });
});

describe("background starts", () => {
  it("starts a re-analysis", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/analyze": { status: "started" } });
    await reanalyzeJob("job-1");
    expect(calls[0].method).toBe("POST");
  });

  it("reports that an interview prep already exists", async () => {
    stubRoutes({
      "POST /jobs/job-1/interview-prep": { status: "exists", message: "", job_id: "job-1" },
    });
    await expect(startInterviewPrep("job-1", false)).resolves.toBe("exists");
  });

  it("uses the regenerate endpoint when asked to", async () => {
    const calls = stubRoutes({
      "POST /jobs/job-1/interview-prep/regenerate": {
        status: "queued",
        message: "",
        job_id: "job-1",
      },
    });
    await expect(startInterviewPrep("job-1", true)).resolves.toBe("queued");
    expect(calls[0].url).toContain("/interview-prep/regenerate");
  });
});

describe("queryKeys", () => {
  it("nests every job resource under the job key", () => {
    const prefix = queryKeys.job("job-1");
    expect(queryKeys.jobHistory("job-1").slice(0, 2)).toEqual(prefix);
    expect(queryKeys.jobDocuments("job-1").slice(0, 2)).toEqual(prefix);
    expect(queryKeys.jobDocumentHtml("job-1", "cv").slice(0, 2)).toEqual(prefix);
  });

  it("keeps file bytes outside the job key", () => {
    expect(queryKeys.jobFile("job-1", 4, "v1")[0]).not.toBe("job");
  });
});
