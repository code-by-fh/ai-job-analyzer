"use client";

import { useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { INBOX_PATH } from "@/domain/inbox";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";

/**
 * Success: every cached answer is marked stale without a refetch into the navigation (the full
 * load drops the cache anyway), and the unsaved-changes guard is released, because the data a
 * draft belonged to is gone; flushSync removes the beforeunload listener before assign. Used by the
 * factory reset (Konto) and the admin database wipe (Systemfehler).
 */
export function useLeaveForInbox() {
  const queryClient = useQueryClient();
  const { setDirty } = useUnsavedChanges();
  return () => {
    void queryClient.invalidateQueries({ refetchType: "none" });
    flushSync(() => setDirty(false));
    window.location.assign(INBOX_PATH);
  };
}
