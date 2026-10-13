import { EMPTY_CHECKLIST, type JobChecklist } from "@/api/jobs";

/** Order of the apply checklist in the next-step card (prototype renderApplyChecklist). */
export const CHECKLIST_KEYS = ["posting_opened", "documents_checked", "sent"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export function checklistOf(value?: JobChecklist | null): JobChecklist {
  return { ...EMPTY_CHECKLIST, ...value };
}

/** Always returns all three keys: PATCH replaces the whole object, a missing key would reset to false. */
export function setChecklistItem(
  checklist: JobChecklist | null | undefined,
  key: ChecklistKey,
  done: boolean,
): JobChecklist {
  return { ...checklistOf(checklist), [key]: done };
}

export function checklistComplete(checklist?: JobChecklist | null): boolean {
  const full = checklistOf(checklist);
  return CHECKLIST_KEYS.every((key) => full[key]);
}
