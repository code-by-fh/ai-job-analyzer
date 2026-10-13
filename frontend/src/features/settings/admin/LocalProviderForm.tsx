"use client";

import { testLocalModel, type ConnectionResult } from "@/api/admin";
import { ADMIN_LIMITS } from "@/api/adminPaths";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import type { ProviderFormProps } from "./CloudProviderForm";
import { ConnectionTest } from "./ConnectionTest";
import { ModelField } from "./ModelField";
import {
  localDraftOf,
  localErrors,
  localPatch,
  LOCAL_REFUSALS,
  type LocalDraft,
} from "./providerDrafts";
import { useProviderForm, type ProviderForm } from "./useProviderForm";

const LOCAL_CONFIG = {
  dirtyId: "ai-local",
  draftOf: localDraftOf,
  errorsOf: localErrors,
  patchOf: localPatch,
  refusals: LOCAL_REFUSALS,
};

/** D2: at most 10 of the server's model names (provider data, shown as text), the rest as a count. */
function describeLocal(result: ConnectionResult, t: Translate): string {
  if (result.model_found) return t("settings.ai.modelFound");
  const available = result.available_models ?? [];
  const shown = available.slice(0, ADMIN_LIMITS.availableModelsShown).join(", ");
  const rest = available.length - ADMIN_LIMITS.availableModelsShown;
  const models =
    rest > 0 ? t("settings.ai.modelMissingMore", { models: shown, count: rest }) : shown;
  return t("settings.ai.modelMissing", { models });
}

function LocalTest({ revision, dirty }: { revision: number; dirty: boolean }) {
  const { t } = useI18n();
  return (
    <ConnectionTest
      run={testLocalModel}
      dirty={dirty}
      label={t("settings.ai.test")}
      describe={(result) => describeLocal(result, t)}
      revision={revision}
    />
  );
}

interface AddressFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: MessageKey;
}

function AddressField({ value, onChange, error }: AddressFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id="settings-ai-local-url"
      type="url"
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      label={t("settings.ai.baseUrl")}
      hint={t("settings.ai.baseUrlHint")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error ? t(error) : undefined}
    />
  );
}

function LocalFields({ provider }: { provider: ProviderForm<LocalDraft> }) {
  const { form, errors } = provider;
  return (
    <>
      <AddressField
        value={form.draft.url}
        onChange={(url) => form.set({ url })}
        error={errors.url}
      />
      <ModelField
        {...{ id: "settings-ai-local-model", value: form.draft.model, error: errors.model }}
        onChange={(model) => form.set({ model })}
      />
    </>
  );
}

/** D2: the local server (LM Studio, Ollama) by its admin-trusted LAN address (R8b) and model. */
export function LocalProviderForm({ settings, report, revision }: ProviderFormProps) {
  const { t } = useI18n();
  const provider = useProviderForm({ ...LOCAL_CONFIG, settings, report });
  const { busy, form, submit } = provider;
  return (
    <DrawerSection
      id="settings-ai-local"
      title={t("settings.ai.local")}
      {...{ busy, dirty: form.dirty, onSubmit: submit }}
    >
      <LocalFields provider={provider} />
      <LocalTest revision={revision} dirty={form.dirty} />
    </DrawerSection>
  );
}
