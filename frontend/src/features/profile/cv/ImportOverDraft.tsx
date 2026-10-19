"use client";

import { matchMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CvData, Profile } from "@/api/profile";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { useProfileAnnounce } from "../announcer";
import type { ListsReset } from "./CvForm";
import { CV_IMPORT_KEY, useImportSentHere } from "./useCvImport";

interface ImportOverDraft {
  /** The import landed while the form held edits typed during it; the edits are still shown. */
  shown: boolean;
  /** Drops the edits and shows the stored (imported) CV. */
  showImport: () => void;
}

interface ImportOverDraftOptions {
  form: SectionForm<CvData>;
  profile: Profile;
  lists: ListsReset;
}

/**
 * The import starts only on a clean form, but it runs for minutes and the form stays editable.
 * A clean form adopts the stored answer on its own (useSectionForm) and its editors close; edits
 * typed meanwhile are never overwritten: they stay, and the user chooses (Speichern keeps them,
 * the notice's button shows the import).
 */
export function useImportOverDraft({
  form,
  profile,
  lists,
}: ImportOverDraftOptions): ImportOverDraft {
  const { t } = useI18n();
  const announce = useProfileAnnounce();
  const [overDraft, setOverDraft] = useState(false);
  useImportLanded(profile, () => {
    if (!form.dirty) return lists.reset();
    setOverDraft(true);
    // Said once on the page region: the toast only says the import is done (constraint D13).
    announce(t("profile.cv.import.draftKept"));
  });
  // Saved or adopted: the form shows one state again, so there is nothing left to choose.
  if (overDraft && !form.dirty) setOverDraft(false);
  return {
    shown: overDraft,
    showImport: () => lists.reset(() => form.commit(profile.cv_data)),
  };
}

/**
 * Calls `onLanded` (with this render's values) when an import succeeds, also one started before
 * this section was mounted again: the mutation cache outlives the observer that started it. The
 * answer is already in the profile cache then (useCvImport's onSuccess runs before the event).
 * An import the server ran for a reloaded page lands when its run state ends without an error
 * (the end event refetches the profile).
 */
function useImportLanded(profile: Profile, onLanded: () => void): void {
  const queryClient = useQueryClient();
  const landed = useEffectEvent(onLanded);
  const sentHere = useImportSentHere();
  const wasRunning = useRef(profile.cv_import_running);
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        const success = event.type === "updated" && event.action.type === "success";
        if (success && matchMutation({ mutationKey: CV_IMPORT_KEY }, event.mutation)) landed();
      }),
    [queryClient],
  );
  useEffect(() => {
    const ended = wasRunning.current && !profile.cv_import_running;
    wasRunning.current = profile.cv_import_running;
    if (ended && !profile.cv_import_error && !sentHere) landed();
  }, [profile.cv_import_running, profile.cv_import_error, sentHere]);
}

/** Amber, not crimson: nothing failed, two versions wait for the user's choice. */
export function DraftKeptNotice({ onShowImport }: { onShowImport: () => void }) {
  const { t } = useI18n();
  return (
    <div className="cv-draft-kept">
      <Notice tone="warn">
        <p>{t("profile.cv.import.draftKept")}</p>
        <Button size="sm" onClick={onShowImport}>
          {t("profile.cv.import.showImported")}
        </Button>
      </Notice>
    </div>
  );
}
