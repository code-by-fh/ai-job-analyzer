"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { NotesEditor } from "./NotesEditor";
import { Timeline } from "./Timeline";

/** Prototype tabHistory; the to-dos moved to the side column (Feedback 1 T13). */
export function HistoryTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <div className="fit-grid history">
      <section>
        <h3 className="sec-title-sm">{t("history.title")}</h3>
        <Timeline job={job} />
      </section>
      <div className="history-side">
        <NotesEditor job={job} />
      </div>
    </div>
  );
}
