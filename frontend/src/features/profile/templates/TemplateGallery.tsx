"use client";

import { useState } from "react";
import type { Profile } from "@/api/profile";
import type { DocumentTemplate, FileTemplates } from "@/api/templates";
import { defaultRef, galleryOf, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { DeleteTemplateDialog } from "./DeleteTemplateDialog";
import { KIND_TITLE } from "./labels";
import { TemplateCardView } from "./TemplateCardView";
import { TemplatePreview } from "./TemplatePreview";
import { TemplateUpload } from "./TemplateUpload";
import { useTemplateOutcomes } from "./useTemplateOutcomes";

export interface TemplateGalleryProps {
  kind: TemplateKind;
  profile: Profile;
  templates: readonly DocumentTemplate[];
  files: FileTemplates;
}

interface GalleryCardsProps {
  kind: TemplateKind;
  cards: readonly TemplateCard[];
  current: string;
}

/**
 * D9: one kind's cards, then the upload card (D10); the default is the stored one, or the bundled
 * fallback the server uses.
 */
export function TemplateGallery({ kind, profile, templates, files }: TemplateGalleryProps) {
  const { t } = useI18n();
  const now = useNow();
  const cards = galleryOf({ kind, files, templates, now });
  useTemplateOutcomes(cards);
  const headingId = `pf-templates-${kind}-h`;
  return (
    <section className="tpl-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="sec-title-sm">
        {t(KIND_TITLE[kind])}
      </h3>
      <GalleryCards kind={kind} cards={cards} current={defaultRef(kind, profile, cards)} />
    </section>
  );
}

interface OpenCard {
  mode: "preview" | "delete";
  card: TemplateCard;
}

/** One dialog at a time; it stays mounted when its card goes, so a delete can finish and close. */
function GalleryCards({ kind, cards, current }: GalleryCardsProps) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  return (
    <>
      <CardList kind={kind} cards={cards} current={current} onOpen={setOpen} />
      {open ? (
        <GalleryDialog kind={kind} current={current} open={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function CardList({
  onOpen,
  ...gallery
}: GalleryCardsProps & { onOpen: (open: OpenCard) => void }) {
  return (
    <ul role="list" className="gallery">
      {gallery.cards.map((card) => (
        <TemplateCardView
          key={card.ref}
          card={card}
          kind={gallery.kind}
          isDefault={card.ref === gallery.current}
          onPreview={(shown) => onOpen({ mode: "preview", card: shown })}
          onDelete={(doomed) => onOpen({ mode: "delete", card: doomed })}
        />
      ))}
      <TemplateUpload kind={gallery.kind} />
    </ul>
  );
}

interface GalleryDialogProps {
  kind: TemplateKind;
  current: string;
  open: OpenCard;
  onClose: () => void;
}

function GalleryDialog({ kind, current, open, onClose }: GalleryDialogProps) {
  if (open.mode === "preview")
    return <TemplatePreview kind={kind} card={open.card} onClose={onClose} />;
  return (
    <DeleteTemplateDialog
      card={open.card}
      isDefault={open.card.ref === current}
      onClose={onClose}
    />
  );
}
