"use client";

import { useState, type FormEvent } from "react";
import type { Channel, ChannelType } from "@/api/notificationChannels";
import {
  channelDraftOf,
  channelProblems,
  hasProblems,
  labelIn,
  updateChange,
  type ChannelProblems,
} from "@/domain/notificationChannels";
import { useReportDirty } from "@/features/profile/useReportDirty";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { closeThenFocus } from "@/ui/focus";
import { ChannelForm } from "./ChannelForm";
import { ChannelTest } from "./ChannelTest";
import { DeleteChannelDialog } from "./DeleteChannelDialog";
import { refusedProblems, useUpdateChannel } from "./useChannelSave";

export interface ChannelRowProps {
  channel: Channel;
  /** The channel's type from the service, or undefined when the service no longer offers it. */
  type: ChannelType | undefined;
  open: boolean;
  /** Opens, closes or switches; the list asks first when the open form is dirty (ruling 42). */
  onToggle: (id: string) => void;
  onClose: () => void;
  report: ReportDirty;
  /** Where focus goes once the channel is deleted (its row is gone). */
  afterDelete: () => HTMLElement | null;
}

const NO_PROBLEMS: ChannelProblems = { fields: {} };

export const rowId = (id: string, part: string) => `settings-chan-${id}-${part}`;

const toggleOf = (id: string) => document.getElementById(rowId(id, "toggle"));

/** A type the service no longer offers still keeps its name editable and can be deleted. */
function typeOrBare(row: ChannelRowProps): ChannelType {
  const { channel, type } = row;
  return type ?? { id: channel.type, label: { de: channel.type, en: channel.type }, fields: [] };
}

/**
 * Ruling 24: the row owns the draft, so its test sees it. A closed form drops its draft and errors
 * (previous-value pattern), whoever closed it; a typed secret leaves React state with it (5.3).
 */
function useChannelDraft(row: ChannelRowProps) {
  const { channel, open, report } = row;
  const type = typeOrBare(row);
  const stored = channelDraftOf(type, channel);
  const form = useSectionForm(stored, (draft) => updateChange(type, draft, channel));
  const [problems, setProblems] = useState<ChannelProblems>(NO_PROBLEMS);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      form.commit(stored);
      setProblems(NO_PROBLEMS);
    }
  }
  useReportDirty(report, `chan-${channel.id}`, form.dirty);
  return { type, form, problems, setProblems };
}

type ChannelDraftState = ReturnType<typeof useChannelDraft>;

/** The toggle stays, so it takes focus before the form (and the focused field) goes away. */
function focusToggleThenClose(row: ChannelRowProps): void {
  toggleOf(row.channel.id)?.focus();
  row.onClose();
}

/** Client checks first; after a save focus goes to the toggle before the form unmounts. */
function useChannelSubmit(row: ChannelRowProps, draft: ChannelDraftState) {
  const save = useUpdateChannel();
  const { channel } = row;
  const { type, form, setProblems } = draft;
  const done = {
    onSuccess: () => focusToggleThenClose(row),
    onError: (error: unknown) => setProblems(refusedProblems(error) ?? NO_PROBLEMS),
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.dirty) return;
    const found = channelProblems(type, form.draft, channel);
    setProblems(found);
    if (hasProblems(found)) return;
    save.mutate({ id: channel.id, change: updateChange(type, form.draft, channel) }, done);
  };
  return { onSubmit: submit, busy: save.isPending };
}

function ChannelState({ type }: { type: ChannelType | undefined }) {
  const { t, language } = useI18n();
  return (
    <p className="chan-state">
      {type ? labelIn(type.label, language) : t("settings.notify.typeUnknown")}
    </p>
  );
}

/** Visible "Bearbeiten"/"Schließen"; the accessible name adds the channel's name. */
function ChannelToggle({ row }: { row: ChannelRowProps }) {
  const { t } = useI18n();
  const { channel, open } = row;
  const params = { channel: channel.name };
  return (
    <Button
      id={rowId(channel.id, "toggle")}
      size="sm"
      aria-label={t(open ? "settings.notify.closeLabel" : "settings.notify.editLabel", params)}
      aria-expanded={open}
      aria-controls={open ? rowId(channel.id, "form") : undefined}
      onClick={() => row.onToggle(channel.id)}
    >
      {open ? t("dialog.close") : t("settings.notify.edit")}
    </Button>
  );
}

/** Ruling 20: after the delete the row is gone, so focus lands on `afterDelete` one frame later. */
function useDeletion(row: ChannelRowProps) {
  const [deleting, setDeleting] = useState(false);
  const close = () => {
    setDeleting(false);
    row.onClose();
  };
  const deleted = () => closeThenFocus(close, row.afterDelete);
  return { deleting, ask: () => setDeleting(true), cancel: () => setDeleting(false), deleted };
}

interface OpenFormProps {
  row: ChannelRowProps;
  draft: ChannelDraftState;
}

function OpenForm({ row, draft }: OpenFormProps) {
  const { channel } = row;
  const deletion = useDeletion(row);
  const { type, form, problems } = draft;
  const fields = { type, form, problems, storedSecrets: channel.secrets };
  return (
    <div className="chan-form" id={rowId(channel.id, "form")}>
      <ChannelForm
        id={rowId(channel.id, "field")}
        {...fields}
        {...useChannelSubmit(row, draft)}
        nameId={rowId(channel.id, "name")}
      >
        <DeleteButton onClick={deletion.ask} />
      </ChannelForm>
      <PendingDeletion channel={channel} deletion={deletion} />
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button className="chan-remove" variant="ghost" size="sm" onClick={onClick}>
      {t("settings.notify.delete")}
    </Button>
  );
}

interface PendingDeletionProps {
  channel: Channel;
  deletion: ReturnType<typeof useDeletion>;
}

function PendingDeletion({ channel, deletion }: PendingDeletionProps) {
  if (!deletion.deleting) return null;
  return (
    <DeleteChannelDialog channel={channel} onDeleted={deletion.deleted} onClose={deletion.cancel} />
  );
}

/** D5, prototype .chan: name, type, the test send, and the inline form below. */
export function ChannelRow(row: ChannelRowProps) {
  const draft = useChannelDraft(row);
  return (
    <li className="chan">
      <div>
        <p className="chan-name" id={rowId(row.channel.id, "name")}>
          {row.channel.name}
        </p>
        <ChannelState type={row.type} />
      </div>
      <div className="chan-actions">
        <ChannelTest channel={row.channel} dirty={draft.form.dirty} />
        <ChannelToggle row={row} />
      </div>
      {row.open ? <OpenForm row={row} draft={draft} /> : null}
    </li>
  );
}
