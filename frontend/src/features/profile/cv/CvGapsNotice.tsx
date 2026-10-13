"use client";

import Link from "next/link";
import type { Profile } from "@/api/profile";
import { cvGaps, profileHref, type CvGap } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";

const GAP_LABEL: Readonly<Record<CvGap, MessageKey>> = {
  role: "profile.gap.role",
  skills: "profile.gap.skills",
  experience: "profile.gap.experience",
  results: "profile.gap.results",
  education: "profile.gap.education",
};
const GOAL_GAPS: readonly CvGap[] = ["role", "skills"];
const RESULT_GAPS: readonly CvGap[] = ["experience", "results"];

/** Ruling R14 (d): the "without results" warning only where results are what is missing. */
function whyItMatters(gaps: readonly CvGap[]): MessageKey {
  return gaps.some((gap) => RESULT_GAPS.includes(gap))
    ? "profile.cv.gapsResults"
    : "profile.cv.gapsNeutral";
}

/**
 * D7 / usability #26: what the AI misses, read from the stored profile (not the draft). Amber: a
 * thin CV weakens every rating but is no error (spec 5).
 */
export function CvGapsNotice({ profile }: { profile: Profile }) {
  const { t, language } = useI18n();
  const gaps = cvGaps(profile);
  if (gaps.length === 0) return null;
  const list = new Intl.ListFormat(language, { type: "conjunction" }).format(
    gaps.map((gap) => t(GAP_LABEL[gap])),
  );
  const inGoal = gaps.some((gap) => GOAL_GAPS.includes(gap));
  return (
    <Notice tone="warn">
      {t("profile.cv.gaps", { list })} {t(whyItMatters(gaps))}{" "}
      {inGoal ? (
        <Link className="link" href={profileHref("ziel")}>
          {t("profile.cv.toGoal")}
        </Link>
      ) : null}
    </Notice>
  );
}
