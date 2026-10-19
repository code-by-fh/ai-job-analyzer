"use client";

import type { FormEvent, ReactNode } from "react";
import type { ChannelType } from "@/api/notificationChannels";
import type { ChannelDraft, ChannelProblems } from "@/domain/notificationChannels";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import { ChannelFields } from "./ChannelFields";

export interface ChannelFormProps {
  /** Prefix of the form's and its fields' ids. */
  id: string;
  type: ChannelType;
  form: SectionForm<ChannelDraft>;
  storedSecrets: Readonly<Record<string, boolean>>;
  problems: ChannelProblems;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** The visible name above the form, which names it (no second heading). */
  nameId: string;
  /** Controls above the fields (the type choice of a new channel). */
  lead?: ReactNode;
  /** Controls below the fields (the delete button of a stored channel). */
  children?: ReactNode;
}

function fieldsOf({ id, type, form, storedSecrets, problems }: ChannelFormProps) {
  return { idPrefix: id, type, draft: form.draft, storedSecrets, problems, onChange: form.set };
}

/** Ruling 24: presentational; the row owns the draft so its test button sees whether it is dirty. */
export function ChannelForm(props: ChannelFormProps) {
  const { id, form, busy, onSubmit, nameId } = props;
  return (
    <DrawerSection
      id={id}
      title=""
      labelledBy={nameId}
      onSubmit={onSubmit}
      busy={busy}
      dirty={form.dirty}
    >
      {props.lead}
      <ChannelFields {...fieldsOf(props)} />
      {props.children}
    </DrawerSection>
  );
}
