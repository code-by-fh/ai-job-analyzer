import type { ReactNode } from "react";
import type { PrepSectionKey } from "@/domain/interviewPrep";
import type { MessageKey } from "@/i18n/de";

export const PREP_SECTION_TITLE: Readonly<Record<PrepSectionKey, MessageKey>> = {
  pitch: "prep.pitch",
  gaps: "prep.gaps",
  uncertainties: "prep.uncertainties",
  depth: "prep.depth",
  deepDives: "company.deepDives",
  contacts: "prep.contacts",
  sources: "prep.sources",
};

/** The anchor of a section; one prep per page, so the ids are fixed. */
export const prepSectionId = (key: PrepSectionKey | "overview") => `prep-${key}`;

interface PrepSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

/** Every prep section has the same head: a 2 px rule and a small display title. */
export function PrepSection({ id, title, children }: PrepSectionProps) {
  return (
    <section className="prep-sec" id={id}>
      <h3 className="sec-title-sm">{title}</h3>
      {children}
    </section>
  );
}
