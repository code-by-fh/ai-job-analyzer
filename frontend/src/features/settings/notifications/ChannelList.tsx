"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  channelsQueryOptions,
  channelTypesQueryOptions,
  type Channel,
  type ChannelType,
} from "@/api/notificationChannels";
import { CHANNEL_LIMITS } from "@/api/notificationPaths";
import { typeOf } from "@/domain/notificationChannels";
import { SectionState } from "@/features/profile/SectionState";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { closeThenFocus } from "@/ui/focus";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { ChannelRow, rowId } from "./ChannelRow";
import { CHANNEL_LIST_ERROR } from "./channelText";
import { NEW_CHANNEL_FORM_ID, NewChannelForm } from "./NewChannelForm";

/** The open form: a channel's id, the new channel's form, or none. */
const NEW = "new";
const ADD_ID = "settings-chan-add";
const LIMIT_ID = "settings-chan-limit";

const addButton = () => document.getElementById(ADD_ID);

/**
 * Ruling 42: one form open. Switching or closing asks only when the open form is dirty; the rows'
 * flags pass through here on their way to the page's reporter.
 */
function useOpenForm(report: ReportDirty) {
  const { requestLeave } = useUnsavedChanges();
  const [open, setOpen] = useState<string | null>(null);
  const dirtyForms = useRef(new Set<string>());
  const trackedReport = useCallback<ReportDirty>(
    (form, dirty) => {
      if (dirty) dirtyForms.current.add(form);
      else dirtyForms.current.delete(form);
      report(form, dirty);
    },
    [report],
  );
  const toggle = async (id: string) => {
    if (dirtyForms.current.size > 0 && !(await requestLeave())) return;
    setOpen((current) => (current === id ? null : id));
  };
  return { open, toggle, close: () => setOpen(null), report: trackedReport };
}

type OpenForm = ReturnType<typeof useOpenForm>;

interface ChannelRowsProps {
  channels: readonly Channel[];
  types: readonly ChannelType[];
  forms: OpenForm;
}

function ChannelRows({ channels, types, forms }: ChannelRowsProps) {
  const { t } = useI18n();
  if (channels.length === 0) return <p className="hint">{t("settings.notify.none")}</p>;
  return (
    <ul role="list" className="chan-list">
      {channels.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          type={typeOf(types, channel)}
          open={forms.open === channel.id}
          onToggle={(id) => void forms.toggle(id)}
          onClose={forms.close}
          report={forms.report}
          afterDelete={addButton}
        />
      ))}
    </ul>
  );
}

/** "Kanal hinzufügen", inactive with its visible reason at the service's channel limit. */
function AddChannel({ count, forms }: { count: number; forms: OpenForm }) {
  const full = count >= CHANNEL_LIMITS.channels;
  return (
    <div className="chan-add">
      <AddButton full={full} forms={forms} />
      {full ? <LimitReason /> : null}
    </div>
  );
}

function AddButton({ full, forms }: { full: boolean; forms: OpenForm }) {
  const { t } = useI18n();
  const open = forms.open === NEW;
  return (
    <Button
      id={ADD_ID}
      size="sm"
      icon={Plus}
      inactive={full && !open}
      aria-expanded={open}
      aria-controls={open ? NEW_CHANNEL_FORM_ID : undefined}
      aria-describedby={full ? LIMIT_ID : undefined}
      onClick={() => void forms.toggle(NEW)}
    >
      {t("settings.notify.add")}
    </Button>
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

function Channels({ channels, types, forms }: ChannelRowsProps) {
  // The created row is in the list at once (useCreateChannel stores it), so its toggle takes focus.
  const created = (id: string) =>
    closeThenFocus(forms.close, () => document.getElementById(rowId(id, "toggle")));
  return (
    <>
      <ChannelRows channels={channels} types={types} forms={forms} />
      <AddChannel count={channels.length} forms={forms} />
      {forms.open === NEW && types.length > 0 ? (
        <NewChannelForm
          types={types}
          report={forms.report}
          onCancel={() => void forms.toggle(NEW)}
          onCreated={created}
        />
      ) : null}
    </>
  );
}

/** D5: the user's channels (any number per type, up to the limit) and the add form. */
export function ChannelList({ report }: { report: ReportDirty }) {
  const typesQuery = useQuery(channelTypesQueryOptions());
  const channelsQuery = useQuery(channelsQueryOptions());
  const forms = useOpenForm(report);
  // Ruling 40: no row before both answers, so a row never shows without its type's label.
  return (
    <SectionState query={typesQuery} errorText={CHANNEL_LIST_ERROR}>
      {(types) => (
        <SectionState query={channelsQuery} errorText={CHANNEL_LIST_ERROR}>
          {(channels) => <Channels channels={channels} types={types} forms={forms} />}
        </SectionState>
      )}
    </SectionState>
  );
}
