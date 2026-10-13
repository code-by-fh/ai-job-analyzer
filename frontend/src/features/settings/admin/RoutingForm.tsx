"use client";

import { useState, type FormEvent } from "react";
import type { AiSettings } from "@/api/admin";
import { AI_PROVIDERS, AI_TASKS, type AiProvider, type AiTask } from "@/api/adminPaths";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { useReportDirty } from "@/features/profile/useReportDirty";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";
import { Seg } from "@/ui/Seg";
import { routingWarnings, WARNING_TEXT, type RoutingWarning } from "./routing";
import { TASK_LABEL } from "./taskLabels";
import { toAiField, useAiSettingsSave } from "./useAiSettingsSave";

type Routing = Record<AiTask, AiProvider>;

const PROVIDER_LABEL: Readonly<Record<AiProvider, MessageKey>> = {
  cloud: "settings.ai.cloudShort",
  local: "settings.ai.localShort",
};

export interface RoutingFormProps {
  settings: AiSettings;
  report: ReportDirty;
}

interface TaskRowProps {
  task: AiTask;
  value: AiProvider;
  onChange: (provider: AiProvider) => void;
}

function TaskRow({ task, value, onChange }: TaskRowProps) {
  const { t } = useI18n();
  const name = t(TASK_LABEL[task]);
  const options = AI_PROVIDERS.map((provider) => ({
    value: provider,
    label: t(PROVIDER_LABEL[provider]),
  }));
  return (
    <div className="routing-row">
      <span className="routing-task">{name}</span>
      <Seg {...{ options, value, onChange }} label={t("settings.ai.providerFor", { task: name })} />
    </div>
  );
}

interface TaskRowsProps {
  routing: Routing;
  onChange: (patch: Partial<Routing>) => void;
}

function TaskRows({ routing, onChange }: TaskRowsProps) {
  return (
    <div className="routing-list">
      {AI_TASKS.map((task) => (
        <TaskRow
          key={task}
          task={task}
          value={routing[task]}
          onChange={(provider) => onChange({ [task]: provider })}
        />
      ))}
    </div>
  );
}

/** Above Speichern: what the routed providers lack (warn, saving stays allowed) and a refusal. */
function RoutingNotices({ warnings, refused }: { warnings: RoutingWarning[]; refused: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {warnings.map((warning) => (
        <Notice key={warning} tone="warn">
          <p>{t(WARNING_TEXT[warning])}</p>
        </Notice>
      ))}
      {refused ? (
        <Notice tone="error">
          <p>{t("settings.ai.routingRefused")}</p>
        </Notice>
      ) : null}
    </>
  );
}

/**
 * R11: the save hook toasts nothing when a 422 names an AI field, so this form shows the refusal
 * itself. The server names "ai_task_routing" (unknown task) or "ai_task_routing.<task>" (unknown
 * provider); either way the map was not stored, and only a fixed sentence is shown.
 */
function useRoutingSave(form: SectionForm<Routing>, setRefused: (refused: boolean) => void) {
  const save = useAiSettingsSave("settings.ai.saved");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.dirty) return;
    setRefused(false);
    save.mutate(
      { ai_task_routing: form.draft },
      {
        onSuccess: (answer) => form.commit(answer.ai_task_routing),
        onError: (error) => setRefused(fieldErrorsFrom(error, toAiField).length > 0),
      },
    );
  };
  return { submit, busy: save.isPending };
}

function useRoutingForm({ settings, report }: RoutingFormProps) {
  const form = useSectionForm<Routing>(settings.ai_task_routing);
  const [refused, setRefused] = useState(false);
  useReportDirty(report, "ai-routing", form.dirty);
  const { submit, busy } = useRoutingSave(form, setRefused);
  // A refusal belongs to the map that was sent; the next edit makes a new one (fix round M3).
  const change = (patch: Partial<Routing>) => {
    setRefused(false);
    form.set(patch);
  };
  return { form, change, refused, submit, busy };
}

/** D4: one provider per task in TASK_DEFAULTS order; one Speichern sends the full map. */
export function RoutingForm(props: RoutingFormProps) {
  const { t } = useI18n();
  const { form, change, refused, submit, busy } = useRoutingForm(props);
  const warnings = routingWarnings({ routing: form.draft, settings: props.settings });
  return (
    <DrawerSection
      id="settings-ai-routing"
      title={t("settings.ai.tasks")}
      {...{ busy, dirty: form.dirty, onSubmit: submit }}
    >
      <p className="prose routing-intro">{t("settings.ai.tasksIntro")}</p>
      <TaskRows routing={form.draft} onChange={change} />
      <RoutingNotices warnings={warnings} refused={refused} />
    </DrawerSection>
  );
}
