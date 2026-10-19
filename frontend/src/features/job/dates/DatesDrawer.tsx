"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { PanelHeader } from "@/ui/PanelHeader";
import { followUpLabel } from "../labels";
import { ContactRows } from "./ContactRows";
import { DateFields, RecruiterFields, SalaryFields } from "./DatesFields";
import { useDatesSubmit } from "./useDatesSubmit";

/** The field the drawer opens on; without one the ModalLayer focuses the first control. */
export type DatesFocus = "interviewAt";

interface DatesDrawerProps {
  job: JobDetail;
  focus?: DatesFocus;
  onClose: () => void;
}

export function DatesDrawer({ job, focus, onClose }: DatesDrawerProps) {
  const { t } = useI18n();
  const { form, setForm, submit, error, saving } = useDatesSubmit(job, onClose);
  const fields = { form, setForm, error };
  return (
    <Drawer open onClose={onClose} label={t("dates.title")} variant="narrow">
      <form className="panel-in" onSubmit={submit} noValidate>
        <PanelHeader title={t("dates.title")} onClose={onClose} />
        <DateFields {...fields} followUpName={t(followUpLabel(job))} focus={focus} />
        <ContactRows {...fields} />
        <RecruiterFields {...fields} />
        <SalaryFields {...fields} />
        <Button type="submit" variant="primary" className="dates-save" busy={saving}>
          {t("dates.save")}
        </Button>
      </form>
    </Drawer>
  );
}
