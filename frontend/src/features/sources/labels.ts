import type { InitialRun, NotifyChannel } from "@/api/platformPaths";
import type { Schedule } from "@/domain/schedule";
import { dayRuns, type SourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

export const SOURCE_STATE_LABEL: Readonly<Record<SourceState, MessageKey>> = {
  running: "sources.state.running",
  setup: "sources.state.setup",
  paused: "sources.state.paused",
  failing: "sources.state.failing",
  ok: "sources.state.ok",
};

export const CHANNEL_LABEL: Readonly<Record<NotifyChannel, MessageKey>> = {
  PUSHOVER: "sources.channel.pushover",
  RESEND: "sources.channel.resend",
  MAILJET: "sources.channel.mailjet",
  SMTP: "sources.channel.smtp",
};

export const INITIAL_RUN_LABEL: Readonly<
  Record<InitialRun, { title: MessageKey; hint: MessageKey }>
> = {
  seed: { title: "sources.first.seed", hint: "sources.first.seedHint" },
  analyze: { title: "sources.first.analyze", hint: "sources.first.analyzeHint" },
  none: { title: "sources.first.none", hint: "sources.first.noneHint" },
};

export const WEEKDAY_LABEL: readonly MessageKey[] = [
  "weekday.0",
  "weekday.1",
  "weekday.2",
  "weekday.3",
  "weekday.4",
  "weekday.5",
  "weekday.6",
];

const ALL_DAYS = 7;
const RANGE_FROM = 3;
// Punctuation, not words: the same in both languages.
const RANGE = "–";
const LIST = ", ";

function runText([first, last]: [number, number], t: Translate): string {
  const day = (index: number) => t(WEEKDAY_LABEL[index]!);
  if (last - first + 1 >= RANGE_FROM) return `${day(first)}${RANGE}${day(last)}`;
  return first === last ? day(first) : `${day(first)}${LIST}${day(last)}`;
}

/** D6: "Mo–Fr 08:00", "Mo, Mi 07:30", "täglich 06:00", "Nur manuell". */
export function scheduleText(schedule: Schedule | null, t: Translate): string {
  if (!schedule) return t("sources.schedule.manual");
  if (schedule.days.length === ALL_DAYS)
    return t("sources.schedule.daily", { time: schedule.time });
  const days = dayRuns(schedule.days)
    .map((run) => runText(run, t))
    .join(LIST);
  return t("sources.schedule.days", { days, time: schedule.time });
}
