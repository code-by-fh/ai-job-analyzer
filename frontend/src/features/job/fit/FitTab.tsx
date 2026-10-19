"use client";

import { Check, RefreshCw, X, type LucideIcon } from "lucide-react";
import { reanalyzeJob, type JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { parseFitReasoning, type FitReasoning, type ReasoningBlock } from "@/domain/reasoning";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import { useI18n } from "@/i18n/useI18n";
import { usePendingStart, useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { Icon } from "@/ui/Icon";
import { InlineText, Markdown } from "@/ui/Markdown";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { TaskProgress, useStartTask } from "../TaskState";

/** Prototype tabFit: summary, Passt / Lücken, posting text, re-analysis. */
export function FitTab({ job }: { job: JobDetail }) {
  return (
    <div className="fit">
      {job.reasoning ? <FitBody job={job} reasoning={job.reasoning} /> : <NoScore job={job} />}
      <PostingText description={job.description} />
      {job.reasoning ? <Provenance job={job} /> : null}
    </div>
  );
}

function FitBody({ job, reasoning }: { job: JobDetail; reasoning: string }) {
  const fit = parseFitReasoning(reasoning);
  // Unknown headings: show the text as it is rather than guessing sections.
  if (!fit) return <Markdown source={reasoning} />;
  return (
    <>
      <FitSummary score={job.match_score} summary={fit.summary} />
      <FitColumns fit={fit} />
      <Recommendation text={fit.recommendation} />
      <OtherBlocks blocks={fit.other} />
    </>
  );
}

export function FitColumns({ fit }: { fit: FitReasoning }) {
  const { t } = useI18n();
  return (
    <div className="fit-grid">
      <FitList title={t("fit.passes")} items={fit.strengths} icon={Check} tone="fit-ok" />
      <FitList title={t("fit.gaps")} items={fit.gaps} icon={X} tone="fit-gap" />
    </div>
  );
}

function Recommendation({ text }: { text: string }) {
  const { t } = useI18n();
  if (!text) return null;
  return (
    <p className="fit-rec">
      <b>{t("fit.recommendation")}:</b> <InlineText text={text} />
    </p>
  );
}

/** Sections the parser does not know stay visible, in their original order. */
function OtherBlocks({ blocks }: { blocks: readonly ReasoningBlock[] }) {
  return blocks.map((block, index) => (
    <div className="fit-other" key={index}>
      <Markdown source={block.heading ? `## ${block.heading}\n${block.body}` : block.body} />
    </div>
  ));
}

function FitSummary({ score, summary }: { score: number | null | undefined; summary: string }) {
  const { t } = useI18n();
  const shown = score === null || score === undefined ? null : roundScore(score);
  return (
    <p className="fit-summary">
      {shown === null ? null : (
        <>
          <b className="num">{shown}</b> · {t(BAND_LABEL[scoreBand(shown)])}.{" "}
        </>
      )}
      <InlineText text={summary} />
    </p>
  );
}

interface FitListProps {
  title: string;
  items: readonly string[];
  icon: LucideIcon;
  tone: "fit-ok" | "fit-gap";
}

function FitList({ title, items, icon, tone }: FitListProps) {
  const { t } = useI18n();
  return (
    <div className={tone}>
      <h3 className="sec-title-sm">
        {title} <span className="count-plain">{items.length}</span>
      </h3>
      <ul role="list" className="fit-list">
        {items.length === 0 ? <li>{t("fit.none")}</li> : null}
        {items.map((item, index) => (
          <FitItem key={index} text={item} icon={icon} />
        ))}
      </ul>
    </div>
  );
}

function FitItem({ text, icon }: { text: string; icon: LucideIcon }) {
  return (
    <li>
      <Icon icon={icon} />
      <span>
        <InlineText text={text} />
      </span>
    </li>
  );
}

function PostingText({ description }: { description?: string | null }) {
  const { t } = useI18n();
  return (
    <div className="rationale">
      <Disclosure label={t("fit.description")}>
        <p className="posting-text">{description || t("fit.noDescription")}</p>
      </Disclosure>
    </div>
  );
}

function useAnalysis(job: JobDetail) {
  const taskId = pendingTaskId.analysis(job.id);
  const task = useStartTask(taskId, () => reanalyzeJob(job.id));
  return { ...task, phase: useTaskPhase(taskId), startedAt: usePendingStart(taskId) };
}

function NoScore({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const analysis = useAnalysis(job);
  return (
    <div className="dim-panel">
      <h3>{t("fit.noScoreTitle")}</h3>
      <p>{t("fit.noScoreText")}</p>
      <TaskProgress task={analysis} runningText={t("fit.running")} />
      {analysis.phase === "idle" ? (
        <div className="row">
          <Button busy={analysis.pending} onClick={analysis.run}>
            {t("fit.scoreNow")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Provenance({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const analysis = useAnalysis(job);
  return (
    <div className="provenance">
      <span>{t("fit.provenance")}</span>
      <TaskProgress task={analysis} runningText={t("fit.running")} />
      {analysis.phase === "idle" ? <RescoreButton {...analysis} /> : null}
    </div>
  );
}

function RescoreButton({ pending, run }: { pending: boolean; run: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="sm" variant="ghost" icon={RefreshCw} busy={pending} onClick={run}>
      {t("fit.rescore")}
    </Button>
  );
}
