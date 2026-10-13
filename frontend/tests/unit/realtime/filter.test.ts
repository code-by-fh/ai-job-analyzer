import { describe, expect, it } from "vitest";
import { parseRealtimeMessage, type RealtimeEvent } from "@/realtime/events";
import { acceptEvent, type FilterContext } from "@/realtime/filter";

const USER_ID = 7;
const OTHER_USER_ID = 8;
const contextKnowing = (...jobIds: string[]): FilterContext => ({
  userId: USER_ID,
  isKnownJob: (jobId) => jobIds.includes(jobId),
});

describe("parseRealtimeMessage", () => {
  it("parses a valid event and strips fields the UI does not use", () => {
    const raw = JSON.stringify({
      type: "new_job",
      user_id: USER_ID,
      crawl_job_id: "c1",
      job: { id: "j1", title: "Dev" },
    });
    expect(parseRealtimeMessage(raw)).toEqual({
      type: "new_job",
      user_id: USER_ID,
      crawl_job_id: "c1",
      job: { id: "j1" },
    });
  });

  it("parses template_ready with its template id", () => {
    const raw = JSON.stringify({ type: "template_ready", template_id: 3, user_id: USER_ID });
    expect(parseRealtimeMessage(raw)).toEqual({
      type: "template_ready",
      template_id: 3,
      user_id: USER_ID,
    });
  });

  it("parses job_analysis_finished and strips the other fields", () => {
    const raw = JSON.stringify({
      type: "job_analysis_finished",
      user_id: USER_ID,
      job_id: "c1",
      job_title: "Dev",
      jobs_saved: 3,
    });
    expect(parseRealtimeMessage(raw)).toEqual({
      type: "job_analysis_finished",
      user_id: USER_ID,
      job_id: "c1",
      jobs_saved: 3,
    });
  });

  it("drops frames that are not JSON", () => {
    expect(parseRealtimeMessage("ping")).toBeNull();
  });

  it("drops unknown event types", () => {
    expect(
      parseRealtimeMessage(
        JSON.stringify({ type: "job_archived_bulk", user_id: USER_ID, job_id: "c1" }),
      ),
    ).toBeNull();
  });

  it("drops a user event without a top-level user_id", () => {
    expect(
      parseRealtimeMessage(
        JSON.stringify({ type: "new_job", job: { id: "j1", user_id: USER_ID } }),
      ),
    ).toBeNull();
  });
});

describe("acceptEvent", () => {
  const newJob = (userId: number): RealtimeEvent => ({
    type: "new_job",
    user_id: userId,
    job: { id: "j1" },
  });

  it("accepts the current user's events", () => {
    expect(acceptEvent(newJob(USER_ID), contextKnowing())).toBe(true);
  });

  it("drops another user's events", () => {
    expect(acceptEvent(newJob(OTHER_USER_ID), contextKnowing())).toBe(false);
  });

  it("accepts the whitelisted global events", () => {
    expect(acceptEvent({ type: "ai_error" }, contextKnowing())).toBe(true);
  });

  it("drops updates for jobs this tab never loaded", () => {
    const update: RealtimeEvent = { type: "job_update", user_id: USER_ID, job_id: "j9" };
    expect(acceptEvent(update, contextKnowing("j1"))).toBe(false);
  });

  it("accepts updates for loaded jobs, including the nested id of job_updated", () => {
    const updated: RealtimeEvent = { type: "job_updated", user_id: USER_ID, job: { id: "j1" } };
    expect(acceptEvent(updated, contextKnowing("j1"))).toBe(true);
  });
});
