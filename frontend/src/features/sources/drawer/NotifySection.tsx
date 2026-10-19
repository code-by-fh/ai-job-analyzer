"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  channelsQueryOptions,
  channelTypesQueryOptions,
  type Channel,
  type ChannelType,
} from "@/api/notificationChannels";
import { notificationTemplatesQueryOptions, type NotificationTemplate } from "@/api/notifications";
import type { NotifyChannel } from "@/api/platformPaths";
import type { Platform } from "@/api/platforms";
import { givenUp } from "@/api/queryState";
import { labelIn } from "@/domain/notificationChannels";
import { NOTIFICATION_SETTINGS_HREF } from "@/features/shell/navigation";
import type { Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { ChannelPick, TypeOptions } from "./ChannelRow";
import { DrawerSection, type SectionProps } from "./DrawerSection";
import {
  activeTypes,
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

/** The email types whose recipients text this edit changes. */
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

interface NotifySettings {
  channels: readonly Channel[];
  types: readonly ChannelType[];
  templates: readonly NotificationTemplate[];
}

const NO_CHANNELS: readonly Channel[] = [];

/** An edited recipients field drops its error until the next save. */
function useNotifyChange(form: SectionForm<NotifyDraft>) {
  const [errors, setErrors] = useState<NotifyErrors>({});
  const change = (patch: Partial<NotifyDraft>) => {
    const edited = editedRecipients(form.draft, patch);
    form.set(patch);
    setErrors((current) => withoutErrors(current, edited));
  };
  return { errors, setErrors, change };
}

/** Client check first, then one PATCH with every notification field. */
function useNotifyForm(platform: Platform, channels: readonly Channel[]) {
  // Hidden fields of an unused type are not sent, so they are no unsaved edit either.
  const form = useSectionForm(notifyDraftOf(platform), (draft) =>
    notifyPatch(draft, platform, channels),
  );
  const save = useSectionSave(platform.id);
  const { errors, setErrors, change } = useNotifyChange(form);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = notifyErrors(form.draft, activeTypes(form.draft, channels));
    setErrors(found);
    if (Object.keys(found).length > 0 || !form.dirty) return;
    save.mutate(notifyPatch(form.draft, platform, channels), {
      onSuccess: (saved) => form.commit(notifyDraftOf(saved)),
    });
  };
  return { form, submit, change, errors, busy: save.isPending };
}

/** All three answers or nothing: no channel control renders without its type and its templates. */
function useNotifySettings() {
  const channels = useQuery(channelsQueryOptions());
  const types = useQuery(channelTypesQueryOptions());
  const templates = useQuery(notificationTemplatesQueryOptions());
  const failed = [channels, types, templates].filter(givenUp);
  const ready = channels.data && types.data && templates.data;
  return {
    failed: failed.length > 0,
    // During the automatic backoff (RB13) a failed query is already fetching again, so the
    // retry button shows busy instead of starting a second request beside the scheduled one.
    retrying: failed.some((query) => query.isFetching),
    retry: () => failed.forEach((query) => void query.refetch()),
    settings: ready
      ? { channels: channels.data, types: types.data, templates: templates.data }
      : undefined,
  };
}

/** D5/D7: Benachrichtigungen, saved on its own. */
export function NotifySection({ platform, report }: SectionProps) {
  const { t } = useI18n();
  const state = useNotifySettings();
  const { form, submit, change, errors, busy } = useNotifyForm(
    platform,
    state.settings?.channels ?? NO_CHANNELS,
  );
  useEffect(() => report(SECTION, form.dirty), [form.dirty, report]);
  return (
    <DrawerSection
      id={ID_PREFIX}
      title={t("sources.section.notify")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <NotifyContent state={state} body={{ platform, form, errors, onChange: change }} />
    </DrawerSection>
  );
}

interface NotifyContentProps {
  state: ReturnType<typeof useNotifySettings>;
  body: Omit<NotifyBodyProps, "settings">;
}

function NotifyContent({ state, body }: NotifyContentProps) {
  if (state.failed) return <NotifyLoadFailed onRetry={state.retry} busy={state.retrying} />;
  if (!state.settings) return <NotifyLoading />;
  return <NotifyBody {...body} settings={state.settings} />;
}

interface NotifyBodyProps {
  platform: Platform;
  settings: NotifySettings;
  form: SectionForm<NotifyDraft>;
  errors: NotifyErrors;
  onChange: (patch: Partial<NotifyDraft>) => void;
}

/** The service's label of a type; the raw id only for a type the service no longer lists. */
function typeLabelOf(types: readonly ChannelType[], id: string, language: Language): string {
  const type = types.find((entry) => entry.id === id);
  return type ? labelIn(type.label, language) : id;
}

/** The options of one type in use: its label, template and (email) recipients. */
function optionsOf(type: NotifyChannel, body: NotifyBodyProps, language: Language) {
  const { platform, settings, form, errors, onChange } = body;
  return {
    type,
    typeLabel: typeLabelOf(settings.types, type.toLowerCase(), language),
    draft: form.draft,
    storedTemplate: notifyDraftOf(platform).templates[type],
    onChange,
    error: isEmailChannel(type) ? errors[type] : undefined,
    templates: settings.templates,
  };
}

function NotifyBody(props: NotifyBodyProps) {
  const { t, language } = useI18n();
  const { settings, form } = props;
  if (settings.channels.length === 0) return <NoChannels />;
  return (
    <>
      <p className="notify-intro">{t("sources.notify.intro")}</p>
      <ChannelPicks {...props} />
      {activeTypes(form.draft, settings.channels).map((type) => (
        <TypeOptions key={type} {...optionsOf(type, props, language)} />
      ))}
      <ManageLink />
    </>
  );
}

function ChannelPicks({ settings, form, onChange }: NotifyBodyProps) {
  const { language } = useI18n();
  return settings.channels.map((channel) => (
    <ChannelPick
      key={channel.id}
      channel={channel}
      typeLabel={typeLabelOf(settings.types, channel.type, language)}
      testHint
      chosenIds={form.draft.channelIds}
      onChosen={(channelIds) => onChange({ channelIds })}
    />
  ));
}

function ManageLink() {
  const { t } = useI18n();
  return (
    <p className="hint notify-link">
      <Link className="link" href={NOTIFICATION_SETTINGS_HREF}>
        {t("sources.notify.manage")}
      </Link>
    </p>
  );
}

/** Channels are set up in Einstellungen; the source only picks among them. */
function NoChannels() {
  const { t } = useI18n();
  return (
    <p className="hint notify-link">
      {t("sources.notify.none")}{" "}
      <Link className="link" href={NOTIFICATION_SETTINGS_HREF}>
        {t("sources.notify.toSettings")}
      </Link>
    </p>
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
