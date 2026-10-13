"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import {
  notificationSettingsQueryOptions,
  type NotificationSettings,
} from "@/api/notificationSettings";
import { emailProblem, type ChannelProblem } from "@/domain/notificationChannels";
import { SectionState } from "@/features/profile/SectionState";
import { useReportDirty } from "@/features/profile/useReportDirty";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { PROBLEM_TEXT } from "./ChannelFields";
import { toNotificationField, useChannelSave } from "./useChannelSave";

const RECIPIENT_FIELD = "email_global_recipient";
type RecipientDraft = Record<typeof RECIPIENT_FIELD, string>;

const refusedHere = (error: unknown) =>
  fieldErrorsFrom(error, toNotificationField).includes(RECIPIENT_FIELD);

interface RecipientBodyProps {
  settings: NotificationSettings;
  report: ReportDirty;
}

interface RecipientSave {
  form: SectionForm<RecipientDraft>;
  save: ReturnType<typeof useChannelSave>;
  setProblem: (problem: ChannelProblem | null) => void;
}

/** D7, ruling 41: the shape is checked first; empty saves null (the server refuses ""). */
function submitRecipient({ form, save, setProblem }: RecipientSave) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.draft[RECIPIENT_FIELD].trim();
    const found = emailProblem(trimmed);
    setProblem(found);
    if (found || !form.dirty) return;
    save.mutate(
      { [RECIPIENT_FIELD]: trimmed || null },
      {
        onSuccess: () => form.commit({ [RECIPIENT_FIELD]: trimmed }),
        onError: (error) => setProblem(refusedHere(error) ? "email" : null),
      },
    );
  };
}

function useRecipientForm({ settings, report }: RecipientBodyProps) {
  const { t } = useI18n();
  const form = useSectionForm<RecipientDraft>({
    [RECIPIENT_FIELD]: settings.email_global_recipient,
  });
  const save = useChannelSave(t("sources.saved"));
  const [problem, setProblem] = useState<ChannelProblem | null>(null);
  useReportDirty(report, "recipient", form.dirty);
  return {
    form,
    problem,
    submit: submitRecipient({ form, save, setProblem }),
    busy: save.isPending,
  };
}

interface RecipientFieldProps {
  form: SectionForm<RecipientDraft>;
  problem: ChannelProblem | null;
}

function RecipientField({ form, problem }: RecipientFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id="settings-recipient-email"
      type="email"
      inputMode="email"
      autoComplete="email"
      label={t("settings.notify.recipientEmail")}
      hint={t("settings.notify.recipientHint")}
      value={form.draft[RECIPIENT_FIELD]}
      onChange={(event) => form.set({ [RECIPIENT_FIELD]: event.target.value })}
      error={problem ? t(PROBLEM_TEXT[problem]) : undefined}
    />
  );
}

function RecipientBody(props: RecipientBodyProps) {
  const { t } = useI18n();
  const { form, problem, submit, busy } = useRecipientForm(props);
  return (
    <DrawerSection
      id="settings-recipient"
      title={t("settings.notify.recipient")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <RecipientField form={form} problem={problem} />
    </DrawerSection>
  );
}

/** The stored address that email tests fall back to without a recipient of their own. */
export function RecipientForm({ report }: { report: ReportDirty }) {
  const query = useQuery(notificationSettingsQueryOptions());
  return (
    <SectionState query={query}>
      {(settings) => <RecipientBody settings={settings} report={report} />}
    </SectionState>
  );
}
