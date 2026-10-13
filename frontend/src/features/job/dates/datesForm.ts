import type { JobDetail, JobPatch } from "@/api/jobs";
import { fromDateInputValue, parseApiDate, toDateInputValue } from "@/domain/calendar";

// Mirrors the server bounds on PATCH /jobs/{id}; keep identical.
export const MAX_CONTACTS = 20;
export const CONTACT_FIELD_MAX = 200;
export const SALARY_NOTE_MAX = 500;
// Keeps typed digits far from Infinity, which JSON would turn into null.
export const MAX_SALARY = 10_000_000;
export const MAX_SALARY_DIGITS = String(MAX_SALARY).length;

const DEFAULT_HOUR = 9;
const TIME_INPUT = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WHOLE_AMOUNT = /^\d+$/;
// Deliberately loose: the address is only shown and used as a mailto link.
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export interface ContactRow {
  /** Stable React key; never sent to the server. */
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface DatesForm {
  followUp: string;
  interviewAt: string;
  /** HH:mm; empty means the 09:00 default. */
  interviewTime: string;
  contacts: ContactRow[];
  recruiterName: string;
  /** Not editable here; carried so a save keeps the stored value. */
  recruiterRole: string;
  recruiterEmail: string;
  recruiterPhone: string;
  salaryMin: string;
  salaryMax: string;
  salaryNote: string;
}

const CONTACT_KEYS = ["name", "role", "email", "phone"] as const;
type ContactKey = (typeof CONTACT_KEYS)[number];
export type DatesField =
  | "followUp"
  | "interviewAt"
  | "interviewTime"
  | "recruiterName"
  | "recruiterEmail"
  | "recruiterPhone"
  | "salaryMin"
  | "salaryMax"
  | "salaryNote"
  | `contact.${number}.${ContactKey}`;
export type DatesProblem =
  | "invalidDate"
  | "invalidTime"
  | "invalidEmail"
  | "invalidAmount"
  | "amountTooLarge"
  | "minAboveMax"
  | "tooLong"
  | "rejected";
export type DatesProblems = Partial<Record<DatesField, DatesProblem>>;

let contactCounter = 0;

export function newContact(values: Partial<Omit<ContactRow, "id">> = {}): ContactRow {
  contactCounter += 1;
  return {
    id: `contact-row-${contactCounter}`,
    name: "",
    role: "",
    email: "",
    phone: "",
    ...values,
  };
}

const amountText = (value?: number | null) =>
  value === null || value === undefined ? "" : String(value);

function validDate(iso?: string | null): Date | null {
  const date = iso ? parseApiDate(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

const dayText = (iso?: string | null) => {
  const date = validDate(iso);
  return date ? toDateInputValue(date) : "";
};

const pad = (value: number) => String(value).padStart(2, "0");

function timeText(iso?: string | null): string {
  const date = validDate(iso);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

/** True when a stored interview time differs from the 09:00 a day-only entry gets. */
export function hasCustomTime(iso: string): boolean {
  const time = timeText(iso);
  return time !== "" && time !== `${pad(DEFAULT_HOUR)}:00`;
}

export function formFromJob(job: JobDetail): DatesForm {
  return {
    followUp: dayText(job.next_follow_up_at),
    interviewAt: dayText(job.interview_at),
    interviewTime: timeText(job.interview_at),
    contacts: (job.contact_persons ?? []).map((contact) => newContact(contact)),
    recruiterName: job.recruiter_info?.name ?? "",
    recruiterRole: job.recruiter_info?.role ?? "",
    recruiterEmail: job.recruiter_info?.email ?? "",
    recruiterPhone: job.recruiter_info?.phone ?? "",
    salaryMin: amountText(job.salary_benchmark?.min),
    salaryMax: amountText(job.salary_benchmark?.max),
    salaryNote: job.salary_benchmark?.note ?? "",
  };
}

const badEmail = (value: string) => value.trim() !== "" && !EMAIL.test(value.trim());
const badAmount = (value: string) => value.trim() !== "" && !WHOLE_AMOUNT.test(value.trim());
const tooLarge = (value: string) => Number(value.trim()) > MAX_SALARY;
const tooLong = (value: string, max: number) => value.trim().length > max;
const badDate = (value: string) => value !== "" && fromDateInputValue(value) === null;
const badTime = (value: string) => value !== "" && !TIME_INPUT.test(value);

function minAboveMax(form: DatesForm): boolean {
  return (
    form.salaryMin !== "" &&
    form.salaryMax !== "" &&
    Number(form.salaryMin) > Number(form.salaryMax)
  );
}

function dateProblems(form: DatesForm): DatesProblems {
  const problems: DatesProblems = {};
  if (badDate(form.followUp)) problems.followUp = "invalidDate";
  if (badDate(form.interviewAt)) problems.interviewAt = "invalidDate";
  if (badTime(form.interviewTime)) problems.interviewTime = "invalidTime";
  return problems;
}

function contactProblems(form: DatesForm): DatesProblems {
  const problems: DatesProblems = {};
  form.contacts.forEach((contact, index) => {
    for (const key of CONTACT_KEYS) {
      if (tooLong(contact[key], CONTACT_FIELD_MAX)) problems[`contact.${index}.${key}`] = "tooLong";
    }
    if (!problems[`contact.${index}.email`] && badEmail(contact.email))
      problems[`contact.${index}.email`] = "invalidEmail";
  });
  return problems;
}

function recruiterProblems(form: DatesForm): DatesProblems {
  const problems: DatesProblems = {};
  if (tooLong(form.recruiterName, CONTACT_FIELD_MAX)) problems.recruiterName = "tooLong";
  if (tooLong(form.recruiterEmail, CONTACT_FIELD_MAX)) problems.recruiterEmail = "tooLong";
  else if (badEmail(form.recruiterEmail)) problems.recruiterEmail = "invalidEmail";
  if (tooLong(form.recruiterPhone, CONTACT_FIELD_MAX)) problems.recruiterPhone = "tooLong";
  return problems;
}

function amountProblem(value: string): DatesProblem | null {
  if (badAmount(value)) return "invalidAmount";
  return tooLarge(value) ? "amountTooLarge" : null;
}

function salaryProblems(form: DatesForm): DatesProblems {
  const problems: DatesProblems = {};
  const min = amountProblem(form.salaryMin);
  const max = amountProblem(form.salaryMax);
  if (min) problems.salaryMin = min;
  if (max) problems.salaryMax = max;
  if (!min && !max && minAboveMax(form)) problems.salaryMax = "minAboveMax";
  if (tooLong(form.salaryNote, SALARY_NOTE_MAX)) problems.salaryNote = "tooLong";
  return problems;
}

/** Problems in page order, so the first key is the first invalid control on screen. */
export function validateDatesForm(form: DatesForm): DatesProblems {
  return {
    ...dateProblems(form),
    ...contactProblems(form),
    ...recruiterProblems(form),
    ...salaryProblems(form),
  };
}

export function firstInvalidField(problems: DatesProblems): DatesField | null {
  return (Object.keys(problems)[0] as DatesField | undefined) ?? null;
}

const FIELD_ELEMENT_ID: Readonly<Record<string, string>> = {
  followUp: "dates-follow-up",
  interviewAt: "dates-interview",
  interviewTime: "dates-interview-time",
  recruiterName: "recruiter-name",
  recruiterEmail: "recruiter-email",
  recruiterPhone: "recruiter-phone",
  salaryMin: "salary-min",
  salaryMax: "salary-max",
  salaryNote: "salary-note",
};

// PATCH /jobs/{id} field (422 location without "body") -> form field.
const SERVER_FIELDS: Readonly<Record<string, DatesField>> = {
  next_follow_up_at: "followUp",
  interview_at: "interviewAt",
  "recruiter_info.name": "recruiterName",
  "recruiter_info.email": "recruiterEmail",
  "recruiter_info.phone": "recruiterPhone",
  "salary_benchmark.min": "salaryMin",
  "salary_benchmark.max": "salaryMax",
  "salary_benchmark.note": "salaryNote",
  // A rule over the whole range (min <= max) is reported on the object; the maximum shows it.
  salary_benchmark: "salaryMax",
};
const SERVER_CONTACT_FIELD = /^contact_persons\.(\d+)\.(name|role|email|phone)$/;

/** The form field behind a server-rejected field, or null when the form has none. */
export function datesFieldOf(serverField: string): DatesField | null {
  const contact = SERVER_CONTACT_FIELD.exec(serverField);
  if (contact) return `contact.${Number(contact[1])}.${contact[2] as ContactKey}`;
  return Object.hasOwn(SERVER_FIELDS, serverField) ? SERVER_FIELDS[serverField] : null;
}

/** DOM id of the control behind a field, for focusing it. */
export function fieldElementId(field: DatesField): string {
  const contact = /^contact\.(\d+)\.(\w+)$/.exec(field);
  return contact ? `contact-${contact[1]}-${contact[2]}` : (FIELD_ELEMENT_ID[field] ?? field);
}

const amountOf = (value: string): number | null =>
  value.trim() === "" ? null : Number(value.trim());

const contactValues = ({ name, role, email, phone }: ContactRow) => ({ name, role, email, phone });
const sameContacts = (a: ContactRow[], b: ContactRow[]) =>
  JSON.stringify(a.map(contactValues)) === JSON.stringify(b.map(contactValues));

/** ISO time for a picked day (09:00 unless a time is given), null for a removed one. */
function dateValue(day: string, time = ""): string | null {
  const date = day === "" ? null : fromDateInputValue(day);
  if (!date) return null;
  const match = TIME_INPUT.exec(time);
  if (match) date.setHours(Number(match[1]), Number(match[2]));
  return date.toISOString();
}

function datePatch(form: DatesForm, initial: DatesForm): JobPatch {
  const patch: JobPatch = {};
  if (form.followUp !== initial.followUp) patch.next_follow_up_at = dateValue(form.followUp);
  const interview = dateValue(form.interviewAt, form.interviewTime);
  // Compare the effective timestamps: a time without a date is nothing, and "" equals 09:00.
  if (interview !== dateValue(initial.interviewAt, initial.interviewTime))
    patch.interview_at = interview;
  return patch;
}

function recruiterPatch(form: DatesForm, initial: DatesForm): JobPatch {
  const keys = ["recruiterName", "recruiterEmail", "recruiterPhone"] as const;
  if (keys.every((key) => form[key] === initial[key])) return {};
  return {
    recruiter_info: {
      name: form.recruiterName.trim(),
      role: form.recruiterRole,
      email: form.recruiterEmail.trim(),
      phone: form.recruiterPhone.trim(),
    },
  };
}

function salaryPatch(form: DatesForm, initial: DatesForm): JobPatch {
  const keys = ["salaryMin", "salaryMax", "salaryNote"] as const;
  if (keys.every((key) => form[key] === initial[key])) return {};
  const note = form.salaryNote.trim();
  return {
    salary_benchmark: { min: amountOf(form.salaryMin), max: amountOf(form.salaryMax), note },
  };
}

function contactsPatch(form: DatesForm, initial: DatesForm): JobPatch {
  if (sameContacts(form.contacts, initial.contacts)) return {};
  const contacts = form.contacts
    .map((contact) => ({
      name: contact.name.trim(),
      role: contact.role.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
    }))
    .filter((contact) => contact.name !== "");
  return { contact_persons: contacts };
}

/**
 * Only fields the user changed are sent, so a concurrent edit of another field (other tab, other
 * device) is not overwritten with this form's stale copy.
 */
export function patchFromForm(form: DatesForm, initial: DatesForm): JobPatch {
  return {
    ...datePatch(form, initial),
    ...contactsPatch(form, initial),
    ...recruiterPatch(form, initial),
    ...salaryPatch(form, initial),
  };
}
