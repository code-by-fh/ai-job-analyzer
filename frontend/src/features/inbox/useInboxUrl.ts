"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { InboxTab } from "@/api/jobList";
import {
  inboxHref,
  inboxTabFromParam,
  JOB_QUERY_KEY,
  SETUP_VIEW,
  TAB_QUERY_KEY,
  VIEW_QUERY_KEY,
} from "@/domain/inbox";

export interface InboxUrl {
  tab: InboxTab;
  jobId: string | null;
  setup: boolean;
  setTab: (tab: InboxTab) => void;
  select: (jobId: string | null) => void;
}

/** Decision D1: tab, selected job and the setup view live in the query string (spec 2.3). */
export function useInboxUrl(): InboxUrl {
  const params = useSearchParams();
  const router = useRouter();
  const tab = inboxTabFromParam(params.get(TAB_QUERY_KEY));
  // replace, not push: Back leaves the inbox instead of walking through every selection.
  const go = (href: string) => router.replace(href, { scroll: false });
  return {
    tab,
    jobId: params.get(JOB_QUERY_KEY),
    setup: params.get(VIEW_QUERY_KEY) === SETUP_VIEW,
    setTab: (next) => go(inboxHref({ tab: next })),
    select: (jobId) => go(inboxHref({ tab, jobId })),
  };
}
