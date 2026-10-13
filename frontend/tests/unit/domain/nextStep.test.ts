import { describe, expect, it } from "vitest";
import { isDue, isWarning, nextStep } from "@/domain/nextStep";
import { de } from "@/i18n/de";
import { buildJob } from "../support/jobFactory";

const NOW = new Date("2026-10-08T10:00:00Z");
const BERLIN = "Europe/Berlin";
const READY_DOCS = { cv_html_present: true, cover_letter_html_present: true };
const DONE = { posting_opened: true, documents_checked: true, sent: true };
const step = (overrides: Parameters<typeof buildJob>[0]) =>
  nextStep(buildJob(overrides), NOW, BERLIN);

describe("nextStep: Treffer", () => {
  it("asks to triage an open match", () => {
    expect(step({ status: "OPEN" })).toMatchObject({
      kind: "triage",
      label: "next.triage.title",
      action: { type: "shortlist" },
      due: null,
    });
  });

  it("offers restore for a sorted-out job", () => {
    expect(step({ status: "OPEN", is_archived: true })).toMatchObject({
      kind: "restore",
      action: { type: "restore" },
    });
  });

  it("treats an unknown legacy status like a match", () => {
    expect(step({ status: "SOMETHING_LEGACY" }).kind).toBe("triage");
  });

  it("treats a seen job like a match", () => {
    expect(step({ status: "SEEN" }).kind).toBe("triage");
  });
});

describe("nextStep: Vorgemerkt", () => {
  it("asks to create both documents while both are missing", () => {
    expect(step({ status: "DRAFTED" })).toMatchObject({
      kind: "createDocuments",
      action: { type: "generate" },
    });
  });

  it("asks for the letter only when the CV exists", () => {
    expect(step({ status: "DRAFTED", cv_html_present: true })).toMatchObject({
      kind: "createLetter",
      label: "next.createLetter.title",
      action: { type: "generate" },
    });
  });

  it("asks for the CV only when the letter exists", () => {
    expect(step({ status: "DRAFTED", cover_letter_html_present: true })).toMatchObject({
      kind: "createCv",
      label: "next.createCv.title",
      action: { type: "generate" },
    });
  });

  it("counts a letter draft without HTML as present", () => {
    expect(
      step({ status: "DRAFTED", cv_html_present: true, application_draft: "Sehr geehrte" }).kind,
    ).toBe("apply");
  });

  it("asks to apply with an incomplete checklist", () => {
    expect(step({ status: "DRAFTED", ...READY_DOCS })).toMatchObject({
      kind: "apply",
      action: { type: "apply" },
    });
  });

  it("asks to mark as applied once the checklist is complete", () => {
    expect(step({ status: "DRAFTED", ...READY_DOCS, checklist: DONE }).kind).toBe("markApplied");
  });

  it("shows a running generation", () => {
    expect(step({ status: "GENERATING" })).toMatchObject({
      kind: "generating",
      action: { type: "openTab", tab: "documents" },
    });
  });

  it("offers a retry after a failed generation", () => {
    expect(step({ status: "FAILED" })).toMatchObject({
      kind: "generationFailed",
      action: { type: "generate" },
    });
  });

  it("offers a retry of the missing letter after a failed generation", () => {
    expect(step({ status: "FAILED", cv_html_present: true })).toMatchObject({
      kind: "generationFailed",
      action: { type: "generate" },
    });
  });

  it("continues with applying when a failed regeneration kept both documents", () => {
    expect(step({ status: "FAILED", ...READY_DOCS })).toMatchObject({
      kind: "apply",
      action: { type: "apply" },
    });
  });

  it("asks to mark as applied after a failed regeneration with a complete checklist", () => {
    expect(step({ status: "FAILED", ...READY_DOCS, checklist: DONE }).kind).toBe("markApplied");
  });
});

describe("nextStep: Beworben", () => {
  it("waits for an answer without a follow-up date", () => {
    expect(step({ status: "APPLIED" })).toMatchObject({
      kind: "awaitReply",
      action: { type: "setStatus", to: "INTERVIEW" },
      due: null,
    });
  });

  it("waits while the follow-up date is more than 2 calendar days away", () => {
    const result = step({ status: "APPLIED", next_follow_up_at: "2026-10-11T07:00:00Z" });
    expect(result).toMatchObject({ kind: "awaitReply", dueSoon: false, overdue: false });
    expect(isDue(result)).toBe(false);
  });

  it("asks to follow up within 2 calendar days", () => {
    const result = step({ status: "APPLIED", next_follow_up_at: "2026-10-10T20:00:00Z" });
    expect(result).toMatchObject({ kind: "followUp", dueSoon: true, overdue: false });
    expect(isDue(result)).toBe(true);
  });

  it("asks to follow up when overdue", () => {
    expect(step({ status: "APPLIED", next_follow_up_at: "2026-10-01T07:00:00Z" })).toMatchObject({
      kind: "followUp",
      overdue: true,
      action: { type: "followUp" },
    });
  });

  it("counts a date later today as due, not overdue", () => {
    expect(step({ status: "APPLIED", next_follow_up_at: "2026-10-08T20:00:00Z" })).toMatchObject({
      kind: "followUp",
      dueSoon: true,
      overdue: false,
    });
  });

  it("regenerating for an applied job keeps the applied next step", () => {
    expect(step({ status: "GENERATING", pre_generation_status: "APPLIED" }).kind).toBe(
      "awaitReply",
    );
  });
});

describe("nextStep: Interview", () => {
  it("asks to prepare without a prep and flags a close interview date", () => {
    expect(step({ status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" })).toMatchObject({
      kind: "prepareInterview",
      action: { type: "generatePrep" },
      dueSoon: true,
    });
  });

  it("does not use a follow-up date that is not due as interview date", () => {
    expect(step({ status: "INTERVIEW", next_follow_up_at: "2026-10-20T08:00:00Z" })).toMatchObject({
      kind: "prepareInterview",
      due: null,
      dueSoon: false,
    });
  });

  it("does not flag an interview that is more than 2 days away", () => {
    expect(step({ status: "INTERVIEW", interview_at: "2026-10-20T08:00:00Z" })).toMatchObject({
      dueSoon: false,
      overdue: false,
    });
  });

  it("asks to follow up when no interview date is set and the follow-up is tomorrow", () => {
    const result = step({ status: "INTERVIEW", next_follow_up_at: "2026-10-09T08:00:00Z" });
    expect(result).toMatchObject({
      kind: "followUp",
      action: { type: "followUp" },
      dueSoon: true,
      dateField: "next_follow_up_at",
    });
    expect(result.due?.toISOString()).toBe("2026-10-09T08:00:00.000Z");
  });

  it("asks to follow up when the interview has passed and the follow-up is overdue", () => {
    expect(
      step({
        status: "INTERVIEW",
        interview_at: "2026-10-07T08:00:00Z",
        next_follow_up_at: "2026-10-06T08:00:00Z",
      }),
    ).toMatchObject({ kind: "followUp", overdue: true, dateField: "next_follow_up_at" });
  });

  it("keeps preparing for an interview in 5 days despite a follow-up tomorrow", () => {
    const result = step({
      status: "INTERVIEW",
      interview_at: "2026-10-13T08:00:00Z",
      next_follow_up_at: "2026-10-09T08:00:00Z",
    });
    expect(result).toMatchObject({ kind: "prepareInterview", dateField: "interview_at" });
    expect(result.due?.toISOString()).toBe("2026-10-13T08:00:00.000Z");
  });

  it("opens the prep once it exists", () => {
    expect(step({ status: "INTERVIEW", interview_prep_material: "{}" })).toMatchObject({
      kind: "interviewReady",
      action: { type: "openTab", tab: "interview" },
    });
  });
});

describe("nextStep: Angebot and closed", () => {
  it("asks for a decision and carries the deadline", () => {
    const result = step({ status: "OFFER", next_follow_up_at: "2026-10-20T16:00:00Z" });
    expect(result).toMatchObject({ kind: "decideOffer", action: { type: "decideOffer" } });
    expect(result.due?.toISOString()).toBe("2026-10-20T16:00:00.000Z");
  });

  it.each(["ACCEPTED", "REJECTED"])("has nothing left to do when %s", (status) => {
    expect(step({ status })).toMatchObject({ kind: "closed", action: { type: "none" } });
  });

  it("ignores an old follow-up date once closed", () => {
    expect(isDue(step({ status: "REJECTED", next_follow_up_at: "2026-10-01T07:00:00Z" }))).toBe(
      false,
    );
  });

  it("ignores the due date of an archived job", () => {
    expect(
      isDue(
        step({ status: "APPLIED", is_archived: true, next_follow_up_at: "2026-10-01T07:00:00Z" }),
      ),
    ).toBe(false);
  });
});

describe("nextStep: past interview", () => {
  const PAST = "2026-10-07T21:30:00Z";

  it("asks to record the outcome once the interview day has passed", () => {
    const result = step({ status: "INTERVIEW", interview_at: PAST });
    expect(result).toMatchObject({
      kind: "recordOutcome",
      label: "next.recordOutcome.title",
      action: { type: "changePhase" },
      overdue: true,
    });
    expect(isDue(result)).toBe(true);
  });

  it("prefers the outcome over an existing prep", () => {
    expect(
      step({ status: "INTERVIEW", interview_at: PAST, interview_prep_material: "{}" }).kind,
    ).toBe("recordOutcome");
  });

  it("stays preparation later on the interview day", () => {
    expect(step({ status: "INTERVIEW", interview_at: "2026-10-08T17:00:00Z" })).toMatchObject({
      kind: "prepareInterview",
      dueSoon: true,
      overdue: false,
    });
  });
});

describe("nextStep: boundaries and bad data", () => {
  it("reads 00:30 Berlin three calendar days ahead as not due", () => {
    const result = step({ status: "APPLIED", next_follow_up_at: "2026-10-10T22:30:00Z" });
    expect(result).toMatchObject({ kind: "awaitReply", dueSoon: false, overdue: false });
  });

  it("reads yesterday 23:30 Berlin as overdue", () => {
    expect(step({ status: "APPLIED", next_follow_up_at: "2026-10-07T21:30:00Z" })).toMatchObject({
      kind: "followUp",
      overdue: true,
    });
  });

  it("flags an overdue offer deadline", () => {
    expect(step({ status: "OFFER", next_follow_up_at: "2026-10-01T07:00:00Z" })).toMatchObject({
      kind: "decideOffer",
      overdue: true,
    });
  });

  it("keeps the offer step while regenerating an offer", () => {
    expect(step({ status: "GENERATING", pre_generation_status: "OFFER" }).kind).toBe("decideOffer");
  });

  it.each(["constructor", "toString"])("falls back to triage for status %s", (status) => {
    expect(step({ status }).kind).toBe("triage");
  });

  it("ignores an unparseable date instead of throwing", () => {
    expect(step({ status: "APPLIED", next_follow_up_at: "not a date" })).toMatchObject({
      kind: "awaitReply",
      due: null,
      overdue: false,
    });
  });
});

describe("next-step copy", () => {
  it.each([
    "triage",
    "restore",
    "generating",
    "generationFailed",
    "createDocuments",
    "createCv",
    "createLetter",
    "apply",
    "markApplied",
    "awaitReply",
    "followUp",
    "prepareInterview",
    "interviewReady",
    "recordOutcome",
    "decideOffer",
    "closed",
  ])("has a title and a text for %s", (kind) => {
    // The array form: a dotted string would be read as a property path.
    expect(de).toHaveProperty([`next.${kind}.title`]);
    expect(de).toHaveProperty([`next.${kind}.text`]);
  });
});

describe("nextStep: list rows", () => {
  it("knows a prepared interview from the list flag", () => {
    const row = { ...buildJob({ status: "INTERVIEW" }), interview_prep_present: true };
    expect(nextStep(row, NOW, BERLIN).kind).toBe("interviewReady");
  });
});

describe("isWarning", () => {
  it("warns for a due follow-up or answer deadline only", () => {
    const followUp = step({ status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00Z" });
    const offer = step({ status: "OFFER", next_follow_up_at: "2026-10-09T08:00:00Z" });
    const pastInterview = step({ status: "INTERVIEW", interview_at: "2026-10-01T08:00:00Z" });
    expect(isWarning(followUp)).toBe(true);
    expect(isWarning(offer)).toBe(true);
    expect(isWarning(pastInterview)).toBe(false);
  });

  it("does not warn when nothing is due", () => {
    expect(isWarning(step({ status: "APPLIED" }))).toBe(false);
  });
});
