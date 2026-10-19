"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError } from "@/api/errors";
import { setupStatusQueryOptions } from "@/api/setup";
import { PROFILE_HREF } from "@/features/shell/navigation";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";

export const PROFILE_REQUIRED_ID = "sources-profile-required";
/** The server's fixed 409 detail for a setup or crawl start without a maintained profile. */
const PROFILE_REQUIRED_DETAIL = "profile_required";

/**
 * True once the setup status says the profile is not complete (the server's own rule). While the
 * status is unknown nothing is blocked: the server refuses with 409 either way.
 */
export function useProfileMissing(): boolean {
  const status = useQuery(setupStatusQueryOptions()).data;
  return status !== undefined && !status.profile_complete;
}

export function isProfileRequired(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.message === PROFILE_REQUIRED_DETAIL
  );
}

/** The visible reason beside the disabled "Quelle hinzufügen" and "Durchsuchen", with the way out. */
export function ProfileRequiredNotice() {
  const { t } = useI18n();
  if (!useProfileMissing()) return null;
  return (
    <div id={PROFILE_REQUIRED_ID} className="src-banner">
      <Notice tone="warn">
        {t("sources.profileRequired")}{" "}
        <Link className="link" href={PROFILE_HREF}>
          {t("action.openProfile")}
        </Link>
      </Notice>
    </div>
  );
}
