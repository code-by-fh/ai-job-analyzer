"use client";

import type {
  CompanyAnalysis,
  CompanyProfile,
  CompanyRisk,
  ComparisonPoint,
} from "@/api/companies";
import { isHttpUrl, resourceLinks } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { InlineText } from "@/ui/Markdown";
import { Tag } from "@/ui/Tag";
import { useLevelText } from "../levelText";

/** Every section only when present; all text is AI output and goes through InlineText. */
export function CompanyProfileView({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="company-profile">
      <SummarySection profile={profile} />
      <AnalysisSection areas={profile.analysis} />
      <InsightsSection profile={profile} />
      <RisksSection risks={profile.risks} />
      <MarketSection profile={profile} />
      <SourcesSection value={profile.online_resources} />
    </div>
  );
}

type SuitabilitySummary = NonNullable<CompanyProfile["executive_summary"]>;

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul role="list" className="plain-list">
      {items.map((item, index) => (
        <li key={index}>
          <InlineText text={item} />
        </li>
      ))}
    </ul>
  );
}

function Labelled({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <p className="meta">
      {label}: <InlineText text={text} />
    </p>
  );
}

function Block({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  return (
    <p className={className}>
      <InlineText text={text} />
    </p>
  );
}

function ListOrDash({ items }: { items: readonly string[] }) {
  const { t } = useI18n();
  return items.length ? <TextList items={items} /> : t("company.notSet");
}

function SuitabilityList({ summary }: { summary: SuitabilitySummary }) {
  const { t } = useI18n();
  return (
    <dl className="kv">
      <dt>{t("company.suitable")}</dt>
      <dd>
        <ListOrDash items={summary.suitable_for} />
      </dd>
      <dt>{t("company.notSuitable")}</dt>
      <dd>
        <ListOrDash items={summary.not_suitable_for} />
      </dd>
    </dl>
  );
}

function SummarySection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const levelText = useLevelText();
  const summary = profile.executive_summary;
  if (!summary) return null;
  const level = levelText(summary.confidence, "company.confidence");
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.summary")}</h3>
      <Block className="prose" text={summary.assessment} />
      {level ? <Tag>{level}</Tag> : null}
      <SuitabilityList summary={summary} />
    </section>
  );
}

function AnalysisSection({ areas }: { areas: readonly CompanyAnalysis[] }) {
  const { t } = useI18n();
  if (areas.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.analysis")}</h3>
      {areas.map((area, index) => (
        <Disclosure key={index} label={area.area}>
          {area.assessment ? (
            <p>
              <InlineText text={area.assessment} />
            </p>
          ) : null}
          <Labelled label={t("company.evidence")} text={area.evidence_basis} />
          <Labelled label={t("company.uncertainty")} text={area.key_uncertainty} />
        </Disclosure>
      ))}
    </section>
  );
}

const INSIGHT_GROUPS = [
  ["company.facts", "facts"],
  ["company.interpretations", "interpretations"],
  ["company.uncertainties", "uncertainties"],
] as const;

function InsightsSection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const insights = profile.key_insights;
  if (!insights) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.insights")}</h3>
      <dl className="kv">
        {INSIGHT_GROUPS.filter(([, field]) => insights[field].length > 0).map(([key, field]) => (
          <div key={key} className="kv-row">
            <dt>{t(key)}</dt>
            <dd>
              <TextList items={insights[field]} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RiskItem({ risk }: { risk: CompanyRisk }) {
  const levelText = useLevelText();
  const levels = [
    levelText(risk.probability, "company.probability"),
    levelText(risk.impact, "company.impact"),
  ].filter(Boolean);
  return (
    <li>
      <Block className="prep-q" text={risk.title} />
      {levels.length ? <div className="meta">{levels.join(" · ")}</div> : null}
      <Block className="prep-a" text={risk.description} />
    </li>
  );
}

function RisksSection({ risks }: { risks: readonly CompanyRisk[] }) {
  const { t } = useI18n();
  if (risks.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.risks")}</h3>
      <ul role="list" className="prep-list">
        {risks.map((risk, index) => (
          <RiskItem key={index} risk={risk} />
        ))}
      </ul>
    </section>
  );
}

function ComparisonPoint({ point }: { point: ComparisonPoint }) {
  const heading = [point.dimension, point.relative_position].filter(Boolean).join(": ");
  return (
    <li>
      <Block className="prep-q" text={heading} />
      <Block className="prep-a" text={point.comment} />
    </li>
  );
}

function MarketSection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const market = profile.market_comparison;
  if (!market) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.market")}</h3>
      <Block className="prose" text={market.summary} />
      <ul role="list" className="prep-list">
        {market.comparison_points.map((point, index) => (
          <ComparisonPoint key={index} point={point} />
        ))}
      </ul>
    </section>
  );
}

function SourcesSection({ value }: { value: unknown }) {
  const { t } = useI18n();
  const links = resourceLinks(value).filter(isHttpUrl);
  if (links.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.sources")}</h3>
      <ul role="list" className="plain-list">
        {links.map((link) => (
          <li key={link}>
            <a className="link code" href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
