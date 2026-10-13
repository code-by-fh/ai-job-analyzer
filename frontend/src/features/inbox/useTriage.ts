"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { describeError } from "@/api/describeError";
import type { InboxTab, JobListItem, JobPage } from "@/api/jobList";
import { changeJobStatus, deleteJob, patchJob, type DeleteOutcome } from "@/api/jobs";
import { INBOX_TRIAGE_KEY, INBOX_TRIAGE_SCOPE, queryKeys } from "@/api/queryKeys";
import { positionOf, withItemAt, withoutItem, type RowPosition } from "@/domain/inbox";
import { jobRoute } from "@/features/shell/routes";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

type ListData = InfiniteData<JobPage, number>;

/**
 * Review focus 1: every triage of the inbox, undo included, shares one key and one scope. The scope
 * runs the requests one after the other; the key lets the settle step refetch the lists only when
 * the last of them settled, so a stale list never brings back a row whose triage is still running.
 */
const TRIAGE_KEY = INBOX_TRIAGE_KEY;
const TRIAGE_SCOPE = INBOX_TRIAGE_SCOPE;

/** What one optimistic triage took out of which list, so exactly that row can go back. */
interface Removal {
  item: JobListItem;
  tab: InboxTab;
  at: RowPosition | null;
}

interface TriageSpec {
  run: (id: string) => Promise<unknown>;
  undo: (id: string) => Promise<unknown>;
  done: MessageKey;
}

const SHORTLIST: TriageSpec = {
  run: (id) => changeJobStatus(id, { to: "DRAFTED" }),
  undo: (id) => changeJobStatus(id, { to: "OPEN" }),
  done: "inbox.shortlisted",
};
const DISMISS: TriageSpec = {
  run: (id) => patchJob(id, { is_archived: true }),
  undo: (id) => patchJob(id, { is_archived: false }),
  done: "next.dismissed",
};

export interface TriageEvents {
  /** Before a row leaves the list, so focus and selection can move on first. */
  onRemoved: (id: string) => void;
  /** An optimistic triage failed after onRemoved: the row is back and may be selected again (M4). */
  onTriageFailed: (id: string) => void;
}

const DELETE_MESSAGE: Readonly<Record<DeleteOutcome, MessageKey>> = {
  deleted: "inbox.deleted",
  // The server archives a job that was not archived yet instead of deleting it.
  archived: "inbox.archived",
};

export interface Triage {
  shortlist: (item: JobListItem) => void;
  dismiss: (item: JobListItem) => void;
  restore: (item: JobListItem) => void;
  /** Resolves true when the server deleted the job, or archived it while it was still active. */
  remove: (item: JobListItem) => Promise<boolean>;
  /** The row whose restore or delete is running (those are not optimistic). */
  busyId: string | null;
}

const companyOf = (item: JobListItem, t: Translate) => item.company ?? t("job.unknownCompany");

export function invalidateAll(queryClient: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/**
 * Refetches the inbox lists only when the settling mutation under the triage key is the last one,
 * so a list never answers before a triage still in flight reached the server.
 */
export function refreshListsIfLast(queryClient: QueryClient): void {
  // isMutating still counts the settling mutation, so 1 means it is the last one.
  if (queryClient.isMutating({ mutationKey: TRIAGE_KEY }) !== 1) return;
  invalidateAll(queryClient, [
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.thresholdDistribution,
    // A restore or dismiss changes what the threshold preview would archive or bring back.
    queryKeys.thresholdPreviewRoot,
  ]);
}

/** The job itself is not a list, so it refreshes at once; the lists only after the last triage. */
function settle(queryClient: QueryClient, id: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.job(id) });
  refreshListsIfLast(queryClient);
}

function updateList(
  queryClient: QueryClient,
  tab: InboxTab,
  update: (pages: readonly JobPage[]) => JobPage[],
): void {
  queryClient.setQueryData<ListData>(queryKeys.inboxList(tab), (data) =>
    data ? { ...data, pages: update(data.pages) } : data,
  );
}

/** Spec 6: optimistic only where undo exists. */
async function takeOut(queryClient: QueryClient, tab: InboxTab, item: JobListItem) {
  const queryKey = queryKeys.inboxList(tab);
  // A list request still running would answer with the row in it.
  await queryClient.cancelQueries({ queryKey });
  const pages = queryClient.getQueryData<ListData>(queryKey)?.pages ?? [];
  const removal: Removal = { item, tab, at: positionOf(pages, item.id) };
  updateList(queryClient, tab, (current) => withoutItem(current, item.id));
  return removal;
}

/**
 * Puts back only this triage's row, never a whole snapshot: rows other triages removed meanwhile
 * stay out. Without a known place the refetch after the last triage brings the row back.
 */
function putBack(queryClient: QueryClient, removal: Removal): void {
  const { item, tab, at } = removal;
  if (at) updateList(queryClient, tab, (pages) => withItemAt(pages, item, at));
}

function useErrorToast(): (error: unknown) => void {
  const toast = useToast();
  const { t } = useI18n();
  return (error) => toast.show({ tone: "error", message: describeError(error, t) });
}

/** Undo runs under the triage key and scope too, so it queues behind a running triage. */
function useUndo(spec: TriageSpec) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const reportError = useErrorToast();
  return useMutation<unknown, unknown, Removal>({
    mutationKey: TRIAGE_KEY,
    scope: TRIAGE_SCOPE,
    mutationFn: (removal) => spec.undo(removal.item.id),
    onSuccess: (_result, removal) => {
      putBack(queryClient, removal);
      toast.show({ message: t("inbox.undone", { company: companyOf(removal.item, t) }) });
    },
    onError: reportError,
    onSettled: (_result, _error, removal) => settle(queryClient, removal.item.id),
  });
}

function useUndoToast(spec: TriageSpec): (removal: Removal) => void {
  const toast = useToast();
  const { t } = useI18n();
  const undo = useUndo(spec);
  return (removal) => {
    const action = { label: t("phase.undo"), onAction: () => undo.mutate(removal) };
    toast.show({ message: t(spec.done, { company: companyOf(removal.item, t) }), action });
  };
}

/** Puts the row back (only this one), tells the page and says why. */
function useTriageFailure(events: TriageEvents) {
  const queryClient = useQueryClient();
  const reportError = useErrorToast();
  return (error: unknown, item: JobListItem, removal: Removal | undefined) => {
    if (removal) putBack(queryClient, removal);
    events.onTriageFailed(item.id);
    reportError(error);
  };
}

function useOptimisticTriage(tab: InboxTab, spec: TriageSpec, events: TriageEvents) {
  const queryClient = useQueryClient();
  const fail = useTriageFailure(events);
  const announce = useUndoToast(spec);
  return useMutation<unknown, unknown, JobListItem, Removal>({
    mutationKey: TRIAGE_KEY,
    scope: TRIAGE_SCOPE,
    mutationFn: (item) => spec.run(item.id),
    onMutate: (item) => {
      events.onRemoved(item.id);
      return takeOut(queryClient, tab, item);
    },
    onError: fail,
    onSuccess: (_result, _item, removal) => announce(removal),
    onSettled: (_result, _error, item) => settle(queryClient, item.id),
  });
}

/** A restored match goes back to "Neu", a former application to Bewerbungen (decision D13). */
function restoredMessage(item: JobListItem, t: Translate): string {
  const company = companyOf(item, t);
  return item.status === "OPEN"
    ? t("next.restored", { company })
    : t("inbox.restoredApplication", { company });
}

/** Not optimistic (no undo); the row leaves with the refetch after the last triage. */
function useRestore(onRemoved: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { t } = useI18n();
  const reportError = useErrorToast();
  return useMutation({
    mutationKey: TRIAGE_KEY,
    scope: TRIAGE_SCOPE,
    mutationFn: (item: JobListItem) => patchJob(item.id, { is_archived: false }),
    onSuccess: (_result, item) => {
      onRemoved(item.id);
      const view = { label: t("action.view"), onAction: () => router.push(jobRoute(item.id)) };
      toast.show({ message: restoredMessage(item, t), action: view });
    },
    onError: reportError,
    onSettled: (_result, _error, item) => settle(queryClient, item.id),
  });
}

/** Decision D4: a hard delete has no undo, so DeleteJobDialog asks first. */
function useRemove(onRemoved: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const reportError = useErrorToast();
  return useMutation({
    mutationKey: TRIAGE_KEY,
    scope: TRIAGE_SCOPE,
    mutationFn: (item: JobListItem) => deleteJob(item.id),
    onSuccess: (outcome, item) => {
      onRemoved(item.id);
      toast.show({ message: t(DELETE_MESSAGE[outcome], { company: companyOf(item, t) }) });
    },
    onError: reportError,
    onSettled: (_result, _error, item) => settle(queryClient, item.id),
  });
}

function pendingId(...mutations: ReadonlyArray<{ isPending: boolean; variables?: JobListItem }>) {
  return mutations.find((mutation) => mutation.isPending)?.variables?.id ?? null;
}

/** Decision D4: every triage of the inbox, for rows and the preview pane alike. */
export function useTriage(tab: InboxTab, events: TriageEvents): Triage {
  const shortlist = useOptimisticTriage(tab, SHORTLIST, events);
  const dismiss = useOptimisticTriage(tab, DISMISS, events);
  const restore = useRestore(events.onRemoved);
  const remove = useRemove(events.onRemoved);
  return {
    shortlist: (item) => shortlist.mutate(item),
    dismiss: (item) => dismiss.mutate(item),
    restore: (item) => restore.mutate(item),
    remove: (item) =>
      remove.mutateAsync(item).then(
        () => true,
        () => false,
      ),
    busyId: pendingId(restore, remove),
  };
}
