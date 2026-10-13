"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { dueApplicationsQueryOptions, type InboxTab } from "@/api/jobList";
import { givenUp } from "@/api/queryState";
import { isListStalled } from "@/domain/inbox";
import { hasDueFailed } from "./dueStatus";
import { useInboxList } from "./useInboxLists";

/** The longest the list waits for the due card once the list itself has data. */
export const DUE_GATE_MAX_WAIT_MS = 1500;

export interface DueGate {
  /** False while the list area shows the loading skeleton instead of tabs and list. */
  open: boolean;
  /** The list request failed and is being retried (decision D10), for the skeleton's hint. */
  stalled: boolean;
}

/** After the maximum wait the gate gives up; the card then appears later (the rare slow path). */
function useMaxWaitPassed(listReady: boolean): boolean {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    if (!listReady) return undefined;
    const timer = setTimeout(() => setPassed(true), DUE_GATE_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [listReady]);
  return passed;
}

/**
 * The due card pushes tabs and list down when it appears, so both wait for it and show in one
 * paint. The wait is bounded: it ends when the due query settled, is failing (still retrying),
 * is paused offline, or the maximum wait has passed.
 */
export function useDueGate(tab: InboxTab): DueGate {
  const due = useQuery(dueApplicationsQueryOptions());
  const list = useInboxList(tab);
  const waitedLongEnough = useMaxWaitPassed(list.data !== undefined || list.isError);
  const dueSettled = !due.isPending || hasDueFailed(due);
  const stalled = isListStalled({
    hasData: list.data !== undefined,
    isError: list.isError,
    failureCount: list.failureCount,
  });
  return { open: dueSettled || givenUp(due) || waitedLongEnough, stalled };
}
