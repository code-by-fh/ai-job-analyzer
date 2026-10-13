import type { ReactNode } from "react";
import { cx } from "./cx";

// Views use it to hand focus to the page title (tabIndex -1 makes it focusable by script).
export const MASTHEAD_TITLE_SELECTOR = "h1.mast-title";

export interface MastheadProps {
  title: string;
  /** Section number of the sequence (01 Eingang ...); decorative, so hidden from screen readers. */
  number?: string;
  deck?: ReactNode;
  actions?: ReactNode;
  small?: boolean;
}

/** Thick rule, section number, display title and a one-line deck, as in the prototype. */
export function Masthead({ title, number, deck, actions, small = false }: MastheadProps) {
  return (
    <header className={cx("mast", small && "mast-sm")}>
      <div className="mast-main">
        {/* -1: never in the tab order, but a view that replaced the focused control can land here. */}
        <h1 className="mast-title" tabIndex={-1}>
          {number ? (
            <span className="mast-no" aria-hidden="true">
              {number}
            </span>
          ) : null}
          <span>{title}</span>
        </h1>
        {deck ? <p className="mast-deck">{deck}</p> : null}
      </div>
      {actions ? <div className="mast-actions">{actions}</div> : null}
    </header>
  );
}
