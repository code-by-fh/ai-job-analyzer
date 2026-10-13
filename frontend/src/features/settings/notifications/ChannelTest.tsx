"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { sendSettingsTest, type SettingsTest } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import { emailProblem, type ChannelProblem } from "@/domain/notificationChannels";
import { TestButton, testErrorKey } from "@/features/sources/drawer/ChannelRow";
import { isEmailChannel } from "@/features/sources/drawer/notifyDraft";
import { CHANNEL_LABEL } from "@/features/sources/labels";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { PROBLEM_TEXT } from "./ChannelFields";

const RECIPIENT_FIELD = "recipient";
const RECIPIENT_ID = "settings-test-recipient";

/** The 422 of a test names only the recipient; it shows on the dialog's field. */
const recipientRefused = (error: unknown) =>
  fieldErrorsFrom(error, (field) => (field === RECIPIENT_FIELD ? field : null)).length > 0;

function useChannelTest(channel: NotifyChannel) {
  const { t } = useI18n();
  const toast = useToast();
  const name = t(CHANNEL_LABEL[channel]);
  return useMutation({
    mutationFn: (test: SettingsTest) => sendSettingsTest(test),
    // The toast never repeats the address (ruling 41).
    onSuccess: () =>
      toast.show({ tone: "success", message: t("sources.notify.testSent", { channel: name }) }),
    onError: (error) => {
      if (!recipientRefused(error))
        toast.show({ tone: "error", message: t(testErrorKey(error), { channel: name }) });
    },
  });
}

type ChannelTestMutation = ReturnType<typeof useChannelTest>;

/** Empty is allowed only when a default is stored: the server falls back to it (D6). */
function recipientProblem(value: string, fallback: string): ChannelProblem | null {
  if (value.trim() === "" && fallback === "") return "required";
  return emailProblem(value);
}

interface TestEmailDialogProps {
  channel: NotifyChannel;
  fallback: string;
  test: ChannelTestMutation;
  onClose: () => void;
}

/** Ruling 41: checked before sending; a 422 on the recipient lands on the same field. */
function useTestRecipient({ channel, fallback, test, onClose }: TestEmailDialogProps) {
  const [recipient, setRecipient] = useState(fallback);
  const [problem, setProblem] = useState<ChannelProblem | null>(null);
  const send = () => {
    const found = recipientProblem(recipient, fallback);
    setProblem(found);
    if (found) return;
    test.mutate(
      { channel, recipient },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (recipientRefused(error)) setProblem("email");
        },
      },
    );
  };
  const field = { value: recipient, hasFallback: fallback !== "", onChange: setRecipient, problem };
  return { field, send };
}

interface RecipientFieldProps {
  value: string;
  /** "Leave empty for the default" only helps when a default is stored. */
  hasFallback: boolean;
  onChange: (value: string) => void;
  problem: ChannelProblem | null;
}

function RecipientField({ value, hasFallback, onChange, problem }: RecipientFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={RECIPIENT_ID}
      data-autofocus
      type="email"
      inputMode="email"
      autoComplete="off"
      label={t("settings.notify.testRecipient")}
      hint={hasFallback ? t("settings.notify.testRecipientHint") : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={problem ? t(PROBLEM_TEXT[problem]) : undefined}
    />
  );
}

/** D6: the recipient is prefilled with the stored default; the dialog closes on success. */
function TestEmailDialog(props: TestEmailDialogProps) {
  const { t } = useI18n();
  const { field, send } = useTestRecipient(props);
  return (
    <ConfirmDialog
      title={t("settings.notify.testTitle")}
      confirmLabel={t("settings.notify.testSend")}
      tone="primary"
      busy={props.test.isPending}
      onConfirm={send}
      onClose={props.onClose}
    >
      <RecipientField {...field} />
    </ConfirmDialog>
  );
}

export interface ChannelTestProps {
  channel: NotifyChannel;
  /** The open form holds edits: a test would send the stored state, not what is shown (D6). */
  dirty: boolean;
  /** The stored default recipient, "" when none. */
  fallback: string;
}

/** D6: Pushover sends at once; an email channel asks for the recipient first. */
export function ChannelTest({ channel, dirty, fallback }: ChannelTestProps) {
  const test = useChannelTest(channel);
  const [asking, setAsking] = useState(false);
  const start = () => (isEmailChannel(channel) ? setAsking(true) : test.mutate({ channel }));
  return (
    <>
      <TestButton channel={channel} dirty={dirty} busy={test.isPending} onClick={start} />
      {asking ? (
        <TestEmailDialog
          channel={channel}
          fallback={fallback}
          test={test}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}
