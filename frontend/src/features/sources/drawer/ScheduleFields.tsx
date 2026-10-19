"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, X } from "lucide-react";
import type { Platform, PlatformSetupRequest } from "@/api/platforms";
import { profileTimezoneQueryOptions } from "@/api/settings";
import {
  DEFAULT_SCHEDULE,
  isScheduleTime,
  MAX_SCHEDULE_TIMES,
  scheduleOf,
  WEEKDAYS,
  type Schedule,
} from "@/domain/schedule";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { CheckField } from "@/ui/Field";
import { focusNextFrame } from "@/ui/focus";
import { Icon } from "@/ui/Icon";
import { WEEKDAY_LABEL } from "../labels";

export interface ScheduleDraft extends Schedule {
  enabled: boolean;
}

export interface ScheduleErrors {
  time?: MessageKey;
  days?: MessageKey;
}

/**
 * "Automatisch durchsuchen" is the one switch (feedback 1, T5): it is on only for an active source
 * with a schedule, so a paused legacy source reads as off.
 */
export function scheduleDraftOf(
  platform: Pick<Platform, "schedule_times" | "schedule_days" | "is_active">,
): ScheduleDraft {
  const schedule = platform.is_active ? scheduleOf(platform) : null;
  return schedule ? { enabled: true, ...schedule } : { enabled: false, ...DEFAULT_SCHEDULE };
}

/** D6: off clears both halves in one request; the server refuses one without the other. */
export function scheduleRequest(
  draft: ScheduleDraft,
): Pick<PlatformSetupRequest, "schedule_times" | "schedule_days"> {
  return draft.enabled
    ? {
        schedule_times: [...draft.times].sort(),
        schedule_days: [...draft.days].sort((a, b) => a - b),
      }
    : { schedule_times: null, schedule_days: null };
}

function timesError(times: readonly string[]): MessageKey | undefined {
  if (times.length === 0 || !times.every(isScheduleTime)) return "sources.error.time";
  return new Set(times).size === times.length ? undefined : "sources.error.timeTwice";
}

export function scheduleErrors(draft: ScheduleDraft): ScheduleErrors {
  if (!draft.enabled) return {};
  return {
    time: timesError(draft.times),
    days: draft.days.length > 0 ? undefined : "sources.error.days",
  };
}

export function hasScheduleErrors(errors: ScheduleErrors): boolean {
  return Boolean(errors.time ?? errors.days);
}

/** The n-th time field's id. */
export function timeFieldId(idPrefix: string, index: number): string {
  return `${idPrefix}-time-${index}`;
}

/** The first time field's id, for a form that moves focus onto a schedule error (ruling 16). */
export function scheduleTimeId(idPrefix: string): string {
  return timeFieldId(idPrefix, 0);
}

/** The first weekday chip's id: where focus goes for an error on the days. */
export function firstDayId(idPrefix: string): string {
  return `${idPrefix}-day-first`;
}

/** Sorted, so switching a day off and on again leaves the draft as it was (not dirty). */
function toggledDays(days: readonly number[], day: number): number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return next.sort((a, b) => a - b);
}

export interface ScheduleFieldsProps {
  idPrefix: string;
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  errors: ScheduleErrors;
}

/** D6, shared by the drawer and the wizard: the one switch, then the times and the weekdays. */
export function ScheduleFields({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="schedule-fields">
      <CheckField
        id={`${idPrefix}-auto`}
        label={t("sources.schedule.auto")}
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled ? (
        <>
          <ScheduleTimes idPrefix={idPrefix} value={value} onChange={onChange} errors={errors} />
          <WeekdayToggles idPrefix={idPrefix} value={value} onChange={onChange} errors={errors} />
        </>
      ) : null}
    </div>
  );
}

/**
 * 1 to MAX_SCHEDULE_TIMES wall times as stored (no conversion); the hint names the zone the
 * scheduler uses. A new time starts empty, so the user picks it instead of accepting a guess.
 */
function ScheduleTimes({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  const zoneHint = useZoneHint();
  const hintId = `${idPrefix}-times-hint`;
  const errorId = `${idPrefix}-times-error`;
  return (
    <fieldset
      className="field schedule-times"
      aria-describedby={errors.time ? `${hintId} ${errorId}` : hintId}
    >
      <legend className="label">{t("sources.schedule.times")}</legend>
      <TimeRows idPrefix={idPrefix} value={value} onChange={onChange} />
      <AddTime idPrefix={idPrefix} value={value} onChange={onChange} />
      <p className="hint" id={hintId}>
        {zoneHint}
      </p>
      {errors.time ? <GroupError id={errorId} message={t(errors.time)} /> : null}
    </fieldset>
  );
}

/** Rows are keyed by position: a time is its value, and an empty new one has none yet. */
function TimeRows({ idPrefix, value, onChange }: Omit<ScheduleFieldsProps, "errors">) {
  return (
    <ul role="list" className="time-list">
      {value.times.map((_, index) => (
        <TimeRow key={index} idPrefix={idPrefix} index={index} value={value} onChange={onChange} />
      ))}
    </ul>
  );
}

interface TimeRowProps extends Omit<ScheduleFieldsProps, "errors"> {
  index: number;
}

function replaced(times: readonly string[], index: number, time: string): string[] {
  return times.map((other, at) => (at === index ? time : other));
}

function TimeRow({ idPrefix, index, value, onChange }: TimeRowProps) {
  const { t } = useI18n();
  return (
    <li className="time-row">
      <input
        id={timeFieldId(idPrefix, index)}
        type="time"
        className="input"
        aria-label={t("sources.schedule.timeN", { n: index + 1 })}
        value={value.times[index]}
        onChange={(event) =>
          onChange({ ...value, times: replaced(value.times, index, event.target.value) })
        }
      />
      {value.times.length > 1 ? (
        <RemoveTime idPrefix={idPrefix} index={index} value={value} onChange={onChange} />
      ) : null}
    </li>
  );
}

/** Removing a time moves focus to the time that takes its place, else the one before. */
function RemoveTime({ idPrefix, index, value, onChange }: TimeRowProps) {
  const { t } = useI18n();
  const remove = () => {
    onChange({ ...value, times: value.times.filter((_, other) => other !== index) });
    const next = Math.min(index, value.times.length - 2);
    focusNextFrame(() => document.getElementById(timeFieldId(idPrefix, next)));
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={X}
      iconOnly
      aria-label={t("sources.schedule.removeTime", { n: index + 1 })}
      onClick={remove}
    />
  );
}

/** At the limit the button gives way to the rule, so nothing inactive is left to explain. */
function AddTime({ idPrefix, value, onChange }: Omit<ScheduleFieldsProps, "errors">) {
  const { t } = useI18n();
  if (value.times.length >= MAX_SCHEDULE_TIMES) {
    return <p className="hint">{t("sources.schedule.timesMax", { max: MAX_SCHEDULE_TIMES })}</p>;
  }
  const add = () => {
    onChange({ ...value, times: [...value.times, ""] });
    focusNextFrame(() => document.getElementById(timeFieldId(idPrefix, value.times.length)));
  };
  return (
    <Button variant="ghost" size="sm" icon={Plus} className="time-add" onClick={add}>
      {t("sources.schedule.addTime")}
    </Button>
  );
}

/** Seven toggles (aria-pressed) in a named group; server index 0 = Monday. */
function WeekdayToggles({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  const errorId = `${idPrefix}-days-error`;
  return (
    <fieldset className="field schedule-days" aria-describedby={errors.days ? errorId : undefined}>
      <legend className="label">{t("sources.schedule.weekdays")}</legend>
      <DayChips idPrefix={idPrefix} value={value} onChange={onChange} />
      {errors.days ? <GroupError id={errorId} message={t(errors.days)} /> : null}
    </fieldset>
  );
}

type DayChipsProps = Pick<ScheduleFieldsProps, "idPrefix" | "value" | "onChange">;

function DayChips({ idPrefix, value, onChange }: DayChipsProps) {
  const { t } = useI18n();
  return (
    <div className="chip-row">
      {WEEKDAYS.map((day, index) => (
        <Chip
          key={day}
          id={index === 0 ? firstDayId(idPrefix) : undefined}
          pressed={value.days.includes(day)}
          onToggle={() => onChange({ ...value, days: toggledDays(value.days, day) })}
        >
          {t(WEEKDAY_LABEL[day]!)}
        </Chip>
      ))}
    </div>
  );
}

/** D6 / G20: the scheduler compares with the profile's zone, so the hint names it. */
function useZoneHint(): string {
  const { t } = useI18n();
  const zone = useQuery(profileTimezoneQueryOptions()).data;
  return zone ? t("sources.schedule.zone", { zone }) : t("sources.schedule.zoneUnknown");
}

/** The markup of ui/Field's error (icon and words, role="alert"), for a group without one control. */
export function GroupError({ id, message }: { id: string; message: string }) {
  return (
    <p className="field-error" id={id} role="alert">
      <Icon icon={CircleAlert} />
      <span>{message}</span>
    </p>
  );
}
