"use client";

import { useState, type FormEvent } from "react";
import type { ChannelType } from "@/api/notificationChannels";
import {
  channelProblems,
  createBody,
  hasProblems,
  labelIn,
  newChannelDraft,
  type ChannelProblems,
} from "@/domain/notificationChannels";
import { useReportDirty } from "@/features/profile/useReportDirty";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { SelectField } from "@/ui/Field";
import { ChannelForm } from "./ChannelForm";
import { refusedProblems, useCreateChannel } from "./useChannelSave";

export const NEW_CHANNEL_FORM_ID = "settings-chan-new";
const NAME_ID = `${NEW_CHANNEL_FORM_ID}-title`;
const NO_PROBLEMS: ChannelProblems = { fields: {} };
const NO_SECRETS: Readonly<Record<string, boolean>> = {};

export interface NewChannelFormProps {
  /** The service's types, in its order; the first is preselected. */
  types: readonly ChannelType[];
  report: ReportDirty;
  /** Cancel, through the list (it asks first when the form is dirty). */
  onCancel: () => void;
  /** After the create: the list closes the form and focuses the new row. */
  onCreated: (id: string) => void;
}

/**
 * Ruling: the type comes first and names the channel by default (the service's label); another
 * type starts a fresh form, because the fields differ per type.
 */
function useNewChannel({ types, report }: NewChannelFormProps) {
  const { language } = useI18n();
  const [typeId, setTypeId] = useState(types[0]!.id);
  const type = types.find((entry) => entry.id === typeId) ?? types[0]!;
  const blank = (next: ChannelType) => newChannelDraft(next, labelIn(next.label, language));
  const form = useSectionForm(blank(type));
  const [problems, setProblems] = useState<ChannelProblems>(NO_PROBLEMS);
  const chooseType = (id: string) => {
    const next = types.find((entry) => entry.id === id) ?? type;
    setTypeId(next.id);
    form.commit(blank(next));
    setProblems(NO_PROBLEMS);
  };
  useReportDirty(report, "chan-new", form.dirty);
  return { type, form, problems, setProblems, chooseType };
}

type NewChannel = ReturnType<typeof useNewChannel>;

function useCreateSubmit(state: NewChannel, onCreated: (id: string) => void) {
  const create = useCreateChannel();
  const { type, form, setProblems } = state;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = channelProblems(type, form.draft, null);
    setProblems(found);
    if (hasProblems(found)) return;
    create.mutate(createBody(type, form.draft), {
      onSuccess: (saved) => onCreated(saved.id),
      onError: (error) => setProblems(refusedProblems(error) ?? NO_PROBLEMS),
    });
  };
  return { onSubmit: submit, busy: create.isPending };
}

function TypeSelect({ state, types }: { state: NewChannel; types: readonly ChannelType[] }) {
  const { t, language } = useI18n();
  return (
    <SelectField
      id={`${NEW_CHANNEL_FORM_ID}-type`}
      label={t("settings.notify.type")}
      value={state.type.id}
      onChange={(event) => state.chooseType(event.target.value)}
    >
      {types.map((type) => (
        <option key={type.id} value={type.id}>
          {labelIn(type.label, language)}
        </option>
      ))}
    </SelectField>
  );
}

/** A new channel's form below the list, named by its own visible title. */
export function NewChannelForm(props: NewChannelFormProps) {
  const state = useNewChannel(props);
  const submission = useCreateSubmit(state, props.onCreated);
  const { type, form, problems } = state;
  const fields = { type, form, problems, storedSecrets: NO_SECRETS };
  return (
    <div className="chan-new" id={NEW_CHANNEL_FORM_ID}>
      <NewTitle />
      <ChannelForm
        id={`${NEW_CHANNEL_FORM_ID}-field`}
        {...fields}
        {...submission}
        nameId={NAME_ID}
        lead={<TypeSelect state={state} types={props.types} />}
      >
        <CancelButton onClick={props.onCancel} />
      </ChannelForm>
    </div>
  );
}

function NewTitle() {
  const { t } = useI18n();
  return (
    <p className="chan-name" id={NAME_ID}>
      {t("settings.notify.newTitle")}
    </p>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button className="chan-remove" variant="ghost" size="sm" onClick={onClick}>
      {t("settings.notify.cancelNew")}
    </Button>
  );
}
