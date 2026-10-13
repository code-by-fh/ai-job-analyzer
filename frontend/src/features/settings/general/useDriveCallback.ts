"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { driveCallbackOf, SETTINGS_HREF, type DriveCallback } from "@/domain/settings";

/**
 * D4: the OAuth callback's outcome, read once on mount; the parameters then leave the URL with
 * replace (not push), so neither a reload nor Back shows the notice again.
 */
export function useDriveCallback(): DriveCallback | null {
  const params = useSearchParams();
  const router = useRouter();
  const [outcome] = useState(() => driveCallbackOf(new URLSearchParams(params.toString())));
  // Once per outcome: the router object need not be stable across renders.
  const leaveCallbackUrl = useEffectEvent(() => router.replace(SETTINGS_HREF, { scroll: false }));
  useEffect(() => {
    if (outcome) leaveCallbackUrl();
  }, [outcome]);
  return outcome;
}
