"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  channelStatusQueryOptions,
  notificationTemplatesQueryOptions,
  type ChannelStatus,
  type NotificationTemplate,
} from "@/api/notifications";
import { NOTIFY_CHANNELS, type NotifyChannel } from "@/api/platformPaths";
import type { Platform } from "@/api/platforms";
import { givenUp } from "@/api/queryState";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { ChannelRow, type ChannelRowProps } from "./ChannelRow";
import { DrawerSection, type SectionProps } from "./DrawerSection";
import {
  EMAIL_CHANNELS,
  isEmailChannel,
  notifyDraftOf,
  notifyErrors,
  notifyPatch,
  type EmailChannel,
  type NotifyDraft,
} from "./notifyDraft";
import { useSectionForm, type SectionForm } from "./useSectionForm";
import { useSectionSave } from "./useSectionSave";

const SECTION = "notify";
const ID_PREFIX = "src-notify";

type NotifyErrors = ReturnType<typeof notifyErrors>;

/** The channels whose recipients text this edit changes. */
function editedRecipients(draft: NotifyDraft, patch: Partial<NotifyDraft>): EmailChannel[] {
  const next = patch.recipients;
  return next
    ? EMAIL_CHANNELS.filter((channel) => next[channel] !== draft.recipients[channel])
    : [];
}

function withoutErrors(errors: NotifyErrors, channels: readonly EmailChannel[]): NotifyErrors {
  if (!channels.some((channel) => errors[channel])) return errors;
  const next = { ...errors };
  for (const channel of channels) delete next[channel];
  return next;
}

/** Client check first, then one PATCH with every notification field; an edited field drops its error. */
function useNotifySubmit(form: SectionForm<NotifyDraft>, platform: Platform) {
  const save = useSectionSave(platform.id);
  const [errors, setErrors] = useState<NotifyErrors>({});
  const change = (patch: Partial<NotifyDraft>) => {
    const edited = editedRecipients(form.draft, patch);
    form.set(patch);
    setErrors((current) => withoutErrors(current, edited));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = notifyErrors(form.draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || !form.dirty) return;
    save.mutate(notifyPatch(form.draft, platform), {
      onSuccess: (saved) => form.commit(notifyDraftOf(saved)),
    });
  };
  return { submit, change, errors, busy: save.isPending };
}

/** D5/D7: Benachrichtigungen, saved on its own. */
export function NotifySection({ platform, report }: SectionProps) {
  const { t } = useI18n();
  // Hidden fields of a switched-off channel are not sent, so they are no unsaved edit either.
  const form = useSectionForm(notifyDraftOf(platform), (draft) => notifyPatch(draft, platform));
  const { submit, change, errors, busy } = useNotifySubmit(form, platform);
  useEffect(() => report(SECTION, form.dirty), [form.dirty, report]);
  return (
    <DrawerSection
      id={ID_PREFIX}
      title={t("sources.section.notify")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <NotifyBody platform={platform} form={form} errors={errors} onChange={change} />
    </DrawerSection>
  );
}

/** Both answers or nothing: no channel control renders without its status and its templates. */
function useNotifySettings() {
  const channels = useQuery(channelStatusQueryOptions());
  const templates = useQuery(notificationTemplatesQueryOptions());
  const failed = [channels, templates].filter(givenUp);
  const retry = () => failed.forEach((query) => void query.refetch());
  return {
    failed: failed.length > 0,
    // During the automatic backoff (RB13) a failed query is already fetching again, so the
    // retry button shows busy instead of starting a second request beside the scheduled one.
    retrying: failed.some((query) => query.isFetching),
    retry,
    channels: channels.data,
    templates: templates.data,
  };
}

interface NotifyBodyProps {
  platform: Platform;
  form: SectionForm<NotifyDraft>;
  errors: NotifyErrors;
  onChange: (patch: Partial<NotifyDraft>) => void;
}

function NotifyBody(props: NotifyBodyProps) {
  const settings = useNotifySettings();
  if (settings.failed) {
    return <NotifyLoadFailed onRetry={settings.retry} busy={settings.retrying} />;
  }
  if (!settings.channels || !settings.templates) return <NotifyLoading />;
  return <NotifyChannels {...props} channels={settings.channels} templates={settings.templates} />;
}

interface NotifyChannelsProps extends NotifyBodyProps {
  channels: ChannelStatus;
  templates: readonly NotificationTemplate[];
}

/** What one channel row needs from the section; the stored template keeps a custom text choosable. */
function rowProps(channel: NotifyChannel, props: NotifyChannelsProps): ChannelRowProps {
  const { platform, form, errors, channels, templates, onChange } = props;
  return {
    channel,
    configured: channels[channel],
    draft: form.draft,
    storedTemplate: notifyDraftOf(platform).templates[channel],
    onChange,
    error: isEmailChannel(channel) ? errors[channel] : undefined,
    templates,
    platformId: platform.id,
    dirty: form.dirty,
  };
}

function NotifyChannels(props: NotifyChannelsProps) {
  const { t } = useI18n();
  return (
    <>
      <p className="notify-intro">{t("sources.notify.intro")}</p>
      {NOTIFY_CHANNELS.map((channel) => (
        <ChannelRow key={channel} {...rowProps(channel, props)} />
      ))}
    </>
  );
}

function NotifyLoading() {
  const { t } = useI18n();
  return (
    <div className="notify-loading" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <span className="skeleton-line w-2/3" />
      <span className="skeleton-line w-1/2" />
    </div>
  );
}

/** A state on open, not an event: the drawer's dialog already announces itself (no alert). */
function NotifyLoadFailed({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const { t } = useI18n();
  return (
    <div className="notify-failed">
      <Notice tone="error" announce={false}>
        {t("sources.notify.loadFailed")}
      </Notice>
      <Button icon={RotateCcw} size="sm" busy={busy} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
