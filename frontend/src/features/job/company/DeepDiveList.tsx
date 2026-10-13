"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { describeError } from "@/api/describeError";
import { runDeepDive, type DeepDive } from "@/api/companies";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { InlineText, Markdown } from "@/ui/Markdown";
import { Notice } from "@/ui/Notice";

export interface DeepDiveListProps {
  domain: string;
  companyName: string;
  jobTitle: string;
  items: readonly DeepDive[];
}

/** One synchronous AI call per item; the server does not store the result. */
export function DeepDiveList({ domain, companyName, jobTitle, items }: DeepDiveListProps) {
  return (
    <ol role="list" className="deep-dives">
      {items.map((item, index) => (
        <li key={index}>
          <Disclosure label={item.title}>
            <DeepDiveItem domain={domain} context={{ companyName, jobTitle }} item={item} />
          </Disclosure>
        </li>
      ))}
    </ol>
  );
}

interface DeepDiveItemProps {
  domain: string;
  context: { companyName: string; jobTitle: string };
  item: DeepDive;
}

function useDeepDiveMutation({ domain, context, item }: DeepDiveItemProps) {
  const { language } = useI18n();
  return useMutation({
    mutationFn: () =>
      runDeepDive(domain, {
        focus: item.focus,
        howToProceed: item.how_to_proceed,
        companyName: context.companyName,
        title: context.jobTitle,
        language,
      }),
  });
}

type DeepDiveRun = ReturnType<typeof useDeepDiveMutation>;

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

function DeepDiveBody({ run }: { run: DeepDiveRun }) {
  const { t } = useI18n();
  return (
    <>
      {run.data ? <Markdown source={run.data} /> : null}
      {run.isError ? <Notice tone="error">{describeError(run.error, t)}</Notice> : null}
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
  return (
    <div className="deep-dive">
      <DeepDiveIntro item={props.item} />
      <DeepDiveBody run={run} />
      <Button size="sm" busy={run.isPending} onClick={start}>
        {t(run.data ? "company.restartDeepDive" : "company.runDeepDive")}
      </Button>
    </div>
  );
}
