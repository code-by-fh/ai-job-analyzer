"use client";

import Link from "next/link";
import { Fragment } from "react";

/** A labelled second list of the nav (Einstellungen's "Administration"). */
export interface SubNavGroup<Section extends string> {
  id: string;
  label: string;
  sections: readonly Section[];
}

export interface SubNavProps<Section extends string> {
  sections: readonly Section[];
  /** null while the open section is not known yet (nothing is marked). */
  current: Section | null;
  hrefOf: (section: Section) => string;
  labelOf: (section: Section) => string;
  /** The nav's accessible name. */
  navLabel: string;
  /** The page's class prefix: the nav gets `${classPrefix}-nav`, styled by the page's CSS. */
  classPrefix: string;
  /** Lists after the main one, each under its own label (`${classPrefix}-nav-group`). */
  groups?: readonly SubNavGroup<Section>[];
}

type SectionListProps<Section extends string> = Pick<
  SubNavProps<Section>,
  "sections" | "current" | "hrefOf" | "labelOf"
> & { labelledBy?: string };

function SectionList<Section extends string>(props: Readonly<SectionListProps<Section>>) {
  const { sections, current, hrefOf, labelOf } = props;
  return (
    <ul role="list" aria-labelledby={props.labelledBy}>
      {sections.map((section) => (
        <li key={section}>
          <Link href={hrefOf(section)} aria-current={section === current ? "page" : undefined}>
            {labelOf(section)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * An in-page sub-nav (Profil, Einstellungen): links, not tabs, so each section is a URL and the
 * unsaved guard intercepts in-app links; the open one is `aria-current="page"`.
 */
export function SubNav<Section extends string>(props: Readonly<SubNavProps<Section>>) {
  const { groups = [], classPrefix, navLabel, ...list } = props;
  return (
    <nav className={`${classPrefix}-nav`} aria-label={navLabel}>
      <SectionList {...list} />
      {groups.map((group) => (
        <Fragment key={group.id}>
          <p className={`${classPrefix}-nav-group`} id={group.id}>
            {group.label}
          </p>
          <SectionList {...list} sections={group.sections} labelledBy={group.id} />
        </Fragment>
      ))}
    </nav>
  );
}
