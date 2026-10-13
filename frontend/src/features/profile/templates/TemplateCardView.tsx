"use client";

import { Eye, Trash2 } from "lucide-react";
import { canBeDefault, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { formatDate } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { cardName, previewButtonId } from "./labels";
import { TemplateStateLine } from "./TemplateStateLine";
import { useSelectDefault } from "./useTemplateActions";

export interface TemplateCardViewProps {
  card: TemplateCard;
  kind: TemplateKind;
  isDefault: boolean;
  onPreview: (card: TemplateCard) => void;
  onDelete: (card: TemplateCard) => void;
}

interface CardPartProps {
  card: TemplateCard;
  kind: TemplateKind;
  name: string;
}

const THUMB_LINES = 9;
const LINES = Array.from({ length: THUMB_LINES }, (_value, index) => index);

function Thumb({ kind }: { kind: TemplateKind }) {
  return (
    <div className={cx("tpl-thumb", kind === "letter" && "is-letter")} aria-hidden="true">
      <div className="thumb-in">
        {LINES.map((line) => (
          <i key={line} />
        ))}
      </div>
    </div>
  );
}

function useCardMeta(card: TemplateCard): string {
  const { t, language } = useI18n();
  if (card.origin === "builtin") return t("profile.templates.builtin");
  if (card.origin === "global") return t("profile.templates.global");
  return card.createdAt
    ? t("profile.templates.uploadedOn", { date: formatDate(card.createdAt, language) })
    : "";
}

function CardTitle({ card, name }: { card: TemplateCard; name: string }) {
  return (
    <div>
      <div className="tpl-name">{name}</div>
      <div className="tpl-meta">{useCardMeta(card)}</div>
    </div>
  );
}

/** D9: a list item with separate buttons (no nested interactive elements). */
export function TemplateCardView(props: TemplateCardViewProps) {
  const { card, kind, isDefault } = props;
  const { t } = useI18n();
  const name = cardName(card, t);
  return (
    <li
      className={cx("tpl", isDefault && "is-default")}
      aria-busy={card.state === "processing" || undefined}
    >
      <Thumb kind={kind} />
      <CardTitle card={card} name={name} />
      <TemplateStateLine state={card.state} />
      <DefaultControl card={card} kind={kind} name={name} isDefault={isDefault} />
      <div className="row tpl-actions">
        <PreviewButton card={card} kind={kind} name={name} onPreview={props.onPreview} />
        <DeleteButton card={card} name={name} onDelete={props.onDelete} />
      </div>
    </li>
  );
}

function PreviewButton(props: CardPartProps & Pick<TemplateCardViewProps, "onPreview">) {
  const { t } = useI18n();
  return (
    <Button
      id={previewButtonId(props.kind, props.card.ref)}
      size="sm"
      variant="ghost"
      icon={Eye}
      aria-label={t("profile.templates.previewOf", { name: props.name })}
      onClick={() => props.onPreview(props.card)}
    >
      {t("preview.title")}
    </Button>
  );
}

/** Bundled and global templates are not the user's to delete (Task 3 answers 404). */
function DeleteButton(
  props: Omit<CardPartProps, "kind"> & Pick<TemplateCardViewProps, "onDelete">,
) {
  const { t } = useI18n();
  if (props.card.origin !== "own") return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={Trash2}
      aria-label={t("profile.templates.deleteOf", { name: props.name })}
      onClick={() => props.onDelete(props.card)}
    />
  );
}

/**
 * The default reads as a line; a template the AI is still filling (or stalled) cannot be selected
 * (409), so it offers no button: its state line says why (ruling R17, one line). Rejected and
 * failed fills stay selectable: the original HTML renders, without profile data.
 */
function DefaultControl(props: CardPartProps & { isDefault: boolean }) {
  const { t } = useI18n();
  const select = useSelectDefault();
  if (props.isDefault) return <p className="tpl-default">{t("profile.templates.isDefault")}</p>;
  if (!canBeDefault(props.card)) return null;
  return (
    <div>
      <Button
        size="sm"
        busy={select.isPending}
        onClick={() => select.mutate({ kind: props.kind, ref: props.card.ref, name: props.name })}
      >
        {t("profile.templates.makeDefault")}
      </Button>
    </div>
  );
}
