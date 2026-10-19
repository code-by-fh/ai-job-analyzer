"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useState, type Dispatch } from "react";
import {
  channelsQueryOptions,
  channelTypesQueryOptions,
  type Channel,
  type ChannelType,
} from "@/api/notificationChannels";
import { CHANNEL_LIMITS } from "@/api/notificationPaths";
import { labelIn } from "@/domain/notificationChannels";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { NewChannelForm } from "@/features/settings/notifications/NewChannelForm";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { ChannelPick } from "../drawer/ChannelRow";
import { WizardGroup } from "./WizardGroup";
import type { WizardAction, WizardState } from "./wizardState";

const NOTIFY_HEADING_ID = "wizard-notify-h";
export const WIZARD_NEW_CHANNEL_ID = "wizard-new-channel";
const LIMIT_ID = "wizard-channel-limit";

interface NotifyProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

/**
 * Both answers or no group: without the service's types (none offered, or it is unavailable) the
 * channels cannot be labelled or created, and the wizard goes on without the group.
 */
interface ChannelOptions {
  types: ChannelType[];
  channels: Channel[];
}

function useChannelOptions(): ChannelOptions | null {
  const types = useQuery(channelTypesQueryOptions()).data;
  const channels = useQuery(channelsQueryOptions()).data;
  return types && types.length > 0 && channels ? { types, channels } : null;
}

function typeLabelOf(types: readonly ChannelType[], channel: Channel, language: "de" | "en") {
  const type = types.find((entry) => entry.id === channel.type);
  return type ? labelIn(type.label, language) : channel.type;
}

interface ChannelPicksProps extends NotifyProps {
  options: ChannelOptions;
}

function ChannelPicks({ state, dispatch, options }: ChannelPicksProps) {
  const { t, language } = useI18n();
  const { types, channels } = options;
  if (channels.length === 0) return <p className="hint">{t("sources.notify.none")}</p>;
  return (
    <>
      <p className="notify-intro">{t("sources.notify.intro")}</p>
      {channels.map((channel) => (
        <ChannelPick
          key={channel.id}
          channel={channel}
          typeLabel={typeLabelOf(types, channel, language)}
          chosenIds={state.channelIds}
          onChosen={(channelIds) => dispatch({ type: "channels", channelIds })}
        />
      ))}
    </>
  );
}

function LimitReason() {
  const { t } = useI18n();
  return (
    <p className="hint" id={LIMIT_ID}>
      {t("settings.notify.limit", { max: CHANNEL_LIMITS.channels })}
    </p>
  );
}

/** "Neuen Kanal anlegen", inactive with its visible reason at the service's channel limit. */
function NewChannelButton({ count, onCreate }: { count: number; onCreate: () => void }) {
  const { t } = useI18n();
  const full = count >= CHANNEL_LIMITS.channels;
  return (
    <>
      <Button
        id={WIZARD_NEW_CHANNEL_ID}
        size="sm"
        icon={Plus}
        inactive={full}
        aria-describedby={full ? LIMIT_ID : undefined}
        onClick={onCreate}
      >
        {t("sources.wizard.newChannel")}
      </Button>
      {full ? <LimitReason /> : null}
    </>
  );
}

/** Feedback 2, T7: Benachrichtigungen of the new source, with the drawer's picker. */
export function WizardNotify({
  state,
  dispatch,
  onCreate,
}: NotifyProps & { onCreate: () => void }) {
  const { t } = useI18n();
  const options = useChannelOptions();
  if (!options) return null;
  return (
    <WizardGroup headingId={NOTIFY_HEADING_ID} title={t("sources.section.notify")}>
      <ChannelPicks state={state} dispatch={dispatch} options={options} />
      <NewChannelButton count={options.channels.length} onCreate={onCreate} />
    </WizardGroup>
  );
}

interface NewChannelDialogProps extends NotifyProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The settings' own create form in a dialog: it is a form itself, so it cannot sit inside the
 * step's form. A created channel is chosen at once (the create stores it in the channel list).
 * Closing with typed input asks first, as the settings page does.
 */
export function NewChannelDialog({ open, onClose, state, dispatch }: NewChannelDialogProps) {
  const { t } = useI18n();
  const types = useQuery(channelTypesQueryOptions()).data;
  const guard = useDiscardGuard(onClose);
  if (!types || types.length === 0) return null;
  const created = (id: string) => {
    dispatch({ type: "channels", channelIds: [...state.channelIds, id] });
    onClose();
  };
  const form = { types, report: guard.report, onCancel: guard.requestClose, onCreated: created };
  return (
    <>
      <Dialog open={open} onClose={guard.requestClose} label={t("settings.notify.newTitle")}>
        <NewChannelForm {...form} />
      </Dialog>
      {guard.asking ? <DiscardQuestion guard={guard} /> : null}
    </>
  );
}

/** Closing asks only while the form holds typed input (its dirty flag), like the settings page. */
function useDiscardGuard(onClose: () => void) {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const report = useCallback((_form: string, isDirty: boolean) => setDirty(isDirty), []);
  return {
    asking,
    report,
    requestClose: () => (dirty ? setAsking(true) : onClose()),
    keep: () => setAsking(false),
    discard: () => {
      setAsking(false);
      onClose();
    },
  };
}

function DiscardQuestion({ guard }: { guard: ReturnType<typeof useDiscardGuard> }) {
  const { t } = useI18n();
  return (
    <ConfirmDialog
      title={t("unsaved.title")}
      confirmLabel={t("unsaved.confirm")}
      busy={false}
      onConfirm={guard.discard}
      onClose={guard.keep}
    >
      <p className="prose">{t("unsaved.text")}</p>
    </ConfirmDialog>
  );
}
