"use client";

import { Play } from "lucide-react";
import { useId } from "react";
import type { Platform } from "@/api/platforms";
import { canCrawl, type SourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { crawlCancelId, crawlStartId, useFocusHandoff, type CrawlPlace } from "./crawlFocus";
import { PROFILE_REQUIRED_ID, useProfileMissing } from "../profileGate";
import { useStartCrawl } from "./useCrawlActions";

const WHY_NOT: Partial<Record<SourceState, MessageKey>> = {
  running: "sources.crawl.why.running",
  paused: "sources.crawl.why.paused",
  setup: "sources.crawl.why.setup",
};

const START_LOOK = { variant: "ghost", size: "sm", icon: Play, iconOnly: true } as const;

interface CrawlButtonProps {
  platform: Platform;
  state: SourceState;
  place?: CrawlPlace;
}

/**
 * D4: an icon button in its own cell; inactive (still focusable) with the stated reason while the
 * source runs, is paused or is not set up.
 */
export function CrawlButton({ platform, state, place = "row" }: CrawlButtonProps) {
  const { t } = useI18n();
  const start = useStartCrawl(platform);
  const whyNot = useWhyNot(state);
  const ref = useFocusHandoff<HTMLSpanElement>(crawlCancelId(platform.id, place));
  return (
    <span ref={ref} className="crawl-start">
      <Button
        id={crawlStartId(platform.id, place)}
        {...START_LOOK}
        aria-label={t("sources.crawl.start", { name: platform.name })}
        {...whyNot.described}
        // No spinner: the row's "Läuft" tag is its one moving element (spec 5).
        inactive={whyNot.blocked || start.isPending}
        aria-busy={start.isPending || undefined}
        onClick={start.start}
      />
      {whyNot.note}
    </span>
  );
}

/** The reason Durchsuchen is inactive: in the tooltip and, for screen readers, as its description. */
function useWhyNot(state: SourceState) {
  const { t } = useI18n();
  const id = useId();
  const profileMissing = useProfileMissing();
  const reason = canCrawl(state) ? undefined : WHY_NOT[state];
  if (!reason && profileMissing) {
    // The page's visible notice is the description, so nothing is read twice.
    const described = {
      "aria-describedby": PROFILE_REQUIRED_ID,
      title: t("sources.crawl.why.profile"),
    };
    return { blocked: true, described, note: null };
  }
  if (!reason) return { blocked: false, described: {}, note: null };
  const note = (
    <span id={id} className="sr-only">
      {t(reason)}
    </span>
  );
  return { blocked: true, described: { "aria-describedby": id, title: t(reason) }, note };
}
