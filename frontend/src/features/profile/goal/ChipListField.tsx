"use client";

import { X } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { chipProblem, type ChipLimits, type ChipProblem } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { describedBy, Field } from "@/ui/Field";
import { Icon } from "@/ui/Icon";

export interface ChipListFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  limits: ChipLimits;
}

type ShownProblem = Exclude<ChipProblem, "empty">;

const PROBLEM_TEXT: Readonly<Record<ShownProblem, MessageKey>> = {
  duplicate: "profile.chip.duplicate",
  tooLong: "profile.chip.tooLong",
  full: "profile.chip.full",
  comma: "profile.chip.comma",
};

/** Prototype chipEditor: one entry at a time, Enter or "Hinzufügen"; a named remove button per chip. */
export function ChipListField(props: ChipListFieldProps) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<ShownProblem | null>(null);
  const limits = { max: props.limits.maxItems, length: props.limits.maxLength };
  const error = props.error ?? (problem ? t(PROBLEM_TEXT[problem], limits) : undefined);
  // R13: a refusal is about the entry as typed; once the list changes it no longer holds.
  const removed = (items: string[]) => {
    setProblem(null);
    props.onChange(items);
  };
  return (
    <Field id={props.id} label={props.label} hint={props.hint} error={error}>
      <ChipInput field={props} error={error} onProblem={setProblem} />
      <ChipItems {...props} onChange={removed} />
    </Field>
  );
}

interface ChipInputProps {
  field: ChipListFieldProps;
  error: string | undefined;
  onProblem: (problem: ShownProblem | null) => void;
}

/** Enter adds a chip; it must not submit the section form. */
function enterAdds(add: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };
}

/** An empty entry is ignored silently; every other refusal names its reason. */
function useChipEntry({ field, onProblem }: ChipInputProps) {
  const [text, setText] = useState("");
  const add = () => {
    const found = chipProblem(field.items, text, field.limits);
    if (found === "empty") return;
    onProblem(found);
    if (found) return;
    field.onChange([...field.items, text.trim()]);
    setText("");
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    onProblem(null);
  };
  return { add, input: { value: text, onChange, onKeyDown: enterAdds(add) } };
}

function ChipInput(props: ChipInputProps) {
  const { t } = useI18n();
  const { id, hint, limits } = props.field;
  const entry = useChipEntry(props);
  return (
    <div className="chip-input">
      <input
        id={id}
        className="input"
        placeholder={t("profile.chip.placeholder")}
        maxLength={limits.maxLength}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error: props.error })}
        {...entry.input}
      />
      <Button onClick={entry.add}>{t("profile.chip.add")}</Button>
    </div>
  );
}

function ChipItems({ id, label, items, onChange }: ChipListFieldProps) {
  const { t } = useI18n();
  const remove = (index: number) => {
    onChange(items.filter((_item, position) => position !== index));
    // The removed button is gone; the input is the next place to act.
    document.getElementById(id)?.focus();
  };
  if (items.length === 0) return null;
  return (
    // Its own name: the input already carries the field label.
    <ul role="list" className="chip-list" aria-label={t("profile.chip.list", { label })}>
      {items.map((item, index) => (
        <ChipItem key={item} item={item} onRemove={() => remove(index)} />
      ))}
    </ul>
  );
}

function ChipItem({ item, onRemove }: { item: string; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <li className="tag chip-item">
      <span>{item}</span>
      <button
        type="button"
        className="chip-remove"
        aria-label={t("profile.chip.remove", { item })}
        onClick={onRemove}
      >
        <Icon icon={X} />
      </button>
    </li>
  );
}
