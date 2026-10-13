"use client";

import { Archive, Bookmark, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { parseFitReasoning, type FitReasoning } from "@/domain/reasoning";
import { ArchiveNote, JobMetaLine, ScoreBox } from "@/features/job/JobHeader";
import { FitColumns } from "@/features/job/fit/FitTab";
import { jobRoute } from "@/features/shell/routes";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { InlineText, Markdown } from "@/ui/Markdown";
import { useJobTitle } from "./RowActions";
import type { Triage } from "./useTriage";

const PREVIEW_TITLE_ID = "inbox-preview-title";

export interface InboxPreviewProps {
  item: JobListItem;
  tab: InboxTab;
  triage: Triage;
}

/**
 * Usability "Eingang" layout: title, fit summary, Passt / Lücken, posting link, sticky actions.
 * Never keyed by job: when the selection moves on after a triage from here, the same buttons stay
 * mounted, so keyboard focus stays on the pane's action instead of falling to the page.
 */
export function InboxPreview({ item, tab, triage }: InboxPreviewProps) {
  return (
    <article className="ip" aria-labelledby={PREVIEW_TITLE_ID}>
      <PreviewHead item={item} />
      <PreviewFit reasoning={item.reasoning} />
      <div className="ip-actions">
        <PreviewActions item={item} tab={tab} triage={triage} />
      </div>
    </article>
  );
}

function PreviewHead({ item }: { item: JobListItem }) {
  const { t } = useI18n();
  return (
    <header className="ip-head">
      <div className="ip-headline">
        <h2 className="ip-title" id={PREVIEW_TITLE_ID}>
          {item.title ?? t("job.untitled")}
        </h2>
        <p className="jd-meta">{item.company ?? t("job.unknownCompany")}</p>
        <JobMetaLine job={item} />
        <ArchiveNote job={item} />
      </div>
      <ScoreBox score={item.match_score} recede={false} />
    </header>
  );
}

function PreviewFit({ reasoning }: { reasoning?: string | null }) {
  const { t } = useI18n();
  if (!reasoning) return <p className="ip-body meta">{t("job.unscored")}</p>;
  const fit = parseFitReasoning(reasoning);
  return (
    <div className="ip-body">
      {/* Unknown headings: the AI text as it is rather than guessed sections (as the Passung tab). */}
      {fit ? <PreviewSummary fit={fit} /> : <Markdown source={reasoning} />}
    </div>
  );
}

function PreviewSummary({ fit }: { fit: FitReasoning }) {
  return (
    <>
      {fit.summary ? (
        <p className="fit-summary">
          <InlineText text={fit.summary} />
        </p>
      ) : null}
      <FitColumns fit={fit} />
    </>
  );
}

type ActionProps = Omit<InboxPreviewProps, "tab">;

/** Decision D12 in the pane: Neu -> Vormerken/Aussortieren; archive tabs -> Wiederherstellen. */
function PreviewActions({ item, tab, triage }: InboxPreviewProps) {
  const { t } = useI18n();
  return (
    <>
      {tab === "new" ? (
        <TriageButtons item={item} triage={triage} />
      ) : (
        <RestoreButton item={item} triage={triage} />
      )}
      <Link className="btn btn-ghost" href={jobRoute(item.id)}>
        {t("inbox.openPage")}
      </Link>
    </>
  );
}

function TriageButtons({ item, triage }: ActionProps) {
  return (
    <>
      <ShortlistButton item={item} triage={triage} />
      <DismissButton item={item} triage={triage} />
    </>
  );
}

// The labels start with the visible text (label in name) and add the job, as the row buttons do.
function ShortlistButton({ item, triage }: ActionProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      variant="primary"
      icon={Bookmark}
      aria-label={t("inbox.shortlistJob", { title })}
      onClick={() => triage.shortlist(item)}
    >
      {t("next.shortlist")}
    </Button>
  );
}

function DismissButton({ item, triage }: ActionProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      icon={Archive}
      aria-label={t("inbox.dismissJob", { title })}
      onClick={() => triage.dismiss(item)}
    >
      {t("next.dismiss")}
    </Button>
  );
}

function RestoreButton({ item, triage }: ActionProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      icon={RotateCcw}
      busy={triage.busyId === item.id}
      aria-label={t("inbox.restoreJob", { title })}
      onClick={() => triage.restore(item)}
    >
      {t("next.restoreAction")}
    </Button>
  );
}
