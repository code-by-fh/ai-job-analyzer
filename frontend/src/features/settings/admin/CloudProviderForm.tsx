"use client";

import { useState } from "react";
import { testOpenRouter, type AiSettings } from "@/api/admin";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { ConnectionTest } from "./ConnectionTest";
import { KeyField, RemoveKeyDialog } from "./KeyField";
import { ModelPicker } from "./ModelPicker";
import {
  cloudDraftOf,
  cloudErrors,
  cloudPatch,
  CLOUD_REFUSALS,
  type CloudDraft,
} from "./providerDrafts";
import { useProviderForm, type ProviderForm } from "./useProviderForm";

export interface ProviderFormProps {
  settings: AiSettings;
  report: ReportDirty;
  /** The settings query's dataUpdatedAt: it changes with every stored write (ConnectionTest). */
  revision: number;
}

const CLOUD_CONFIG = {
  dirtyId: "ai-cloud",
  draftOf: cloudDraftOf,
  errorsOf: cloudErrors,
  patchOf: cloudPatch,
  refusals: CLOUD_REFUSALS,
};

function CloudTest({ revision, dirty }: { revision: number; dirty: boolean }) {
  const { t } = useI18n();
  return (
    <ConnectionTest
      run={testOpenRouter}
      dirty={dirty}
      label={t("settings.ai.test")}
      describe={(result) => t("settings.ai.testOk", { model: result.model ?? "" })}
      revision={revision}
    />
  );
}

interface CloudFieldsProps {
  provider: ProviderForm<CloudDraft>;
  settings: AiSettings;
  onRemove: () => void;
}

function CloudFields({ provider, settings, onRemove }: CloudFieldsProps) {
  const { form, errors } = provider;
  return (
    <>
      <KeyField
        {...{ value: form.draft.key, error: errors.key, stored: settings.openrouter_api_key_set }}
        onChange={(key) => form.set({ key })}
        onRemove={onRemove}
      />
      <ModelPicker
        {...{ value: form.draft.model, error: errors.model }}
        onChange={(model) => form.set({ model })}
        keyStored={settings.openrouter_api_key_set}
        keyTyped={form.draft.key !== ""}
      />
    </>
  );
}

/** Fix round M5: after the removal the draft is the stored state, so a typed key goes too. */
function KeyRemoval({ form, onClose }: { form: SectionForm<CloudDraft>; onClose: () => void }) {
  return (
    <RemoveKeyDialog onRemoved={(answer) => form.commit(cloudDraftOf(answer))} onClose={onClose} />
  );
}

/** D2: OpenRouter with a write-only key and the model; the test checks the stored pair. */
export function CloudProviderForm({ settings, report, revision }: ProviderFormProps) {
  const { t } = useI18n();
  const provider = useProviderForm({ ...CLOUD_CONFIG, settings, report });
  const [removing, setRemoving] = useState(false);
  const { busy, form, submit } = provider;
  return (
    <>
      <DrawerSection
        id="settings-ai-cloud"
        title={t("settings.ai.cloud")}
        {...{ busy, dirty: form.dirty, onSubmit: submit }}
      >
        <CloudFields provider={provider} settings={settings} onRemove={() => setRemoving(true)} />
        <CloudTest revision={revision} dirty={form.dirty} />
      </DrawerSection>
      {removing ? <KeyRemoval form={form} onClose={() => setRemoving(false)} /> : null}
    </>
  );
}
