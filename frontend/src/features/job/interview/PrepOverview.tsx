"use client";

import { useId } from "react";
import type { JobDetail } from "@/api/jobs";
import {
  gapsByWeight,
  type InterviewPrep,
  type PrepGap,
  type PrepSectionEntry,
} from "@/domain/interviewPrep";
import { levelKey } from "@/domain/levels";
import { useI18n } from "@/i18n/useI18n";
import { InlineText, Markdown } from "@/ui/Markdown";
import { Tag } from "@/ui/Tag";
import { useJobFormat } from "../format/useJobFormat";
import { useLevelText } from "../levelText";
import { PREP_SECTION_TITLE, PrepSection, prepSectionId } from "./PrepSection";

const TOP_GAPS = 3;

interface PrepOverviewProps {
  job: JobDetail;
  prep: InterviewPrep;
  sections: readonly PrepSectionEntry[];
}

/** First thing on the tab: date, starting point, confidence, the heaviest gaps and the contents. */
export function PrepOverview({ job, prep, sections }: PrepOverviewProps) {
  const { t } = useI18n();
  const summary = prep.report_output?.executive_summary;
  return (
    <PrepSection id={prepSectionId("overview")} title={t("prep.overview")}>
      <div className="prep-overview">
        <div className="prep-overview-main">
          <Appointment job={job} />
          {summary ? <Markdown source={summary} /> : null}
          <Confidence value={prep.confidence_assessment?.overall_confidence} />
          <TopGaps gaps={gapsByWeight(prep).slice(0, TOP_GAPS)} />
        </div>
        <Contents sections={sections} />
      </div>
    </PrepSection>
  );
}

function Appointment({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  if (!job.interview_at) return null;
  return (
    <p className="meta num prep-when">
      {t("prep.appointment", { date: format.dateTime(job.interview_at) })}
    </p>
  );
}

/** The level in words; a three-step bar repeats a known level for the eye only. */
function Confidence({ value }: { value?: string | null }) {
  const levelText = useLevelText();
  const text = levelText(value, "prep.confidence");
  if (!text) return null;
  const level = levelKey(value);
  return (
    <p className="meta prep-confidence">
      {level ? (
        <span className="prep-meter" data-level={level} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
      {text}
    </p>
  );
}

/** A gap's weight as a tag; shared by the overview and the gap cards. */
export function GapWeight({ gap }: { gap: PrepGap }) {
  const levelText = useLevelText();
  const text = levelText(gap.gap_severity, "prep.severity");
  return text ? <Tag>{text}</Tag> : null;
}

function TopGaps({ gaps }: { gaps: readonly PrepGap[] }) {
  const { t } = useI18n();
  const headingId = useId();
  if (gaps.length === 0) return null;
  return (
    <div className="prep-top">
      <h4 className="prep-sub" id={headingId}>
        {t("prep.focus")}
      </h4>
      <ol role="list" className="prep-top-list" aria-labelledby={headingId}>
        {gaps.map((gap, index) => (
          <TopGap key={index} gap={gap} />
        ))}
      </ol>
    </div>
  );
}

function TopGap({ gap }: { gap: PrepGap }) {
  return (
    <li>
      <span className="prep-top-req">
        <InlineText text={gap.requirement} />
      </span>
      <GapWeight gap={gap} />
    </li>
  );
}

/** Jump list into the sections; a list section shows how many items it holds. */
function Contents({ sections }: { sections: readonly PrepSectionEntry[] }) {
  const { t } = useI18n();
  const headingId = useId();
  if (sections.length === 0) return null;
  return (
    <nav className="prep-toc" aria-labelledby={headingId}>
      <h4 className="prep-sub" id={headingId}>
        {t("prep.contents")}
      </h4>
      <ul role="list">
        {sections.map((entry) => (
          <ContentsLink key={entry.key} entry={entry} />
        ))}
      </ul>
    </nav>
  );
}

function ContentsLink({ entry: { key, count } }: { entry: PrepSectionEntry }) {
  const { t } = useI18n();
  return (
    <li>
      <a href={`#${prepSectionId(key)}`}>
        {/* The space keeps "Lücken und Strategie 4" one readable name; flex drops it visually. */}
        <span>{t(PREP_SECTION_TITLE[key])}</span>{" "}
        {count === null ? null : <span className="prep-toc-n num">{count}</span>}
      </a>
    </li>
  );
}
