"use client";

import type { CrawlProgress } from "@/api/crawlProgress";
import { crawlStations, type StationKey, type StationState } from "@/domain/crawlStages";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";

const STATION_LABEL: Readonly<Record<StationKey, MessageKey>> = {
  found: "activity.station.found",
  new: "activity.station.new",
  fetched: "activity.station.fetched",
  analysed: "activity.station.analysed",
};

// The same words as the read-only Stepper, so a screen reader hears one vocabulary for progress.
const STATE_TEXT: Readonly<Record<StationState, MessageKey>> = {
  done: "step.past",
  current: "step.current",
  open: "step.future",
};

const UNKNOWN_COUNT = "–";

/** The crawl's timeline found -> new -> fetched -> analysed with the count of each station. */
export function CrawlStations({ progress }: { progress: CrawlProgress | undefined }) {
  const { t } = useI18n();
  const stations = crawlStations(progress);
  if (!stations) return null;
  return (
    <ol role="list" className="crawl-stations" aria-label={t("activity.stations")}>
      {stations.map((station) => (
        <li key={station.key} className={cx("station", `station-${station.state}`)}>
          <span className="station-n">{station.count ?? UNKNOWN_COUNT}</span>
          <span className="station-label">{t(STATION_LABEL[station.key])}</span>
          <span className="sr-only">{t(STATE_TEXT[station.state])}</span>
        </li>
      ))}
    </ol>
  );
}
