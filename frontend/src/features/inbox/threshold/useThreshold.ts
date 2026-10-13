"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { describeError } from "@/api/describeError";
import { INBOX_TRIAGE_KEY, INBOX_TRIAGE_SCOPE, queryKeys } from "@/api/queryKeys";
import { applyThreshold, matchThresholdQueryOptions, type ThresholdApplied } from "@/api/threshold";
import { clampThreshold, THRESHOLD_MIN } from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { invalidateAll, refreshListsIfLast } from "../useTriage";

export interface ThresholdState {
  saved: number | undefined;
  value: number;
  changed: boolean;
  /** The number field holds text that is no threshold; "Übernehmen" waits for a valid one (R17). */
  invalid: boolean;
  setValidity: (valid: boolean) => void;
  loadFailed: boolean;
  retryLoad: () => void;
  setDraft: (value: number) => void;
  reset: () => void;
  apply: () => void;
  applying: boolean;
}

interface ApplyInput {
  value: number;
  /** Saved before this request; the undo goes back to it (Review Focus 3). */
  previous: number;
}

type OnSaved = (result: ThresholdApplied, input: ApplyInput) => void;

/** The saved value and its preview change at once; the lists follow the last inbox triage. */
function refreshAfterThreshold(queryClient: QueryClient): void {
  invalidateAll(queryClient, [queryKeys.matchThreshold, queryKeys.thresholdPreviewRoot]);
  refreshListsIfLast(queryClient);
}

/**
 * Apply and undo run under the inbox triage key and scope: an apply clicked while a triage is in
 * flight is sent after it, and its list refetch waits for the last triage, so no row comes back.
 */
function useSaveThreshold(onSaved: OnSaved) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationKey: INBOX_TRIAGE_KEY,
    scope: INBOX_TRIAGE_SCOPE,
    mutationFn: ({ value }: ApplyInput) => applyThreshold(value),
    onSuccess: (result, input) => {
      queryClient.setQueryData(queryKeys.matchThreshold, result.match_threshold);
      onSaved(result, input);
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
    onSettled: () => refreshAfterThreshold(queryClient),
  });
}

/** Decision D5 / G11: the undo re-applies the value saved before, not an exact row reversal. */
function useUndoThreshold() {
  const toast = useToast();
  const { t } = useI18n();
  return useSaveThreshold((_result, { value }) =>
    toast.show({ message: t("threshold.undone", { value }) }),
  );
}

type SaveThreshold = ReturnType<typeof useSaveThreshold>;

function useApplyThreshold(onApplied: (value: number) => void, undo: SaveThreshold) {
  const toast = useToast();
  const { t } = useI18n();
  return useSaveThreshold((result, { value, previous }) => {
    onApplied(value);
    const { archived, restored } = result;
    const onAction = () => undo.mutate({ value: previous, previous: value });
    toast.show({
      message: t("threshold.applied", { value: result.match_threshold, archived, restored }),
      action: { label: t("phase.undo"), onAction },
    });
  });
}

/**
 * Busy while an apply or its undo runs: an apply started during an undo would capture the old
 * saved value as its "previous" before the undo landed.
 */
function useSaving(onApplied: (value: number) => void) {
  const undo = useUndoThreshold();
  const apply = useApplyThreshold(onApplied, undo);
  return { apply, busy: apply.isPending || undo.isPending };
}

function useDraft(saved: number | undefined) {
  const [draft, setDraft] = useState<number | null>(null);
  const [invalid, setInvalid] = useState(false);
  const value = draft ?? saved ?? THRESHOLD_MIN;
  return {
    value,
    invalid,
    changed: saved !== undefined && value !== saved,
    setDraft: (next: number) => setDraft(clampThreshold(next)),
    setValidity: (valid: boolean) => setInvalid(!valid),
    reset: () => setDraft(null),
    // A value moved on while the apply ran stays as the new draft.
    clearIfApplied: (applied: number) =>
      setDraft((current) => (current === applied ? null : current)),
  };
}

/** Decision D5: draft on screen, saved value from GET /settings, apply with the shown value. */
export function useThreshold(): ThresholdState {
  const saved = useQuery(matchThresholdQueryOptions());
  const { clearIfApplied, ...draft } = useDraft(saved.data);
  const saving = useSaving(clearIfApplied);
  const previous = saved.data ?? THRESHOLD_MIN;
  return {
    ...draft,
    saved: saved.data,
    loadFailed: saved.isError,
    retryLoad: () => void saved.refetch(),
    // Review Focus 2: the value on screen, even while its preview is still loading.
    apply: () => saving.apply.mutate({ value: draft.value, previous }),
    applying: saving.busy,
  };
}
