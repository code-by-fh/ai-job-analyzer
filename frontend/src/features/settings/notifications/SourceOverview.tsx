"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { NOTIFY_CHANNELS, type NotifyChannel } from "@/api/platformPaths";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { sourcesHref } from "@/domain/sources";
import { SectionState } from "@/features/profile/SectionState";
import { CHANNEL_LABEL } from "@/features/sources/labels";
import { useI18n } from "@/i18n/useI18n";

const LIST = ", ";

/** Ruling 40: only known channels, in the app's order and words; never a raw enum. */
function channelsOf(platform: Platform): NotifyChannel[] {
  const adapters = platform.notification_adapters ?? [];
  return NOTIFY_CHANNELS.filter((channel) => adapters.includes(channel));
}

function SourceLine({ platform }: { platform: Platform }) {
  const { t } = useI18n();
  const channels = channelsOf(platform)
    .map((channel) => t(CHANNEL_LABEL[channel]))
    .join(LIST);
  // The whole line is the link: its name says which source and which channels it opens.
  return (
    <li>
      <Link className="link" href={sourcesHref({ sourceId: platform.id })}>
        {t("settings.notify.perSourceLine", { name: platform.name, channels })}
      </Link>
    </li>
  );
}

function SourceLines({ platforms }: { platforms: Platform[] }) {
  const { t } = useI18n();
  const notifying = platforms.filter((platform) => channelsOf(platform).length > 0);
  if (notifying.length === 0) return <p className="hint">{t("settings.notify.perSourceNone")}</p>;
  return (
    <ul role="list" className="chan-sources">
      {notifying.map((platform) => (
        <SourceLine key={platform.id} platform={platform} />
      ))}
    </ul>
  );
}

/** D9: which source notifies over which channel, each linked to its drawer. */
export function SourceOverview() {
  const { t } = useI18n();
  const query = useQuery(platformsQueryOptions());
  return (
    <section className="settings-block" aria-labelledby="settings-per-source-h">
      <h3 id="settings-per-source-h" className="sec-title-sm">
        {t("settings.notify.perSource")}
      </h3>
      <SectionState query={query}>
        {(platforms) => <SourceLines platforms={platforms} />}
      </SectionState>
    </section>
  );
}
