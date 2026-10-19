import type { NotesSpec } from "../history/NotesEditor";

// Both outcome tabs write jobs.outcome_notes (one column, T14 brief); only the wording differs.
export const FIRST_DAY_NOTES: NotesSpec = {
  field: "outcome_notes",
  id: "outcome-notes",
  label: "firstDay.notesLabel",
  placeholder: "firstDay.notesPlaceholder",
};

export const MOVE_ON_NOTES: NotesSpec = {
  field: "outcome_notes",
  id: "outcome-notes",
  label: "moveOn.notesLabel",
  placeholder: "moveOn.notesPlaceholder",
};
