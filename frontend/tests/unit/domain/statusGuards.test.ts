import { describe, expect, it } from "vitest";
import { guardFor, type GuardInput } from "@/domain/statusGuards";

const READY = { cv: true, cover_letter: true };
const NONE = { cv: false, cover_letter: false };
const input = (status: string, documents = READY, pre?: string): GuardInput => ({
  status,
  pre_generation_status: pre ?? null,
  documents,
});

describe("guardFor", () => {
  it("moves one phase forward directly", () => {
    expect(guardFor(input("OPEN", NONE), "DRAFTED")).toEqual({ kind: "direct", to: "DRAFTED" });
    expect(guardFor(input("APPLIED"), "INTERVIEW")).toEqual({ kind: "direct", to: "INTERVIEW" });
  });

  it("asks before moving backwards", () => {
    expect(guardFor(input("INTERVIEW"), "DRAFTED")).toEqual({
      kind: "confirmBackward",
      to: "DRAFTED",
    });
  });

  it("asks before skipping phases and names them", () => {
    expect(guardFor(input("DRAFTED"), "INTERVIEW")).toEqual({
      kind: "confirmSkip",
      to: "INTERVIEW",
      skipped: ["APPLIED"],
    });
  });

  it("warns when applying without documents and names the missing ones", () => {
    expect(guardFor(input("DRAFTED", { cv: true, cover_letter: false }), "APPLIED")).toEqual({
      kind: "applyWithoutDocuments",
      to: "APPLIED",
      missing: ["cover_letter"],
      skipped: [],
    });
  });

  it("prefers the documents warning over the skip question", () => {
    expect(guardFor(input("OPEN", NONE), "OFFER")).toMatchObject({ kind: "applyWithoutDocuments" });
  });

  it("does not warn about documents once the application is out", () => {
    expect(guardFor(input("APPLIED", NONE), "INTERVIEW")).toEqual({
      kind: "direct",
      to: "INTERVIEW",
    });
  });

  it("asks for the outcome when closing, also from a closed state", () => {
    expect(guardFor(input("OFFER"), "CLOSED")).toEqual({ kind: "askOutcome" });
    expect(guardFor(input("REJECTED"), "CLOSED")).toEqual({ kind: "askOutcome" });
  });

  it("blocks the current phase", () => {
    expect(guardFor(input("APPLIED"), "APPLIED")).toEqual({ kind: "blocked", reason: "current" });
  });

  it("lets a failed generation be repaired to Vorgemerkt", () => {
    expect(guardFor(input("FAILED"), "DRAFTED")).toEqual({ kind: "direct", to: "DRAFTED" });
  });

  it("locks every change while documents are generated", () => {
    expect(guardFor(input("GENERATING"), "APPLIED")).toEqual({ kind: "blocked", reason: "locked" });
    expect(guardFor(input("GENERATING"), "CLOSED")).toEqual({ kind: "blocked", reason: "locked" });
  });

  it("treats a reopened closed job as a backward move", () => {
    expect(guardFor(input("ACCEPTED"), "OFFER")).toEqual({ kind: "confirmBackward", to: "OFFER" });
  });

  it("keeps the skipped phases when the documents warning replaces the skip question", () => {
    expect(guardFor(input("OPEN", NONE), "OFFER")).toEqual({
      kind: "applyWithoutDocuments",
      to: "OFFER",
      missing: ["cv", "cover_letter"],
      skipped: ["DRAFTED", "APPLIED", "INTERVIEW"],
    });
  });

  it("carries no skipped phases when applying directly from the draft", () => {
    expect(guardFor(input("DRAFTED", NONE), "APPLIED")).toMatchObject({
      kind: "applyWithoutDocuments",
      skipped: [],
    });
  });

  it("names every phase jumped over from OPEN", () => {
    expect(guardFor(input("OPEN"), "OFFER")).toEqual({
      kind: "confirmSkip",
      to: "OFFER",
      skipped: ["DRAFTED", "APPLIED", "INTERVIEW"],
    });
  });

  it("lets a legacy free-text status move like the first phase", () => {
    expect(guardFor(input("SOMETHING_LEGACY"), "DRAFTED")).toEqual({
      kind: "direct",
      to: "DRAFTED",
    });
  });

  it("warns about missing documents when a failed generation is moved to applied", () => {
    expect(guardFor(input("FAILED", NONE), "APPLIED")).toEqual({
      kind: "applyWithoutDocuments",
      to: "APPLIED",
      missing: ["cv", "cover_letter"],
      skipped: [],
    });
  });

  it("asks for the outcome when closing from the draft without documents", () => {
    expect(guardFor(input("DRAFTED", NONE), "CLOSED")).toEqual({ kind: "askOutcome" });
  });

  it("gives a dedup placeholder its own blocked reason", () => {
    expect(guardFor(input("SEEN"), "DRAFTED")).toEqual({ kind: "blocked", reason: "unavailable" });
  });
});
