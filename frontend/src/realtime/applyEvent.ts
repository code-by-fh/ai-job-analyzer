import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import type { JobDetail } from "@/api/jobs";
import type { SetupStatus } from "@/api/setup";
import { INBOX_TRIAGE_KEY, queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, finishTask, pendingTaskId, type PendingTasks } from "@/domain/pendingTasks";
import { EMPTY_ACTIVITY, reduceActivity, type ActivityState } from "./activity";
import type {
  ActivityEvent,
  EventOf,
  FinishEvent,
  RealtimeEvent,
  RealtimeEventType,
} from "./events";
import type { ImportEnd, ImportResult, ImportSignal } from "./imports";
import { routeImportSignal } from "./importSignals";

export interface RealtimeDeps {
  queryClient: QueryClient;
  now: () => number;
  onGlobalError: () => void;
  /** Once per import this tab started, when its crawl ended (the toast lives in RealtimeProvider). */
  onImportFinished?: (result: ImportResult) => void;
}

type Handler<E> = (event: E, deps: RealtimeDeps) => void;

function isInboxListQuery(queryKey: QueryKey): boolean {
  return queryKey[0] === "jobs" && (queryKey[1] === "inbox" || queryKey[1] === "inbox-total");
}

/**
 * R15: while an inbox triage is pending its row is only removed in the cache; a list refetched now
 * could still contain it and show it again. The triage refetches the lists once the last one
 * settled. Returns the query filter predicate: every query when no triage runs (undefined).
 */
export function skipWhileTriaging(
  queryClient: QueryClient,
): ((query: Query) => boolean) | undefined {
  const triaging = queryClient.isMutating({ mutationKey: INBOX_TRIAGE_KEY }) > 0;
  return triaging ? (query: Query) => !isInboxListQuery(query.queryKey) : undefined;
}

function invalidate(deps: RealtimeDeps, ...keys: QueryKey[]): void {
  const { queryClient } = deps;
  const predicate = skipWhileTriaging(queryClient);
  keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey, predicate }));
}

/** Events may have been missed while disconnected (spec 6); R15 holds for this refetch too. */
export function refetchAfterReconnect(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({ type: "active", predicate: skipWhileTriaging(queryClient) });
}

function patchActivity(event: ActivityEvent, deps: RealtimeDeps): void {
  deps.queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
    reduceActivity(state ?? EMPTY_ACTIVITY, event, deps.now()),
  );
}

function routeImport(crawlId: string, signal: ImportSignal, deps: RealtimeDeps): void {
  const result = routeImportSignal(deps.queryClient, { crawlId, signal, at: deps.now() });
  if (result) deps.onImportFinished?.(result);
}

const END_OF: Record<FinishEvent["type"], ImportEnd> = {
  crawl_job_completed: "completed",
  crawl_job_failed: "failed",
  crawl_job_cancelled: "cancelled",
};

// The company directory counts the user's jobs per company, so every change of the job set refreshes it.
function finishCrawl(event: FinishEvent, deps: RealtimeDeps): void {
  patchActivity(event, deps);
  invalidate(
    deps,
    queryKeys.platforms,
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.companiesRoot,
  );
  routeImport(event.job_id, { kind: "end", end: END_OF[event.type] }, deps);
}

/**
 * Only the first job can change the setup status that matters (has_jobs ends the first-run
 * onboarding), so a crawl burst does not refetch it on every event once a job is known.
 */
function knowsNoJobYet(queryClient: QueryClient): boolean {
  return queryClient.getQueryData<SetupStatus>(queryKeys.setupStatus)?.has_jobs !== true;
}

// The threshold ticks and preview live outside the jobs root, so a new match refreshes them here.
function newJob(event: EventOf<"new_job">, deps: RealtimeDeps): void {
  invalidate(
    deps,
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.companiesRoot,
    queryKeys.thresholdDistribution,
    queryKeys.thresholdPreviewRoot,
  );
  if (knowsNoJobYet(deps.queryClient)) invalidate(deps, queryKeys.setupStatus);
  const crawlId = event.crawl_job_id;
  if (crawlId) routeImport(crawlId, { kind: "job", job: event.job }, deps);
}

function crawlCompleted(_event: EventOf<"crawl_completed">, deps: RealtimeDeps): void {
  invalidate(
    deps,
    queryKeys.platforms,
    queryKeys.thresholdDistribution,
    queryKeys.thresholdPreviewRoot,
  );
}

function jobSkipped(event: EventOf<"job_skipped">, deps: RealtimeDeps): void {
  const signal: ImportSignal = { kind: "skipped", existingJobId: event.existing_job_id ?? null };
  routeImport(event.job_id, signal, deps);
}

function invalidateJob(jobId: string, deps: RealtimeDeps): void {
  invalidate(
    deps,
    queryKeys.job(jobId),
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.companiesRoot,
  );
}

function patchPending(deps: RealtimeDeps, update: (tasks: PendingTasks) => PendingTasks): void {
  deps.queryClient.setQueryData<PendingTasks>(queryKeys.pendingTasks, (tasks) =>
    update(tasks ?? EMPTY_PENDING),
  );
}

function jobUpdated(event: EventOf<"job_updated">, deps: RealtimeDeps): void {
  invalidateJob(event.job.id, deps);
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.analysis(event.job.id)));
}

/** End of a generation; it only invalidates. */
function jobUpdate(event: EventOf<"job_update">, deps: RealtimeDeps): void {
  invalidateJob(event.job_id, deps);
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.generation(event.job_id)));
}

function prepReady(event: EventOf<"interview_prep_ready">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(event.job_id));
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.prep(event.job_id)));
}

function postingDetailsEnded(event: EventOf<"posting_details_ended">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(event.job_id));
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.postingDetails(event.job_id)));
}

/**
 * A research started on a job ended (success or failure): reloading the job tells which. Its own
 * pending entry ends here too.
 */
function jobResearchEnded(jobId: string, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(jobId));
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.jobResearch(jobId)));
}

/**
 * The event names the company: refresh the profile, every loaded job of that company and the
 * company directory (its research state, D11).
 */
function companyResearched(domain: string, deps: RealtimeDeps): void {
  const jobKeys = deps.queryClient
    .getQueryCache()
    .findAll({ predicate: (query) => isJobOfCompany(query.queryKey, query.state.data, domain) })
    .map((query) => query.queryKey);
  invalidate(deps, queryKeys.company(domain), queryKeys.companiesRoot, ...jobKeys);
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.research(domain)));
}

function companyReady(event: EventOf<"company_profile_ready">, deps: RealtimeDeps): void {
  if (event.domain) companyResearched(event.domain, deps);
  if (event.job_id) jobResearchEnded(event.job_id, deps);
}

function isJobOfCompany(queryKey: QueryKey, data: unknown, domain: string): boolean {
  const isJobDetail = queryKey.length === 2 && queryKey[0] === "job";
  return isJobDetail && (data as Partial<JobDetail> | undefined)?.company_domain === domain;
}

/** Like a profile save (storeSaved): profile_complete and the template previews follow the profile. */
function cvImportEnded(_event: EventOf<"cv_import_ended">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.profile, queryKeys.setupStatus, queryKeys.templatePreviewRoot);
}

// One entry per event type: a new event type fails the type check until it is handled here.
const HANDLERS: { [K in RealtimeEventType]: Handler<EventOf<K>> } = {
  crawl_job_started: patchActivity,
  crawl_job_progress: patchActivity,
  crawl_job_extracting: patchActivity,
  job_analysis_started: patchActivity,
  job_analysis_finished: patchActivity,
  crawl_job_completed: finishCrawl,
  crawl_job_failed: finishCrawl,
  crawl_job_cancelled: finishCrawl,
  job_skipped: jobSkipped,
  crawl_completed: crawlCompleted,
  new_job: newJob,
  // A status change moves the job between tabs, so the nav counts change too.
  job_updated: jobUpdated,
  job_update: jobUpdate,
  interview_prep_ready: prepReady,
  posting_details_ended: postingDetailsEnded,
  company_profile_ready: companyReady,
  cv_import_ended: cvImportEnded,
  deep_dive_ended: (event, deps) => invalidate(deps, queryKeys.company(event.domain)),
  template_ready: (_event, deps) => invalidate(deps, queryKeys.templates),
  global_error: (_event, deps) => deps.onGlobalError(),
  ai_error: (_event, deps) => invalidate(deps, queryKeys.systemStatus),
  ai_error_cleared: (_event, deps) => invalidate(deps, queryKeys.systemStatus),
};

/** Maps one accepted event onto the query cache (spec 6: realtime -> cache updates). */
export function applyEvent(event: RealtimeEvent, deps: RealtimeDeps): void {
  // TypeScript cannot correlate HANDLERS[event.type] with the event's own type; the map guarantees it.
  const handler = HANDLERS[event.type] as Handler<RealtimeEvent>;
  handler(event, deps);
}
