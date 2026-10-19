"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { jobCountsQueryOptions, openMatchCount, type JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { NotesEditor } from "../history/NotesEditor";
import { MOVE_ON_NOTES } from "./outcomeNotes";
import { firstQuoteIndex, nextQuoteIndex, QUOTES } from "./quotes";

/**
 * Feedback 1 T14: the tab of a closed application without a job. REJECTED is an employer's
 * rejection, a withdrawal or a declined offer (D4), so nothing here assumes who said no.
 */
export function MoveOnTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <div className="outcome">
      <Quote jobId={job.id} />
      <div className="fit-grid outcome-grid">
        <div>
          <h3 className="sec-title-sm">{t("moveOn.nextTitle")}</h3>
          <p className="outcome-lead">{t("moveOn.lead")}</p>
          <InboxLink />
        </div>
        <div className="history-side">
          <NotesEditor job={job} spec={MOVE_ON_NOTES} />
        </div>
      </div>
    </div>
  );
}

function Quote({ jobId }: { jobId: string }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(() => firstQuoteIndex(jobId));
  const quote = QUOTES[index];
  return (
    <figure className="outcome-quote">
      <blockquote>
        <p>{t(quote.text)}</p>
      </blockquote>
      <figcaption className="meta">{t(quote.source)}</figcaption>
      <Button variant="ghost" icon={RefreshCw} onClick={() => setIndex(nextQuoteIndex)}>
        {t("moveOn.anotherQuote")}
      </Button>
    </figure>
  );
}

/** The way back to the search, with the inbox's new matches once they are known. */
function InboxLink() {
  const { t } = useI18n();
  const counts = useQuery(jobCountsQueryOptions());
  const matches = counts.data ? openMatchCount(counts.data) : null;
  return (
    <div className="outcome-next">
      <Link className="btn btn-primary" href="/inbox">
        {t("moveOn.toInbox")}
      </Link>
      {matches ? (
        <p className="meta">
          {matches === 1 ? t("moveOn.matchesOne") : t("moveOn.matchesMany", { count: matches })}
        </p>
      ) : null}
    </div>
  );
}
