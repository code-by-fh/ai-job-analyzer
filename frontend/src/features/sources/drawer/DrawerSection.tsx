"use client";

import type { FormEvent, ReactNode } from "react";
import type { Platform } from "@/api/platforms";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import type { ReportDirty } from "./useDirtySections";

/** What every section of SourceDrawer's section list receives (Tasks 10-11 add theirs). */
export interface SectionProps {
  platform: Platform;
  report: ReportDirty;
}

interface DrawerSectionProps {
  /** Prefix of the section's ids; the heading names the form. */
  id: string;
  title: string;
  /**
   * The id of a visible name outside the form (a settings channel row's name): the form is named by
   * it and renders no heading of its own, so heading navigation is not repeated.
   */
  labelledBy?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  /** Spec 5: the vermilion "Speichern" is inactive (still focusable) while nothing is edited. */
  dirty: boolean;
  children: ReactNode;
}

function SectionTitle({ id, title }: { id: string; title: string }) {
  return (
    <h3 id={id} className="sec-title-sm">
      {title}
    </h3>
  );
}

/** D5: each editable section is its own form with its own "Speichern"; validated on submit only. */
export function DrawerSection(props: DrawerSectionProps) {
  const { id, title, labelledBy, onSubmit, busy, dirty, children } = props;
  const headingId = `${id}-h`;
  return (
    <form
      className="drawer-section"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={labelledBy ?? headingId}
    >
      {labelledBy ? null : <SectionTitle id={headingId} title={title} />}
      {children}
      <SectionFoot busy={busy} dirty={dirty} />
    </form>
  );
}

function SectionFoot({ busy, dirty }: Pick<DrawerSectionProps, "busy" | "dirty">) {
  const { t } = useI18n();
  return (
    <div className="drawer-section-foot">
      <Button type="submit" variant="primary" size="sm" busy={busy} inactive={!dirty}>
        {t("dates.save")}
      </Button>
    </div>
  );
}
