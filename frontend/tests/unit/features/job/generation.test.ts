import { describe, expect, it } from "vitest";
import {
  generationProblem,
  missingRequest,
  runGeneration,
} from "@/features/job/documents/useGeneration";
import { jsonResponse } from "../../support/fakeFetch";
import { stubRoutes } from "../../support/stubRoutes";

describe("missingRequest", () => {
  it("creates both when both are missing", () => {
    expect(missingRequest({ cv: false, cover_letter: false }, true)).toEqual({
      kind: "both",
      includeProfileDocuments: true,
    });
  });

  it("creates only the missing letter", () => {
    expect(missingRequest({ cv: true, cover_letter: false }, true)).toEqual({
      kind: "cover_letter",
      notes: "",
    });
  });

  it("creates only the missing CV with the attach choice", () => {
    expect(missingRequest({ cv: false, cover_letter: true }, false)).toEqual({
      kind: "cv",
      notes: "",
      includeProfileDocuments: false,
    });
  });

  it("asks for nothing when both documents exist", () => {
    expect(missingRequest({ cv: true, cover_letter: true }, true)).toBeNull();
  });
});

describe("runGeneration", () => {
  it("stores the CV note (decision D8) before asking for the CV only", async () => {
    const calls = stubRoutes({
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /jobs/job-1/generate-package": { status: "started" },
    });
    await runGeneration("job-1", {
      kind: "cv",
      notes: " Führung betonen ",
      includeProfileDocuments: false,
    });
    expect(calls.map((call) => [call.method, JSON.parse(call.body ?? "")])).toEqual([
      ["PATCH", { cv_draft: "Führung betonen" }],
      ["POST", { generate_cv: true, generate_letter: false, include_profile_documents: false }],
    ]);
  });

  it("asks for no CV when storing the note fails", async () => {
    const calls = stubRoutes({
      "PATCH /jobs/job-1": jsonResponse(500, { detail: "boom" }),
      "POST /jobs/job-1/generate-package": { status: "started" },
    });
    await expect(
      runGeneration("job-1", { kind: "cv", notes: "x", includeProfileDocuments: true }),
    ).rejects.toMatchObject({ code: "SERVER_ERROR" });
    expect(calls.map((call) => call.method)).toEqual(["PATCH"]);
  });

  it("writes the letter through /generate", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate": { status: "started" } });
    await runGeneration("job-1", { kind: "cover_letter", notes: "kürzer" });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({ improvement_notes: "kürzer" });
  });
});

describe("generationProblem", () => {
  it.each([
    ["Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen.", "profileIncomplete"],
    ["Profile incomplete. Please add your resume in the settings.", "profileIncomplete"],
    ["Traceback (most recent call last): boom", "unknown"],
  ])("%s -> %s", (error, problem) => {
    expect(generationProblem(error)).toBe(problem);
  });

  it("is null without an error", () => {
    expect(generationProblem(null)).toBeNull();
  });
});
