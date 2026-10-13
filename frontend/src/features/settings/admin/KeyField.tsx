"use client";

import type { AiSettings } from "@/api/admin";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { closeThenFocus } from "@/ui/focus";
import { ConfirmDialog } from "../ConfirmDialog";
import { useAiSettingsSave } from "./useAiSettingsSave";

const KEY_INPUT_ID = "settings-ai-key";
const keyInput = () => document.getElementById(KEY_INPUT_ID);

export interface KeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Only "is one stored" is known; the key itself never reaches the browser (R4). */
  stored: boolean;
  error?: MessageKey;
  /** Asks to remove the stored key; its dialog renders outside the form (ruling 20). */
  onRemove: () => void;
}

/** R4: write-only, empty at the start; the hint says whether a key is stored. */
export function KeyField({ value, onChange, stored, error, onRemove }: KeyFieldProps) {
  const { t } = useI18n();
  return (
    <>
      <TextField
        id={KEY_INPUT_ID}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        label={t("settings.ai.key")}
        hint={t(stored ? "settings.ai.keyStored" : "settings.ai.keyMissing")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error ? t(error) : undefined}
      />
      {stored ? <RemoveKeyButton onClick={onRemove} /> : null}
    </>
  );
}

function RemoveKeyButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button className="ai-key-remove" variant="ghost" size="sm" onClick={onClick}>
      {t("settings.ai.keyRemove")}
    </Button>
  );
}

/**
 * D2: removal asks first (danger) and sends "", which the server stores as no key. Rendered
 * outside the provider form: a portal's submit still bubbles through the React tree.
 */
interface RemoveKeyDialogProps {
  /** The stored state without a key: the form drops its draft, a typed key included. */
  onRemoved: (answer: AiSettings) => void;
  onClose: () => void;
}

export function RemoveKeyDialog({ onRemoved, onClose }: RemoveKeyDialogProps) {
  const { t } = useI18n();
  const remove = useAiSettingsSave("settings.ai.keyRemoved");
  // The remove button goes with the stored key, so focus moves to the key input.
  const removed = (answer: AiSettings) => {
    onRemoved(answer);
    closeThenFocus(onClose, keyInput);
  };
  return (
    <ConfirmDialog
      title={t("settings.ai.keyRemoveTitle")}
      confirmLabel={t("settings.ai.keyRemove")}
      busy={remove.isPending}
      onConfirm={() => remove.mutate({ openrouter_api_key: "" }, { onSuccess: removed })}
      onClose={onClose}
    >
      <p className="prose">{t("settings.ai.keyRemoveText")}</p>
    </ConfirmDialog>
  );
}
