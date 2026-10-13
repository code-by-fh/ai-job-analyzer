import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import {
  EMPTY_IMPORT_EVENTS,
  EMPTY_IMPORTS,
  applyImportSignal,
  bufferImportEvent,
  expireImports,
  finishImport,
  takeImportEvents,
  trackImport,
  type BufferedImportEvent,
  type ImportEventBuffer,
  type ImportResult,
  type ImportState,
} from "./imports";

type FinishedListener = (result: ImportResult) => void;

// markImportStarted has no access to the realtime deps, so the provider registers its toast here.
const listeners = new WeakMap<QueryClient, FinishedListener>();

export function setImportFinishedListener(queryClient: QueryClient, listener: FinishedListener) {
  listeners.set(queryClient, listener);
}

/** The provider's cleanup: a stale toast closure must not report imports after logout. */
export function clearImportFinishedListener(queryClient: QueryClient): void {
  listeners.delete(queryClient);
}

function notify(queryClient: QueryClient, results: ImportResult[]): void {
  const listener = listeners.get(queryClient);
  if (listener) results.forEach((result) => listener(result));
}

export function readImports(queryClient: QueryClient): ImportState {
  return queryClient.getQueryData<ImportState>(queryKeys.imports) ?? EMPTY_IMPORTS;
}

function readEvents(queryClient: QueryClient): ImportEventBuffer {
  return queryClient.getQueryData<ImportEventBuffer>(queryKeys.importEvents) ?? EMPTY_IMPORT_EVENTS;
}

/**
 * Applies one event to the import of its crawl. An event for a crawl that is not tracked yet is
 * buffered instead (it may beat the response that starts the tracking). Returns a finished result.
 */
export function routeImportSignal(
  queryClient: QueryClient,
  event: BufferedImportEvent,
): ImportResult | null {
  const { crawlId, signal } = event;
  const current = readImports(queryClient);
  if (!(crawlId in current)) {
    const buffer = bufferImportEvent(readEvents(queryClient), event);
    queryClient.setQueryData(queryKeys.importEvents, buffer);
    return null;
  }
  const { state, result } = applyImportSignal(current, crawlId, signal);
  queryClient.setQueryData(queryKeys.imports, state);
  return result;
}

/** Starts tracking an import and replays the events that arrived before this call. */
export function markImportStarted(queryClient: QueryClient, crawlId: string, now: number): void {
  queryClient.setQueryData(queryKeys.imports, trackImport(readImports(queryClient), crawlId, now));
  const { rest, signals } = takeImportEvents(readEvents(queryClient), crawlId, now);
  queryClient.setQueryData(queryKeys.importEvents, rest);
  const results = signals.map((signal) =>
    routeImportSignal(queryClient, { crawlId, signal, at: now }),
  );
  notify(
    queryClient,
    results.filter((result) => result !== null),
  );
}

/** Gives up on imports whose end event never came, so nothing lingers forever. */
export function expireStalledImports(queryClient: QueryClient, now: number): void {
  const { state, results } = expireImports(readImports(queryClient), now);
  if (results.length === 0) return;
  queryClient.setQueryData(queryKeys.imports, state);
  notify(queryClient, results);
}

/** Forgets an import the user gave up on: no later end event or sweep reports it. */
export function forgetImport(queryClient: QueryClient, crawlId: string): void {
  const { state } = finishImport(readImports(queryClient), crawlId, "cancelled");
  queryClient.setQueryData(queryKeys.imports, state);
}
