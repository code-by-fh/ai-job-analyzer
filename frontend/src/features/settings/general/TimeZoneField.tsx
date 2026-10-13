"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, type RefObject } from "react";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { profileTimezoneQueryOptions, saveTimezone } from "@/api/settings";
import { DEFAULT_TIMEZONE, timeZoneOptions } from "@/domain/settings";
import { SectionState } from "@/features/profile/SectionState";
import { useI18n } from "@/i18n/useI18n";
import { SelectField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";

const SUPPORTED_ZONES: readonly string[] = Intl.supportedValuesOf("timeZone");

/** Review I1: only the latest choice's answer counts; a superseded save is ignored, a failed one too. */
function useLatestAnswer(latest: RefObject<string | null>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return {
    // The server may store its fallback instead of the zone sent; the cache takes what it answered.
    onSuccess: (stored: string, sent: string) => {
      if (sent !== latest.current) return;
      queryClient.setQueryData(queryKeys.profileTimezone, stored);
      toast.show({ tone: "success", message: t("settings.general.timezoneSaved") });
    },
    onError: (error: Error, sent: string) => {
      if (sent === latest.current) toast.show({ tone: "error", message: describeError(error, t) });
    },
  };
}

function useTimezoneSave() {
  const latest = useRef<string | null>(null);
  const answer = useLatestAnswer(latest);
  const save = useMutation({ mutationFn: saveTimezone, ...answer });
  const choose = (zone: string) => {
    latest.current = zone;
    save.mutate(zone);
  };
  return { save, choose };
}

function ZoneOptions({ zone }: { zone: string }) {
  return timeZoneOptions(zone, SUPPORTED_ZONES).map((option) => (
    <option key={option} value={option}>
      {option}
    </option>
  ));
}

/**
 * Preflight ruling 37: the select shows the pending zone while saving and the stored one
 * otherwise, so a failed save falls back by itself. aria-busy instead of disabled keeps the focus
 * on the select (ruling 20).
 */
function ZoneSelect({ stored }: { stored: string }) {
  const { t } = useI18n();
  const { save, choose } = useTimezoneSave();
  const zone = save.isPending ? save.variables : stored;
  return (
    <SelectField
      id="settings-timezone"
      label={t("settings.general.timezone")}
      hint={t("settings.general.timezoneHint")}
      value={zone}
      aria-busy={save.isPending || undefined}
      onChange={(event) => choose(event.target.value)}
    >
      <ZoneOptions zone={zone} />
    </SelectField>
  );
}

/** D3: the time zone is saved at once on change; it is editable only once the stored one is known. */
export function TimeZoneField() {
  const query = useQuery(profileTimezoneQueryOptions());
  return (
    <SectionState query={query}>
      {(stored) => <ZoneSelect stored={stored ?? DEFAULT_TIMEZONE} />}
    </SectionState>
  );
}
