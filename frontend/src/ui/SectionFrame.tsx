import type { ReactNode } from "react";

export interface SectionFrameProps {
  /** The heading's id: the section's name and a focus target after an item disappears. */
  headingId: string;
  label: string;
  intro: string;
  /** The page's class prefix: `${classPrefix}-section` and `${classPrefix}-intro`. */
  classPrefix: string;
  children?: ReactNode;
}

/** The open section of an in-page sub-nav: its heading (tabIndex -1) and one-line intro. */
export function SectionFrame(props: Readonly<SectionFrameProps>) {
  const { headingId, classPrefix } = props;
  return (
    <section className={`${classPrefix}-section`} aria-labelledby={headingId}>
      <h2 id={headingId} className="sec-title" tabIndex={-1}>
        {props.label}
      </h2>
      <p className={`prose ${classPrefix}-intro`}>{props.intro}</p>
      {props.children}
    </section>
  );
}
