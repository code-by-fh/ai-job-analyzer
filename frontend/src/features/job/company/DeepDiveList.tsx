"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { isAiBusy } from "@/api/aiBusy";
import { describeError } from "@/api/describeError";
import { runDeepDive, type DeepDive, type DeepDiveRun } from "@/api/companies";
import { queryKeys } from "@/api/queryKeys";
import { deepDivePhase, deepDiveRunFor } from "@/domain/deepDive";
import { firstStart, startStamp } from "@/domain/elapsed";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { InlineText, Markdown } from "@/ui/Markdown";
import { Notice } from "@/ui/Notice";
import { RunningNotice } from "@/ui/RunningNotice";

const NO_RUNS: readonly DeepDiveRun[] = [];

export interface DeepDiveListProps {
  domain: string;
  companyName: string;
  jobTitle: string;
  items: readonly DeepDive[];
  /** The user's stored runs of the company (its profile's deep_dive_runs); none: nothing is shown from the server. */
  runs?: readonly DeepDiveRun[];
}

/**
 * One synchronous AI call per item. The server stores each run per user and focus, so a deep dive
 * that runs, failed or has a result shows so after a reload too.
 */
export function DeepDiveList({ items, runs = NO_RUNS, ...context }: DeepDiveListProps) {
  return (
    <ol role="list" className="deep-dives">
      {items.map((item, index) => (
        <DeepDiveEntry
          key={index}
          {...context}
          item={item}
          stored={deepDiveRunFor(runs, item.focus)}
        />
      ))}
    </ol>
  );
}

interface DeepDiveItemProps {
  domain: string;
  companyName: string;
  jobTitle: string;
  item: DeepDive;
  stored: DeepDiveRun | undefined;
}

/** A run the server reports as running or failed opens its item, so a reloaded page shows it. */
function DeepDiveEntry(props: DeepDiveItemProps) {
  const shownAtOnce = deepDivePhase(props.stored, false) !== "idle";
  return (
    <li>
      <Disclosure label={props.item.title} defaultOpen={shownAtOnce}>
        <DeepDiveItem {...props} />
      </Disclosure>
    </li>
  );
}

function useDeepDiveMutation({ domain, companyName, jobTitle, item }: DeepDiveItemProps) {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      runDeepDive(domain, {
        focus: item.focus,
        howToProceed: item.how_to_proceed,
        companyName,
        title: jobTitle,
        language,
      }),
    // The stored run (result or fixed error) wins over this tab's answer once it is loaded.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.company(domain) }),
  });
}

type DeepDiveRequest = ReturnType<typeof useDeepDiveMutation>;

/** A double click can land before the busy state renders; the ref lets one AI call through. */
function useDeepDive(props: DeepDiveItemProps) {
  const run = useDeepDiveMutation(props);
  const inFlight = useRef(false);
  const start = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    run.mutate(undefined, { onSettled: () => (inFlight.current = false) });
  };
  return { run, start };
}

interface DeepDiveBodyProps {
  run: DeepDiveRequest;
  stored: DeepDiveRun | undefined;
}

/** The server's stamp survives a reload; this tab's own request covers the time before it is loaded. */
function runStart(run: DeepDiveRequest, stored: DeepDiveRun | undefined): number | null {
  const sentHere = run.isPending ? run.submittedAt : null;
  return firstStart(startStamp(stored?.deep_dive_started_at), sentHere);
}

function RequestError({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <Notice tone="error">{isAiBusy(error) ? t("error.aiBusy") : describeError(error, t)}</Notice>
  );
}

/** This tab's own refusal reads describeError; a run the server ended with an error, the fixed text. */
function DeepDiveBody({ run, stored }: DeepDiveBodyProps) {
  const { t } = useI18n();
  const phase = deepDivePhase(stored, run.isPending);
  const result = run.data ?? stored?.deep_dive_result;
  return (
    <>
      {phase === "running" ? (
        <RunningNotice text={t("company.deepDiveRunning")} startedAt={runStart(run, stored)} />
      ) : null}
      {result ? <Markdown source={result} /> : null}
      {run.isError ? <RequestError error={run.error} /> : null}
      {phase === "failed" && !run.isError ? (
        <Notice tone="error">{t("company.deepDiveFailed")}</Notice>
      ) : null}
    </>
  );
}

function DeepDiveIntro({ item }: { item: DeepDive }) {
  const { t } = useI18n();
  return (
    <>
      <p>
        <InlineText text={item.focus} />
      </p>
      {item.why_it_matters ? (
        <p className="meta">
          {t("company.whyItMatters")}: <InlineText text={item.why_it_matters} />
        </p>
      ) : null}
    </>
  );
}

function DeepDiveItem(props: DeepDiveItemProps) {
  const { t } = useI18n();
  const { run, start } = useDeepDive(props);
  const hasResult = Boolean(run.data ?? props.stored?.deep_dive_result);
  return (
    <div className="deep-dive">
      <DeepDiveIntro item={props.item} />
      <DeepDiveBody run={run} stored={props.stored} />
      <Button
        size="sm"
        busy={deepDivePhase(props.stored, run.isPending) === "running"}
        onClick={start}
      >
        {t(hasResult ? "company.restartDeepDive" : "company.runDeepDive")}
      </Button>
    </div>
  );
}
