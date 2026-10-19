import type { ReactNode } from "react";

interface WizardGroupProps {
  /** The heading's id: it names the group, and a fieldset inside can point at it. */
  headingId: string;
  title: string;
  children: ReactNode;
}

/** One framed decision of a wizard step under its own heading (feedback 1, T5: clearer grouping). */
export function WizardGroup({ headingId, title, children }: WizardGroupProps) {
  return (
    <section className="wizard-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="sec-title-sm">
        {title}
      </h3>
      {children}
    </section>
  );
}
