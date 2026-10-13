"use client";

import type { FormEvent } from "react";
import type { NotificationSettings } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import type { ChannelDraft } from "@/domain/notificationChannels";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import { CHANNEL_LABEL } from "@/features/sources/labels";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { ChannelFields, type ChannelFieldErrors } from "./ChannelFields";

export interface ChannelFormProps {
  channel: NotifyChannel;
  settings: NotificationSettings;
  form: SectionForm<ChannelDraft>;
  errors: ChannelFieldErrors;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** The row's visible channel name, which names the form (no second heading). */
  nameId: string;
  /** Absent when nothing of the channel is stored, so there is nothing to remove. */
  onRemove?: () => void;
}

/** Ruling 24: presentational; the channel row owns the draft so its "Testen" sees it. */
export function ChannelForm(props: ChannelFormProps) {
  const { channel, settings, form, errors, onRemove } = props;
  const { t } = useI18n();
  return (
    <DrawerSection
      id={`settings-chan-${channel.toLowerCase()}`}
      title={t(CHANNEL_LABEL[channel])}
      labelledBy={props.nameId}
      onSubmit={props.onSubmit}
      busy={props.busy}
      dirty={form.dirty}
    >
      <ChannelFields {...{ channel, settings, errors }} draft={form.draft} onChange={form.set} />
      {onRemove ? <RemoveButton onRemove={onRemove} /> : null}
    </DrawerSection>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <Button className="chan-remove" variant="ghost" size="sm" onClick={onRemove}>
      {t("settings.notify.remove")}
    </Button>
  );
}
