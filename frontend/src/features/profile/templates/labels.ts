import type { TemplateCard, TemplateKind } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

/**
 * Bundled template keys are server file names; known ones get a translated name (D9). A Map, so a
 * file named like a prototype key ("constructor") reads as its own name.
 */
export const FILE_TEMPLATE_LABEL: ReadonlyMap<string, MessageKey> = new Map([
  ["classic", "profile.templates.classic"],
]);

export const KIND_TITLE: Readonly<Record<TemplateKind, MessageKey>> = {
  cv: "profile.templates.kind.cv",
  letter: "profile.templates.kind.letter",
};

export function cardName(card: TemplateCard, t: Translate): string {
  const label = card.origin === "builtin" ? FILE_TEMPLATE_LABEL.get(card.ref) : undefined;
  return label ? t(label) : card.name;
}

/** Ruling 20: "Als Standard" unmounts after its own action; this button of the card takes focus. */
export const previewButtonId = (kind: TemplateKind, ref: string) => `pf-tpl-${kind}-${ref}-preview`;
