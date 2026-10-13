"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { ApiError, type ApiErrorCode } from "@/api/errors";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { patchPlatform, type Platform, type PlatformPatch } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { toSourceField, type SourceField } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

const NO_FIELD_CODES: readonly ApiErrorCode[] = [];

export function sectionFieldErrors(error: unknown): SourceField[] {
  return fieldErrorsFrom(error, toSourceField);
}

/** True when the section shows this error on a field itself, so no toast repeats it. */
function shownOnField(error: unknown, fieldCodes: readonly ApiErrorCode[]): boolean {
  if (sectionFieldErrors(error).length > 0) return true;
  return error instanceof ApiError && fieldCodes.includes(error.code);
}

/**
 * The stored source goes into the list at once, so a section that commits it is not reset to the
 * old values by the list it reads until the refetch answers.
 */
function storeSaved(queryClient: QueryClient, saved: Platform): void {
  queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
    list?.map((platform) => (platform.id === saved.id ? saved : platform)),
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.platforms });
}

/**
 * D5: one partial PATCH per section; sections of one source save one after the other (one scope).
 * `fieldCodes`: error codes the section maps onto a field itself (the Quelle section's 400).
 */
export function useSectionSave(
  platformId: number,
  fieldCodes: readonly ApiErrorCode[] = NO_FIELD_CODES,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: { id: `source-${platformId}` },
    mutationFn: (patch: PlatformPatch) => patchPlatform({ id: platformId, patch }),
    onSuccess: (saved) => {
      storeSaved(queryClient, saved);
      toast.show({ message: t("sources.saved"), tone: "success" });
    },
    // Field errors show on their fields; everything else is one toast (spec 6).
    onError: (error) => {
      if (!shownOnField(error, fieldCodes))
        toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}
