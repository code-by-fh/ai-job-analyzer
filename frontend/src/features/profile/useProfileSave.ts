"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { saveProfile, type Profile } from "@/api/profile";
import { queryKeys } from "@/api/queryKeys";
import { toProfileField, type ProfileField } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** Profile writes (section saves and the CV import) reach the server one after the other. */
export const PROFILE_SAVE_SCOPE = { id: "profile-save" };

/** The profile fields a 422 refused; the server's own text is never passed on. */
export function profileFieldErrors(error: unknown): ProfileField[] {
  return fieldErrorsFrom(error, toProfileField);
}

/**
 * The saved values (a section's save or the CV import's answer) go into the cache at once, so a
 * section is not reset to the old values by the query it reads until the refetch answers.
 */
export function storeSaved(queryClient: QueryClient, patch: Partial<Profile>): void {
  queryClient.setQueryData<Profile>(queryKeys.profile, (profile) =>
    profile ? { ...profile, ...patch } : profile,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
  // profile_complete (role and skills) drives the onboarding and the import hint.
  void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
  // A template preview is rendered with the stored profile.
  void queryClient.invalidateQueries({ queryKey: queryKeys.templatePreviewRoot });
}

/** True when the calling section shows this refusal on one of its own fields, so no toast repeats it. */
function shownOnField(error: unknown, shownFields: readonly ProfileField[]): boolean {
  return profileFieldErrors(error).some((field) => shownFields.includes(field));
}

/**
 * D3: one partial POST /settings per section (B2). `shownFields`: the fields the calling section
 * marks itself; any other refusal is one toast (spec 6).
 */
export function useProfileSave(shownFields: readonly ProfileField[]) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: PROFILE_SAVE_SCOPE,
    mutationFn: saveProfile,
    onSuccess: (_answer, patch) => {
      storeSaved(queryClient, patch);
      toast.show({ message: t("profile.saved"), tone: "success" });
    },
    onError: (error) => {
      if (!shownOnField(error, shownFields))
        toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}
