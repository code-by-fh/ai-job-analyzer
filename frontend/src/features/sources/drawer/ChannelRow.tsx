"use client";

import type { Channel } from "@/api/notificationChannels";
import type { NotificationTemplate } from "@/api/notifications";
import type { NotifyChannel } from "@/api/platformPaths";
import { CUSTOM_TEMPLATE, DEFAULT_TEMPLATE, templateChoice } from "@/domain/sources";
import { ChannelTest } from "@/features/settings/notifications/ChannelTest";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { CheckField, SelectField, TextField } from "@/ui/Field";
import { isEmailChannel, templatesFor, type NotifyDraft } from "./notifyDraft";

export interface ChannelPickProps {
  channel: Channel;
  /** The service's label of the channel's type, in the UI language. */
  typeLabel: string;
  /** The ids of the chosen channels; the picker shows no more than that. */
  chosenIds: readonly string[];
  onChosen: (ids: string[]) => void;
  /** The drawer's note that the test skips the source's own recipients; a source that does not exist yet has none. */
  testHint?: boolean;
}

const idOf = (part: string) => `src-notify-${part}`;

function toggledIds(ids: readonly string[], id: string, on: boolean): string[] {
  return on ? [...ids, id] : ids.filter((other) => other !== id);
}

/**
 * D7: one of the user's channels: its check and, once chosen, its test send. The test sends the
 * channel's fixed test message to its own recipients, so it does not wait for this section's save.
 */
export function ChannelPick(props: ChannelPickProps) {
  const { channel, typeLabel, chosenIds } = props;
  const active = chosenIds.includes(channel.id);
  return (
    <div className="channel-row">
      <div className="channel-head">
        <PickCheck {...props} active={active} />
        {active ? (
          <span className="channel-test">
            <ChannelTest channel={channel} />
          </span>
        ) : null}
      </div>
      <p className="hint channel-type">{typeLabel}</p>
      {active && props.testHint ? <ChannelTestHint /> : null}
    </div>
  );
}

/** The test goes to the channel's own recipients, which the source's recipients field below is not. */
function ChannelTestHint() {
  const { t } = useI18n();
  return <p className="hint">{t("sources.notify.testHint")}</p>;
}

function PickCheck({
  channel,
  chosenIds,
  onChosen,
  active,
}: ChannelPickProps & { active: boolean }) {
  const { t } = useI18n();
  return (
    <CheckField
      id={idOf(`on-${channel.id}`)}
      label={t("sources.notify.channel", { channel: channel.name })}
      checked={active}
      onChange={(on) => onChosen(toggledIds(chosenIds, channel.id, on))}
    />
  );
}

export interface TypeOptionsProps {
  type: NotifyChannel;
  typeLabel: string;
  draft: NotifyDraft;
  /** The stored template content, so a kept custom text can be chosen again after another pick. */
  storedTemplate: string | null;
  onChange: (patch: Partial<NotifyDraft>) => void;
  error: MessageKey | undefined;
  templates: readonly NotificationTemplate[];
}

/** The template and (email) recipients that every chosen channel of one type shares. */
export function TypeOptions(props: TypeOptionsProps) {
  return (
    <fieldset className="channel-row type-options">
      <legend className="type-options-name">{props.typeLabel}</legend>
      <TemplateSelect {...props} />
      <RecipientsField {...props} />
    </fieldset>
  );
}

/** Pushover goes to the user's own device; only the email types have recipients per source. */
function RecipientsField({ type, typeLabel, draft, onChange, error }: TypeOptionsProps) {
  const { t } = useI18n();
  if (!isEmailChannel(type)) return null;
  return (
    <TextField
      id={idOf(`${type.toLowerCase()}-recipients`)}
      type="text"
      inputMode="email"
      autoComplete="off"
      label={t("sources.notify.recipients", { channel: typeLabel })}
      hint={t("sources.notify.recipientsHint")}
      value={draft.recipients[type]}
      onChange={(event) =>
        onChange({ recipients: { ...draft.recipients, [type]: event.target.value } })
      }
      error={error ? t(error) : undefined}
    />
  );
}

/** The stored or drafted text that matches none of the listed templates (G10: it is kept). */
function keptText(contents: (string | null)[], options: readonly NotificationTemplate[]) {
  return contents.find((content) => templateChoice(content, options) === CUSTOM_TEMPLATE) ?? null;
}

/** The choice the select shows, and what picking an option stores (a kept text stays choosable). */
function useTemplateChoice({ type, draft, storedTemplate, onChange, templates }: TypeOptionsProps) {
  const options = templatesFor(type, templates);
  const current = draft.templates[type];
  const kept = keptText([current, storedTemplate], options);
  const choose = (choice: string) => {
    const content = choice === CUSTOM_TEMPLATE ? kept : contentOf(choice, options);
    onChange({ templates: { ...draft.templates, [type]: content } });
  };
  return { options, value: templateChoice(current, options), kept: kept !== null, choose };
}

/** D7 / G10: choosing a template copies its content; the text itself is edited in Einstellungen. */
function TemplateSelect(props: TypeOptionsProps) {
  const { t } = useI18n();
  const { options, value, kept, choose } = useTemplateChoice(props);
  return (
    <SelectField
      id={idOf(`${props.type.toLowerCase()}-template`)}
      label={t("sources.notify.template", { channel: props.typeLabel })}
      value={value}
      onChange={(event) => choose(event.target.value)}
    >
      <TemplateOptions options={options} kept={kept} />
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
