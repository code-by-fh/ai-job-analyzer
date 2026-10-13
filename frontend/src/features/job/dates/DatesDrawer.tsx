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

export function DatesDrawer({ job, onClose }: { job: JobDetail; onClose: () => void }) {
  const { t } = useI18n();
  const { form, setForm, submit, error, saving } = useDatesSubmit(job, onClose);
  const fields = { form, setForm, error };
  return (
    <Drawer open onClose={onClose} label={t("dates.title")} variant="narrow">
      <form className="panel-in" onSubmit={submit} noValidate>
        <PanelHeader title={t("dates.title")} onClose={onClose} />
        <DateFields {...fields} followUpName={t(followUpLabel(job))} />
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
