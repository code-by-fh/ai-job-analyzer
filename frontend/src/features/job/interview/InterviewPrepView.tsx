"use client";

import type { ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import type { InterviewPrep } from "@/domain/interviewPrep";
import { resourceLinks, sourceTitle } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { InlineText, Markdown } from "@/ui/Markdown";
import { Tag } from "@/ui/Tag";
import { DeepDiveList } from "../company/DeepDiveList";
import { useJobFormat } from "../format/useJobFormat";
import { useLevelText } from "../levelText";

type Gap = NonNullable<InterviewPrep["structured_prep"]>["gap_analysis"][number];

/** Inventory B.4 JobInterviewTab: every section of the prep JSON, in the prototype's prep-sec style. */
export function InterviewPrepView({ job, prep }: { job: JobDetail; prep: InterviewPrep }) {
  return (
    <div className="prep">
      <Appointment job={job} />
      <SummarySection prep={prep} />
      <PitchSection prep={prep} />
      <GapSection gaps={prep.structured_prep?.gap_analysis ?? []} />
      <DepthSection prep={prep} />
      <ContactsSection prep={prep} />
      <ConfidenceSection prep={prep} />
      <DeepDiveSection job={job} prep={prep} />
      <SourcesSection prep={prep} />
    </div>
  );
}

function SummarySection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const summary = prep.report_output?.executive_summary;
  if (!summary) return null;
  return (
    <PrepSection title={t("prep.summary")}>
      <Markdown source={summary} />
    </PrepSection>
  );
}

function PitchSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const pitch = prep.structured_prep?.elevator_pitch;
  if (!pitch) return null;
  return (
    <PrepSection title={t("prep.pitch")}>
      <p className="prose">
        <InlineText text={pitch} />
      </p>
    </PrepSection>
  );
}

function DepthSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const depth = prep.report_output?.deep_dive_analysis;
  if (!depth) return null;
  return (
    <PrepSection title={t("prep.depth")}>
      <Markdown source={depth} />
    </PrepSection>
  );
}

function PrepSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{title}</h3>
      {children}
    </section>
  );
}

function Appointment({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  if (!job.interview_at) return null;
  return (
    <p className="prose num prep-when">
      {t("prep.appointment", { date: format.dateTime(job.interview_at) })}
    </p>
  );
}

function AnswerLine({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="prep-a">
      <InlineText text={text} />
    </div>
  );
}

function GapItem({ gap }: { gap: Gap }) {
  const levelText = useLevelText();
  return (
    <li>
      <div className="prep-q">
        <InlineText text={gap.requirement} />
      </div>
      {gap.gap_severity ? (
        <div className="tags">
          <Tag>{levelText(gap.gap_severity, "prep.severity")}</Tag>
        </div>
      ) : null}
      <AnswerLine text={gap.cv_status} />
      <AnswerLine text={gap.interview_strategy} />
    </li>
  );
}

function GapSection({ gaps }: { gaps: readonly Gap[] }) {
  const { t } = useI18n();
  if (gaps.length === 0) return null;
  return (
    <PrepSection title={t("prep.gaps")}>
      <ul role="list" className="prep-list">
        {gaps.map((gap, index) => (
          <GapItem key={index} gap={gap} />
        ))}
      </ul>
    </PrepSection>
  );
}

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul role="list" className="prep-list">
      {items.map((item, index) => (
        <li key={index}>
          <InlineText text={item} />
        </li>
      ))}
    </ul>
  );
}

function ContactsSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const social = prep.social_intelligence_research;
  const contacts = (social?.potential_contacts ?? []).map(
    (name) => name || t("prep.contactFallback"),
  );
  const items = [...contacts, ...(social?.insights_from_contacts ?? [])];
  if (items.length === 0) return null;
  return (
    <PrepSection title={t("prep.contacts")}>
      <p className="meta">{t("prep.contactsCaveat")}</p>
      <TextList items={items} />
    </PrepSection>
  );
}

function ConfidenceSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const levelText = useLevelText();
  const confidence = prep.confidence_assessment;
  if (!confidence) return null;
  if (!confidence.overall_confidence && confidence.uncertainties.length === 0) return null;
  return (
    <PrepSection title={t("prep.uncertainties")}>
      {confidence.overall_confidence ? (
        <p className="meta">{levelText(confidence.overall_confidence, "prep.confidence")}</p>
      ) : null}
      <TextList items={confidence.uncertainties} />
    </PrepSection>
  );
}

function ResourceLinks({ links }: { links: readonly string[] }) {
  return (
    <ul role="list" className="plain-list">
      {links.map((link) => (
        <li key={link}>
          <a className="link code" href={link} target="_blank" rel="noopener noreferrer">
            {link}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "Engineering Blog https://…" reads as a link named by its title; a bare URL as itself. */
function SourceItem({ source }: { source: string }) {
  const links = resourceLinks(source);
  const title = sourceTitle(source);
  if (links.length === 0) return <InlineText text={source} />;
  if (links.length > 1 || !title) return <ResourceLinks links={links} />;
  return (
    <a className="link" href={links[0]} target="_blank" rel="noopener noreferrer">
      {title}
    </a>
  );
}

function SourcesSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const sources = prep.social_intelligence_research?.research_sources ?? [];
  // Dedupe by URL: a titled source already links what online_resources repeats bare.
  const sourceLinks = resourceLinks(sources);
  const links = resourceLinks(prep.online_resources).filter((link) => !sourceLinks.includes(link));
  if (sources.length === 0 && links.length === 0) return null;
  return (
    <PrepSection title={t("prep.sources")}>
      <ul role="list" className="prep-list">
        {sources.map((source, index) => (
          <li key={index}>
            <SourceItem source={source} />
          </li>
        ))}
      </ul>
      <ResourceLinks links={links} />
    </PrepSection>
  );
}

function DeepDiveSection({ job, prep }: { job: JobDetail; prep: InterviewPrep }) {
  const { t } = useI18n();
  // The deep-dive endpoint only uses the path value as a label; fall back to the company name.
  const domain = job.company_domain ?? job.company ?? job.id;
  if (prep.deep_dive_buttons.length === 0) return null;
  return (
    <PrepSection title={t("company.deepDives")}>
      <DeepDiveList
        domain={domain}
        companyName={job.company ?? domain}
        jobTitle={job.title ?? ""}
        items={prep.deep_dive_buttons}
      />
    </PrepSection>
  );
}
