"use client";

import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import type { NotificationSettings } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import { CHANNEL_FIELDS } from "@/api/settingsPaths";
import {
  channelDetail,
  channelDraftOf,
  channelErrors,
  channelPatch,
  type ChannelDraft,
} from "@/domain/notificationChannels";
import { useReportDirty } from "@/features/profile/useReportDirty";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import { CHANNEL_LABEL } from "@/features/sources/labels";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { closeThenFocus } from "@/ui/focus";
import { Icon } from "@/ui/Icon";
import type { ChannelFieldErrors } from "./ChannelFields";
import { ChannelForm } from "./ChannelForm";
import { ChannelTest } from "./ChannelTest";
import { RemoveChannelDialog } from "./RemoveChannelDialog";
import { toNotificationField, useChannelSave } from "./useChannelSave";

export interface ChannelRowProps {
  channel: NotifyChannel;
  settings: NotificationSettings;
  /** GET /notification-settings/channels: the same booleans the source drawer uses (D5). */
  configured: boolean;
  open: boolean;
  /** Opens, closes or switches; the list asks first when the open form is dirty (ruling 42). */
  onToggle: (channel: NotifyChannel) => void;
  onClose: () => void;
  report: ReportDirty;
}

const rowId = (channel: NotifyChannel, part: string) =>
  `settings-chan-${channel.toLowerCase()}-${part}`;

const toggleOf = (channel: NotifyChannel) => document.getElementById(rowId(channel, "toggle"));
const focusToggle = (channel: NotifyChannel) => toggleOf(channel)?.focus();

/** Ruling 40: removal is offered as soon as any field of the channel is stored. */
function hasStoredField(channel: NotifyChannel, settings: NotificationSettings): boolean {
  return CHANNEL_FIELDS[channel].some((field) => Boolean(settings[field]));
}

/** The server's limits refused a field; the shape refusals were caught before sending. */
function serverErrors(error: unknown, channel: NotifyChannel): ChannelFieldErrors {
  const own = new Set<string>(CHANNEL_FIELDS[channel]);
  const fields = fieldErrorsFrom(error, toNotificationField).filter((field) => own.has(field));
  return Object.fromEntries(fields.map((field) => [field, "tooLong"])) as ChannelFieldErrors;
}

/**
 * Ruling 24: the row owns the draft, so "Testen" sees it. A closed form drops its draft and errors
 * (previous-value pattern), whoever closed it; a typed secret leaves React state with it (5.3).
 */
function useChannelDraft(row: ChannelRowProps) {
  const { channel, settings, open, report } = row;
  const stored = channelDraftOf(channel, settings);
  const form = useSectionForm(stored, (draft) => channelPatch(channel, draft, settings));
  const [errors, setErrors] = useState<ChannelFieldErrors>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      form.commit(stored);
      setErrors({});
    }
  }
  useReportDirty(report, `chan-${channel}`, form.dirty);
  return { form, errors, setErrors };
}

interface SubmitDeps {
  row: ChannelRowProps;
  form: SectionForm<ChannelDraft>;
  setErrors: (errors: ChannelFieldErrors) => void;
}

/** Client checks first (ruling 14); after a save focus goes to the toggle before the form unmounts. */
function useChannelSubmit({ row, form, setErrors }: SubmitDeps) {
  const { t } = useI18n();
  const save = useChannelSave(t("sources.saved"));
  const { channel, settings } = row;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.dirty) return;
    const found = channelErrors({ channel, draft: form.draft, settings });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(channelPatch(channel, form.draft, settings), {
      onSuccess: () => {
        focusToggle(channel);
        row.onClose();
      },
      onError: (error) => setErrors(serverErrors(error, channel)),
    });
  };
  return { submit, busy: save.isPending };
}

function ChannelState({ channel, settings, configured }: ChannelRowProps) {
  const { t } = useI18n();
  if (!configured) return <p className="chan-state">{t("settings.notify.notConfigured")}</p>;
  const detail = channelDetail(channel, settings);
  return (
    <p className="chan-state on">
      <Icon icon={Check} />
      {detail ? t("settings.notify.configuredDetail", { detail }) : t("settings.notify.configured")}
    </p>
  );
}

/** Visible "Ändern"/"Einrichten"/"Schließen"; the accessible name adds the channel. */
function ChannelToggle({ row }: { row: ChannelRowProps }) {
  const { t } = useI18n();
  const { channel, configured, open } = row;
  const name = t(CHANNEL_LABEL[channel]);
  const closedLabel = configured ? "settings.notify.changeLabel" : "settings.notify.setUpLabel";
  const closedText = configured ? "settings.notify.change" : "settings.notify.setUp";
  return (
    <Button
      id={rowId(channel, "toggle")}
      size="sm"
      aria-label={t(open ? "settings.notify.closeLabel" : closedLabel, { channel: name })}
      aria-expanded={open}
      aria-controls={open ? rowId(channel, "form") : undefined}
      onClick={() => row.onToggle(channel)}
    >
      {open ? t("dialog.close") : t(closedText)}
    </Button>
  );
}

interface OpenFormProps {
  row: ChannelRowProps;
  draft: ReturnType<typeof useChannelDraft>;
}

/** Ruling 20: after removal the form closes and focus lands on the toggle one frame later. */
function useRemoval(row: ChannelRowProps) {
  const [removing, setRemoving] = useState(false);
  // Ruling 20: the opener of "Kanal entfernen" is gone with the form, so the toggle takes focus.
  const close = () => {
    setRemoving(false);
    row.onClose();
  };
  const removed = () => closeThenFocus(close, () => toggleOf(row.channel));
  return { removing, ask: () => setRemoving(true), cancel: () => setRemoving(false), removed };
}

interface PendingRemovalProps {
  channel: NotifyChannel;
  removal: ReturnType<typeof useRemoval>;
}

function PendingRemoval({ channel, removal }: PendingRemovalProps) {
  if (!removal.removing) return null;
  return (
    <RemoveChannelDialog channel={channel} onRemoved={removal.removed} onClose={removal.cancel} />
  );
}

function OpenForm({ row, draft }: OpenFormProps) {
  const { channel, settings } = row;
  const removal = useRemoval(row);
  const { submit, busy } = useChannelSubmit({ row, ...draft });
  return (
    <div className="chan-form" id={rowId(channel, "form")}>
      <ChannelForm
        {...{ channel, settings, busy }}
        form={draft.form}
        errors={draft.errors}
        onSubmit={submit}
        nameId={rowId(channel, "name")}
        onRemove={hasStoredField(channel, settings) ? removal.ask : undefined}
      />
      <PendingRemoval channel={channel} removal={removal} />
    </div>
  );
}

function RowActions({ row, dirty }: { row: ChannelRowProps; dirty: boolean }) {
  return (
    <div className="chan-actions">
      {row.configured ? (
        <ChannelTest
          channel={row.channel}
          dirty={dirty}
          fallback={row.settings.email_global_recipient}
        />
      ) : null}
      <ChannelToggle row={row} />
    </div>
  );
}

/** D5, prototype .chan: name, state line, "Testen" when set up, and the inline form below. */
export function ChannelRow(row: ChannelRowProps) {
  const { t } = useI18n();
  const draft = useChannelDraft(row);
  return (
    <li className="chan">
      <div>
        <p className="chan-name" id={rowId(row.channel, "name")}>
          {t(CHANNEL_LABEL[row.channel])}
        </p>
        <ChannelState {...row} />
      </div>
      <RowActions row={row} dirty={draft.form.dirty} />
      {row.open ? <OpenForm row={row} draft={draft} /> : null}
    </li>
  );
}
