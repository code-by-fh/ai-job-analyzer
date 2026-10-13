"use client";

import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import type { FieldsProps } from "./BoundField";
import { CONTACT_FIELD_MAX, MAX_CONTACTS, newContact, type ContactRow } from "./datesForm";

export function ContactRows({ form, setForm, error }: FieldsProps) {
  const { t } = useI18n();
  const add = () =>
    setForm((current) => ({ ...current, contacts: [...current.contacts, newContact()] }));
  return (
    <fieldset className="dates-group">
      <legend className="sec-title-sm">{t("dates.contacts")}</legend>
      {form.contacts.map((contact, index) => (
        <ContactFields key={contact.id} index={index} contact={contact} {...{ setForm, error }} />
      ))}
      {form.contacts.length < MAX_CONTACTS ? (
        <Button size="sm" icon={Plus} onClick={add}>
          {t("dates.addContact")}
        </Button>
      ) : null}
    </fieldset>
  );
}

interface ContactFieldsProps extends Omit<FieldsProps, "form"> {
  index: number;
  contact: ContactRow;
}

const CONTACT_INPUTS = [
  { name: "name", label: "dates.contactName" },
  { name: "role", label: "dates.contactRole" },
  { name: "email", label: "dates.contactEmail" },
  { name: "phone", label: "dates.contactPhone" },
] as const;

const INPUT_TYPE: Readonly<Record<string, string>> = { email: "email", phone: "tel" };

interface ContactInputsProps {
  index: number;
  contact: ContactRow;
  update: (patch: Partial<ContactRow>) => void;
  error: FieldsProps["error"];
}

function useContactEdit(index: number, setForm: ContactFieldsProps["setForm"]) {
  const update = (patch: Partial<ContactRow>) =>
    setForm((form) => ({
      ...form,
      contacts: form.contacts.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    }));
  const remove = () =>
    setForm((form) => ({ ...form, contacts: form.contacts.filter((_, at) => at !== index) }));
  return { update, remove };
}

function ContactInputs({ index, contact, update, error }: ContactInputsProps) {
  const { t } = useI18n();
  return CONTACT_INPUTS.map(({ name, label }) => (
    <TextField
      key={name}
      id={`contact-${index}-${name}`}
      type={INPUT_TYPE[name] ?? "text"}
      label={t(label, { number: index + 1 })}
      value={contact[name]}
      maxLength={CONTACT_FIELD_MAX}
      error={error(`contact.${index}.${name}`)}
      onChange={(event) => update({ [name]: event.target.value })}
    />
  ));
}

function ContactFields({ index, contact, setForm, error }: ContactFieldsProps) {
  const { t } = useI18n();
  const { update, remove } = useContactEdit(index, setForm);
  return (
    <div className="dates-contact">
      <ContactInputs {...{ index, contact, update, error }} />
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon={Trash2}
        aria-label={t("dates.removeContact", { number: index + 1 })}
        onClick={remove}
      />
    </div>
  );
}
