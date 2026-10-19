"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { channelsQueryOptions, type Channel } from "@/api/notificationChannels";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { sourcesHref } from "@/domain/sources";
import { SectionState } from "@/features/profile/SectionState";
import { useI18n } from "@/i18n/useI18n";
import { CHANNEL_LIST_ERROR } from "./channelText";

const LIST = ", ";

/** Ruling 40: only channels the user still has, by their names, in the source's order. */
function channelNames(platform: Platform, channels: readonly Channel[]): string[] {
  return (platform.notification_channel_ids ?? []).flatMap((id) => {
    const channel = channels.find((entry) => entry.id === id);
    return channel ? [channel.name] : [];
  });
}

interface SourceLinesProps {
  platforms: readonly Platform[];
  channels: readonly Channel[];
}

function SourceLines({ platforms, channels }: SourceLinesProps) {
  const { t } = useI18n();
  const lines = platforms
    .map((platform) => ({ platform, names: channelNames(platform, channels) }))
    .filter(({ names }) => names.length > 0);
  if (lines.length === 0) return <p className="hint">{t("settings.notify.perSourceNone")}</p>;
  return (
    <ul role="list" className="chan-sources">
      {lines.map(({ platform, names }) => (
        <SourceLine key={platform.id} platform={platform} names={names} />
      ))}
    </ul>
  );
}

/** The whole line is the link: its name says which source and which channels it opens. */
function SourceLine({ platform, names }: { platform: Platform; names: string[] }) {
  const { t } = useI18n();
  return (
    <li>
      <Link className="link" href={sourcesHref({ sourceId: platform.id })}>
        {t("settings.notify.perSourceLine", { name: platform.name, channels: names.join(LIST) })}
      </Link>
    </li>
  );
}

/** D9: which source notifies over which channel, each linked to its drawer. */
export function SourceOverview() {
  const { t } = useI18n();
  const platforms = useQuery(platformsQueryOptions());
  const channels = useQuery(channelsQueryOptions());
  return (
    <section className="settings-block" aria-labelledby="settings-per-source-h">
      <h3 id="settings-per-source-h" className="sec-title-sm">
        {t("settings.notify.perSource")}
      </h3>
      <SectionState query={platforms}>
        {(sources) => (
          <SectionState query={channels} errorText={CHANNEL_LIST_ERROR}>
            {(list) => <SourceLines platforms={sources} channels={list} />}
          </SectionState>
        )}
      </SectionState>
    </section>
  );
}
