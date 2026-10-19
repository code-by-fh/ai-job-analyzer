"use client";

import type { JobDetail } from "@/api/jobs";
import {
  gapsByWeight,
  prepLinks,
  prepSections,
  type InterviewPrep,
  type PrepGap,
  type PrepSectionKey,
} from "@/domain/interviewPrep";
import { levelKey } from "@/domain/levels";
import { resourceLinks, sourceTitle } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { InlineText, Markdown } from "@/ui/Markdown";
import { DeepDiveList } from "../company/DeepDiveList";
import { GapWeight, PrepOverview } from "./PrepOverview";
import { PREP_SECTION_TITLE, PrepSection, prepSectionId } from "./PrepSection";

interface SectionProps {
  job: JobDetail;
  prep: InterviewPrep;
}

/** Inventory B.4 JobInterviewTab: the overview first, then every section of the prep JSON that has content. */
export function InterviewPrepView({ job, prep }: SectionProps) {
  const sections = prepSections(prep);
  return (
    <div className="prep">
      <PrepOverview job={job} prep={prep} sections={sections} />
      {sections.map(({ key }) => (
        <TitledSection key={key} section={key} job={job} prep={prep} />
      ))}
    </div>
  );
}

function TitledSection({ section, ...props }: SectionProps & { section: PrepSectionKey }) {
  const { t } = useI18n();
  return (
    <PrepSection id={prepSectionId(section)} title={t(PREP_SECTION_TITLE[section])}>
      <SectionBody section={section} {...props} />
    </PrepSection>
  );
}

function SectionBody({ section, job, prep }: SectionProps & { section: PrepSectionKey }) {
  switch (section) {
    case "pitch":
      return <Pitch text={prep.structured_prep?.elevator_pitch ?? ""} />;
    case "gaps":
      return <GapCards gaps={gapsByWeight(prep)} />;
    case "uncertainties":
      return <TextList items={prep.confidence_assessment?.uncertainties ?? []} />;
    case "depth":
      return <Depth source={prep.report_output?.deep_dive_analysis ?? ""} />;
    case "deepDives":
      return <DeepDives job={job} prep={prep} />;
    case "contacts":
      return <Contacts prep={prep} />;
    case "sources":
      return <Sources prep={prep} />;
  }
}

/** The pitch is said aloud, so it reads as a quote in a larger face. */
function Pitch({ text }: { text: string }) {
  return (
    <blockquote className="prep-pitch">
      <p>
        <InlineText text={text} />
      </p>
    </blockquote>
  );
}

function Depth({ source }: { source: string }) {
  const { t } = useI18n();
  return (
    <Disclosure label={t("prep.readDepth")}>
      <Markdown source={source} />
    </Disclosure>
  );
}

/** One card per requirement: the requirement and where you stand at a glance, the strategy on demand. */
function GapCard({ gap }: { gap: PrepGap }) {
  return (
    <li className="prep-card" data-weight={levelKey(gap.gap_severity) ?? undefined}>
      <div className="prep-card-head">
        <h4 className="prep-card-title">
          <InlineText text={gap.requirement} />
        </h4>
        <GapWeight gap={gap} />
      </div>
      {gap.cv_status ? (
        <p className="prep-card-status">
          <InlineText text={gap.cv_status} />
        </p>
      ) : null}
      <GapStrategy text={gap.interview_strategy} />
    </li>
  );
}

function GapStrategy({ text }: { text?: string | null }) {
  const { t } = useI18n();
  if (!text) return null;
  return (
    <Disclosure label={t("prep.strategy")}>
      <InlineText text={text} />
    </Disclosure>
  );
}

function GapCards({ gaps }: { gaps: readonly PrepGap[] }) {
  return (
    <ol role="list" className="prep-cards">
      {gaps.map((gap, index) => (
        <GapCard key={index} gap={gap} />
      ))}
    </ol>
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

function Contacts({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const social = prep.social_intelligence_research;
  const contacts = (social?.potential_contacts ?? []).map(
    (name) => name || t("prep.contactFallback"),
  );
  return (
    <>
      <p className="meta">{t("prep.contactsCaveat")}</p>
      <TextList items={[...contacts, ...(social?.insights_from_contacts ?? [])]} />
    </>
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

function Sources({ prep }: { prep: InterviewPrep }) {
  const { sources, links } = prepLinks(prep);
  return (
    <>
      <ul role="list" className="prep-list">
        {sources.map((source, index) => (
          <li key={index}>
            <SourceItem source={source} />
          </li>
        ))}
      </ul>
      <ResourceLinks links={links} />
    </>
  );
}

function DeepDives({ job, prep }: SectionProps) {
  // The deep-dive endpoint only uses the path value as a label; fall back to the company name.
  const domain = job.company_domain ?? job.company ?? job.id;
  return (
    <DeepDiveList
      domain={domain}
      companyName={job.company ?? domain}
      jobTitle={job.title ?? ""}
      items={prep.deep_dive_buttons}
    />
  );
}
