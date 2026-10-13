"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import type { Platform, PlatformPatch } from "@/api/platforms";
import { profileTimezoneQueryOptions } from "@/api/settings";
import {
  DEFAULT_SCHEDULE,
  isScheduleTime,
  scheduleOf,
  WEEKDAYS,
  type Schedule,
} from "@/domain/schedule";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Chip } from "@/ui/Chip";
import { CheckField, TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { WEEKDAY_LABEL } from "../labels";

export interface ScheduleDraft extends Schedule {
  enabled: boolean;
}

export interface ScheduleErrors {
  time?: MessageKey;
  days?: MessageKey;
}

export function scheduleDraftOf(
  platform: Pick<Platform, "schedule_time" | "schedule_days">,
): ScheduleDraft {
  const schedule = scheduleOf(platform);
  return schedule ? { enabled: true, ...schedule } : { enabled: false, ...DEFAULT_SCHEDULE };
}

/** D6: off clears both halves in one request; the server refuses one without the other. */
export function schedulePatch(
  draft: ScheduleDraft,
): Pick<PlatformPatch, "schedule_time" | "schedule_days"> {
  return draft.enabled
    ? { schedule_time: draft.time, schedule_days: [...draft.days].sort((a, b) => a - b) }
    : { schedule_time: null, schedule_days: null };
}

export function scheduleErrors(draft: ScheduleDraft): ScheduleErrors {
  if (!draft.enabled) return {};
  return {
    time: isScheduleTime(draft.time) ? undefined : "sources.error.time",
    days: draft.days.length > 0 ? undefined : "sources.error.days",
  };
}

export function hasScheduleErrors(errors: ScheduleErrors): boolean {
  return Boolean(errors.time ?? errors.days);
}

/** The time field's id, for a form that moves focus onto a schedule error (ruling 16). */
export function scheduleTimeId(idPrefix: string): string {
  return `${idPrefix}-time`;
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

/** D6, shared by the drawer and the wizard (Task 13): a check, then time and weekdays. */
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
          <ScheduleTime idPrefix={idPrefix} value={value} onChange={onChange} errors={errors} />
          <WeekdayToggles idPrefix={idPrefix} value={value} onChange={onChange} errors={errors} />
        </>
      ) : null}
    </div>
  );
}

/** Wall time as stored (no conversion); the hint names the zone the scheduler uses. */
function ScheduleTime({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={scheduleTimeId(idPrefix)}
      type="time"
      label={t("sources.schedule.time")}
      hint={useZoneHint()}
      value={value.time}
      onChange={(event) => onChange({ ...value, time: event.target.value })}
      error={errors.time ? t(errors.time) : undefined}
    />
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
