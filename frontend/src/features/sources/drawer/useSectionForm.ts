"use client";

import { useState } from "react";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface SectionForm<T> {
  draft: T;
  set: (patch: Partial<T>) => void;
  dirty: boolean;
  /** The keys whose value differs from the last saved state; what a save sends. */
  changed: () => Partial<T>;
  /** After a save: the stored state becomes the baseline and the draft. */
  commit: (saved: T) => void;
  /**
   * A value the server stored on its own (a name suggestion): baseline and draft take it, other
   * edits stay drafts.
   */
  rebase: (stored: Partial<T>) => void;
}

interface FormState<T> {
  base: T;
  draft: T;
}

function changedKeys<T extends object>({ base, draft }: FormState<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => !same(value, base[key as keyof T])),
  ) as Partial<T>;
}

function rebased<T>(previous: FormState<T>, stored: Partial<T>): FormState<T> {
  return { base: { ...previous.base, ...stored }, draft: { ...previous.draft, ...stored } };
}

const asIs = <T>(value: T): unknown => value;

/**
 * D5: a section edits its own copy. A background refetch is adopted only while nothing is edited
 * (previous-value pattern, phase 4 R27), so a save elsewhere never wipes a draft.
 * `effect` maps a value to what a save would send, so edits a save ignores (fields hidden by a
 * switched-off schedule) are not reported as unsaved.
 */
export function useSectionForm<T extends object>(
  server: T,
  effect: (value: T) => unknown = asIs,
): SectionForm<T> {
  const [state, setState] = useState<FormState<T>>({ base: server, draft: server });
  const dirty = !same(effect(state.base), effect(state.draft));
  if (!dirty && !same(state.base, server)) setState({ base: server, draft: server });
  return {
    draft: state.draft,
    set: (patch) =>
      setState((previous) => ({ ...previous, draft: { ...previous.draft, ...patch } })),
    dirty,
    changed: () => changedKeys(state),
    commit: (saved) => setState({ base: saved, draft: saved }),
    rebase: (stored) => setState((previous) => rebased(previous, stored)),
  };
}
