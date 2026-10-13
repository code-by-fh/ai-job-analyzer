"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError, type ApiErrorCode } from "@/api/errors";
import type { NotificationTemplate } from "@/api/notifications";
import type { NotifyChannel } from "@/api/platformPaths";
import { sendPlatformTest } from "@/api/platforms";
import { CUSTOM_TEMPLATE, DEFAULT_TEMPLATE, templateChoice } from "@/domain/sources";
import { NOTIFICATION_SETTINGS_HREF } from "@/features/shell/navigation";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, SelectField, TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { CHANNEL_LABEL } from "../labels";
import { isEmailChannel, templatesFor, type NotifyDraft } from "./notifyDraft";

export interface ChannelRowProps {
  channel: NotifyChannel;
  /** GET /notification-settings/channels: the channel has credentials (booleans only, G9). */
  configured: boolean;
  draft: NotifyDraft;
  /** The stored template content, so a kept custom text can be chosen again after another pick. */
  storedTemplate: string | null;
  onChange: (patch: Partial<NotifyDraft>) => void;
  error: MessageKey | undefined;
  templates: readonly NotificationTemplate[];
  platformId: number;
  /** The section holds unsaved edits: a test would send the stored state, not what is shown. */
  dirty: boolean;
}

const idOf = (channel: NotifyChannel, part: string) =>
  `src-notify-${channel.toLowerCase()}-${part}`;

/** D7: one channel: its check, the setup link or its options, and the test send. */
export function ChannelRow(props: ChannelRowProps) {
  const { t } = useI18n();
  const active = props.draft.adapters.includes(props.channel);
  return (
    <fieldset className="channel-row">
      <legend className="sr-only">{t(CHANNEL_LABEL[props.channel])}</legend>
      <div className="channel-head">
        <ChannelToggle {...props} />
        {active ? <TestSendButton {...props} /> : null}
      </div>
      {props.configured ? null : <NotConfigured />}
      {active ? <ChannelOptions {...props} /> : null}
    </fieldset>
  );
}

function toggledAdapters(adapters: readonly NotifyChannel[], channel: NotifyChannel, on: boolean) {
  return on ? [...adapters, channel] : adapters.filter((other) => other !== channel);
}

type ToggleProps = Pick<ChannelRowProps, "channel" | "configured" | "draft" | "onChange">;

/** An active but unconfigured channel can still be switched off; only switching on needs setup. */
function ChannelToggle({ channel, configured, draft, onChange }: ToggleProps) {
  const { t } = useI18n();
  const active = draft.adapters.includes(channel);
  return (
    <CheckField
      id={idOf(channel, "on")}
      label={t("sources.notify.channel", { channel: t(CHANNEL_LABEL[channel]) })}
      checked={active}
      disabled={!configured && !active}
      onChange={(on) => onChange({ adapters: toggledAdapters(draft.adapters, channel, on) })}
    />
  );
}

function NotConfigured() {
  const { t } = useI18n();
  return (
    <p className="hint">
      {t("sources.notify.notConfigured")}{" "}
      <Link className="link" href={NOTIFICATION_SETTINGS_HREF}>
        {t("sources.notify.toSettings")}
      </Link>
    </p>
  );
}

function ChannelOptions(props: ChannelRowProps) {
  return (
    <div className="channel-options">
      <RecipientsField {...props} />
      <TemplateSelect {...props} />
    </div>
  );
}

/** Pushover goes to the user's own device; only the email channels have recipients per source. */
function RecipientsField({ channel, draft, onChange, error }: ChannelRowProps) {
  const { t } = useI18n();
  if (!isEmailChannel(channel)) return null;
  return (
    <TextField
      id={idOf(channel, "recipients")}
      type="text"
      inputMode="email"
      autoComplete="off"
      label={t("sources.notify.recipients")}
      hint={t("sources.notify.recipientsHint")}
      value={draft.recipients[channel]}
      onChange={(event) =>
        onChange({ recipients: { ...draft.recipients, [channel]: event.target.value } })
      }
      error={error ? t(error) : undefined}
    />
  );
}

/** The stored or drafted text that matches none of the listed templates (G10: it is kept). */
function keptText(contents: (string | null)[], options: readonly NotificationTemplate[]) {
  return contents.find((content) => templateChoice(content, options) === CUSTOM_TEMPLATE) ?? null;
}

/** D7 / G10: choosing a template copies its content; the text itself is edited in Einstellungen. */
function TemplateSelect({ channel, draft, storedTemplate, onChange, templates }: ChannelRowProps) {
  const { t } = useI18n();
  const options = templatesFor(channel, templates);
  const current = draft.templates[channel];
  const kept = keptText([current, storedTemplate], options);
  const choose = (choice: string) => {
    const content = choice === CUSTOM_TEMPLATE ? kept : contentOf(choice, options);
    onChange({ templates: { ...draft.templates, [channel]: content } });
  };
  return (
    <SelectField
      id={idOf(channel, "template")}
      label={t("sources.notify.template", { channel: t(CHANNEL_LABEL[channel]) })}
      value={templateChoice(current, options)}
      onChange={(event) => choose(event.target.value)}
    >
      <TemplateOptions options={options} kept={kept !== null} />
    </SelectField>
  );
}

function contentOf(choice: string, options: readonly NotificationTemplate[]): string | null {
  if (choice === DEFAULT_TEMPLATE) return null;
  return options.find((template) => String(template.id) === choice)?.content ?? null;
}

interface TemplateOptionsProps {
  options: readonly NotificationTemplate[];
  kept: boolean;
}

function TemplateOptions({ options, kept }: TemplateOptionsProps) {
  const { t } = useI18n();
  const nameOf = (template: NotificationTemplate) =>
    template.is_admin ? t("sources.notify.templateGlobal", { name: template.name }) : template.name;
  return (
    <>
      <option value={DEFAULT_TEMPLATE}>{t("sources.notify.templateDefault")}</option>
      {options.map((template) => (
        <option key={template.id} value={String(template.id)}>
          {nameOf(template)}
        </option>
      ))}
      {kept ? <option value={CUSTOM_TEMPLATE}>{t("sources.notify.templateCustom")}</option> : null}
    </>
  );
}

/** D7: a test sends the stored state, so it waits until the section is saved, and says so. */
function TestSendButton({ channel, platformId, dirty }: ChannelRowProps) {
  const send = useTestSend(platformId, channel);
  return (
    <span className="channel-test">
      <TestButton
        channel={channel}
        dirty={dirty}
        busy={send.isPending}
        onClick={() => send.mutate()}
      />
    </span>
  );
}

export interface TestButtonProps {
  channel: NotifyChannel;
  /** Unsaved edits: the test would send the stored state, so it waits. */
  dirty: boolean;
  busy: boolean;
  onClick: () => void;
}

/** "Test über {channel} senden", inactive with a visible reason while dirty (also Einstellungen). */
export function TestButton({ channel, dirty, busy, onClick }: TestButtonProps) {
  const { t } = useI18n();
  const reasonId = idOf(channel, "test-why");
  return (
    <>
      {dirty ? <SaveFirst id={reasonId} /> : null}
      <Button
        size="sm"
        busy={busy}
        inactive={dirty}
        aria-describedby={dirty ? reasonId : undefined}
        onClick={onClick}
      >
        {t("sources.notify.testLabel", { channel: t(CHANNEL_LABEL[channel]) })}
      </Button>
    </>
  );
}

/** Visible, not only for screen readers: the greyed-out button says why it waits. */
function SaveFirst({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <span className="hint" id={id}>
      {t("sources.notify.saveFirst")}
    </span>
  );
}

// The endpoint's 400 means credentials or recipients are missing; its text is never shown.
const TEST_ERROR_KEY: Partial<Record<ApiErrorCode, MessageKey>> = {
  BAD_REQUEST: "sources.notify.testMissing",
  RATE_LIMITED: "error.rateLimited",
};

/** The sentence for a failed test send, shared by the drawer and the settings (ruling 41). */
export function testErrorKey(error: unknown): MessageKey {
  return (error instanceof ApiError && TEST_ERROR_KEY[error.code]) || "sources.notify.testFailed";
}

function useTestSend(platformId: number, channel: NotifyChannel) {
  const { t } = useI18n();
  const toast = useToast();
  const name = t(CHANNEL_LABEL[channel]);
  return useMutation({
    mutationFn: () => sendPlatformTest({ id: platformId, channel }),
    onSuccess: () =>
      toast.show({ message: t("sources.notify.testSent", { channel: name }), tone: "success" }),
    onError: (error) =>
      toast.show({ message: t(testErrorKey(error), { channel: name }), tone: "error" }),
  });
}
