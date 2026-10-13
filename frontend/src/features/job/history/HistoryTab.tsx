"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { NotesEditor } from "./NotesEditor";
import { Timeline } from "./Timeline";
import { TodoList } from "./TodoList";

/** Prototype tabHistory plus the to-dos that used to live in localStorage (C.2, now B7). */
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
        <TodoList job={job} />
      </div>
    </div>
  );
}
