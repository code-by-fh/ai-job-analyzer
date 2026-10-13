import { describe, expect, it } from "vitest";
import {
  CONTACT_FIELD_MAX,
  MAX_SALARY,
  SALARY_NOTE_MAX,
  firstInvalidField,
  formFromJob,
  newContact,
  patchFromForm,
  validateDatesForm,
  type DatesForm,
} from "@/features/job/dates/datesForm";
import { buildJob } from "../../support/jobFactory";

const EMPTY: DatesForm = {
  followUp: "",
  interviewAt: "",
  interviewTime: "",
  contacts: [],
  recruiterName: "",
  recruiterRole: "",
  recruiterEmail: "",
  recruiterPhone: "",
  salaryMin: "",
  salaryMax: "",
  salaryNote: "",
};

describe("formFromJob", () => {
  it("reads the stored values", () => {
    const form = formFromJob(
      buildJob({
        next_follow_up_at: "2026-10-20T07:00:00Z",
        interview_at: "2026-10-25T07:00:00Z",
        contact_persons: [
          { name: "Anna Muster", role: "Teamlead", email: "anna@acme.de", phone: "" },
        ],
        recruiter_info: { name: "Ben", role: "", email: "ben@agentur.de", phone: "" },
        salary_benchmark: { min: 75000, max: 90000, note: "laut Kununu" },
      }),
    );
    expect(form).toMatchObject({
      followUp: "2026-10-20",
      interviewAt: "2026-10-25",
      recruiterName: "Ben",
      salaryMin: "75000",
      salaryMax: "90000",
      salaryNote: "laut Kununu",
    });
    expect(form.contacts).toHaveLength(1);
  });

  it("starts empty", () => {
    expect(formFromJob(buildJob())).toEqual(EMPTY);
  });
});

describe("validateDatesForm", () => {
  it("accepts an empty form", () => {
    expect(validateDatesForm(EMPTY)).toEqual({});
  });

  it("rejects a minimum above the maximum", () => {
    expect(validateDatesForm({ ...EMPTY, salaryMin: "90000", salaryMax: "80000" })).toEqual({
      salaryMax: "minAboveMax",
    });
  });

  it("rejects negative or broken amounts", () => {
    expect(validateDatesForm({ ...EMPTY, salaryMin: "-1", salaryMax: "8o" })).toEqual({
      salaryMin: "invalidAmount",
      salaryMax: "invalidAmount",
    });
  });

  it("rejects a mail address without @", () => {
    expect(
      validateDatesForm({
        ...EMPTY,
        contacts: [newContact({ name: "A", email: "anna" })],
        recruiterEmail: "x",
      }),
    ).toEqual({ "contact.0.email": "invalidEmail", recruiterEmail: "invalidEmail" });
  });

  it("rejects impossible dates", () => {
    expect(validateDatesForm({ ...EMPTY, followUp: "2026-02-30", interviewAt: "x" })).toEqual({
      followUp: "invalidDate",
      interviewAt: "invalidDate",
    });
  });
});

describe("patchFromForm", () => {
  it("sends nothing when nothing changed", () => {
    expect(patchFromForm(EMPTY, EMPTY)).toEqual({});
  });

  it("sends only the changed group, so other fields cannot be overwritten", () => {
    const patch = patchFromForm({ ...EMPTY, salaryMin: "75000" }, EMPTY);
    expect(patch).toEqual({ salary_benchmark: { min: 75000, max: null, note: "" } });
  });

  it("drops contact rows without a name", () => {
    const contacts = [newContact({ name: " ", role: "x" }), newContact({ name: "Anna" })];
    expect(patchFromForm({ ...EMPTY, contacts }, EMPTY)).toEqual({
      contact_persons: [{ name: "Anna", role: "", email: "", phone: "" }],
    });
  });

  it("sends recruiter data as one object", () => {
    expect(patchFromForm({ ...EMPTY, recruiterName: " Ben " }, EMPTY)).toEqual({
      recruiter_info: { name: "Ben", role: "", email: "", phone: "" },
    });
  });

  it("keeps the contact phone and the recruiter role on a round trip", () => {
    const initial = formFromJob(
      buildJob({
        contact_persons: [{ name: "Anna", role: "", email: "", phone: "+49 40 1" }],
        recruiter_info: { name: "Ben", role: "Agentur", email: "", phone: "" },
      }),
    );
    const contacts = [{ ...initial.contacts[0], role: "Teamlead" }];
    expect(patchFromForm({ ...initial, contacts, recruiterName: "Benno" }, initial)).toEqual({
      contact_persons: [{ name: "Anna", role: "Teamlead", email: "", phone: "+49 40 1" }],
      recruiter_info: { name: "Benno", role: "Agentur", email: "", phone: "" },
    });
  });

  it("sends a picked date as ISO time", () => {
    const patch = patchFromForm({ ...EMPTY, interviewAt: "2026-10-20" }, EMPTY);
    expect(patch.interview_at).toMatch(/^2026-10-20T/);
    expect(patch).not.toHaveProperty("next_follow_up_at");
  });

  it("sends null for a removed date", () => {
    const stored = { ...EMPTY, followUp: "2026-10-20" };
    expect(patchFromForm({ ...stored, followUp: "" }, stored)).toEqual({
      next_follow_up_at: null,
    });
  });
});

const LOCAL_TIME_ISO = new Date(2026, 9, 25, 14, 30).toISOString();

describe("interview time", () => {
  it("round-trips the stored time in the local zone", () => {
    const form = formFromJob(buildJob({ interview_at: LOCAL_TIME_ISO }));
    expect(form).toMatchObject({ interviewAt: "2026-10-25", interviewTime: "14:30" });
    expect(patchFromForm(form, form)).toEqual({});
  });

  it("sends a changed time alone as a changed interview date", () => {
    const initial = formFromJob(buildJob({ interview_at: LOCAL_TIME_ISO }));
    const patch = patchFromForm({ ...initial, interviewTime: "16:00" }, initial);
    expect(patch).toEqual({ interview_at: new Date(2026, 9, 25, 16, 0).toISOString() });
  });

  it("combines a picked date with the time", () => {
    const patch = patchFromForm(
      { ...EMPTY, interviewAt: "2026-10-20", interviewTime: "14:30" },
      EMPTY,
    );
    expect(patch).toEqual({ interview_at: new Date(2026, 9, 20, 14, 30).toISOString() });
  });

  it("falls back to 09:00 without a time", () => {
    const patch = patchFromForm({ ...EMPTY, interviewAt: "2026-10-20" }, EMPTY);
    expect(patch).toEqual({ interview_at: new Date(2026, 9, 20, 9, 0).toISOString() });
  });

  it("clears the time together with the date", () => {
    const initial = formFromJob(buildJob({ interview_at: LOCAL_TIME_ISO }));
    const patch = patchFromForm({ ...initial, interviewAt: "", interviewTime: "" }, initial);
    expect(patch).toEqual({ interview_at: null });
  });

  it("ignores a time without a date", () => {
    expect(patchFromForm({ ...EMPTY, interviewTime: "14:30" }, EMPTY)).toEqual({});
  });
});

describe("length and amount limits", () => {
  const tooLong = (limit: number) => "x".repeat(limit + 1);

  it("rejects over-long contact and recruiter fields", () => {
    const contacts = [
      newContact({ name: tooLong(CONTACT_FIELD_MAX), role: tooLong(CONTACT_FIELD_MAX) }),
    ];
    expect(
      validateDatesForm({ ...EMPTY, contacts, recruiterPhone: tooLong(CONTACT_FIELD_MAX) }),
    ).toEqual({
      "contact.0.name": "tooLong",
      "contact.0.role": "tooLong",
      recruiterPhone: "tooLong",
    });
  });

  it("rejects an over-long salary note", () => {
    expect(validateDatesForm({ ...EMPTY, salaryNote: tooLong(SALARY_NOTE_MAX) })).toEqual({
      salaryNote: "tooLong",
    });
  });

  it("rejects amounts above the limit, also absurdly long digit strings", () => {
    const huge = "9".repeat(400);
    expect(
      validateDatesForm({ ...EMPTY, salaryMin: String(MAX_SALARY + 1), salaryMax: huge }),
    ).toEqual({
      salaryMin: "amountTooLarge",
      salaryMax: "amountTooLarge",
    });
    expect(validateDatesForm({ ...EMPTY, salaryMax: String(MAX_SALARY) })).toEqual({});
  });
});

describe("firstInvalidField", () => {
  it("returns the first problem in page order", () => {
    const problems = validateDatesForm({
      ...EMPTY,
      interviewAt: "x",
      recruiterEmail: "x",
      salaryMin: "-1",
    });
    expect(firstInvalidField(problems)).toBe("interviewAt");
  });

  it("returns null without problems", () => {
    expect(firstInvalidField({})).toBeNull();
  });
});
