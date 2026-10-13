"use client";

import type { JobPage } from "@/api/jobList";
import { roundScore } from "@/domain/scoreBand";
import { navNumber } from "@/features/shell/navigation";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { ImportButton } from "./import/ImportButton";
import { RunLine } from "./RunLine";
import { useInboxList } from "./useInboxLists";

/** Spec 4.2: masthead with the status lede (new matches, last crawl, next run). */
export function InboxHeader({ onShowBelow }: { onShowBelow?: () => void }) {
  const { t } = useI18n();
  const fresh = useInboxList("new");
  const first = fresh.data?.pages[0];
  return (
    <>
      <Masthead
        small
        number={navNumber("inbox")}
        title={t("nav.inbox")}
        deck={first ? <Deck page={first} t={t} /> : undefined}
        actions={<ImportButton />}
      />
      <RunLine onShowBelow={onShowBelow} />
    </>
  );
}

/** Decision D11: "{n} neue Treffer. Am stärksten: {company} mit {score}." (the list is sorted by score). */
function Deck({ page, t }: { page: JobPage; t: Translate }) {
  if (page.total === 0) return t("inbox.deck.empty");
  const count =
    page.total === 1 ? t("inbox.deck.one") : t("inbox.deck.many", { count: page.total });
  const top = page.items[0];
  const score = top?.match_score;
  const company = top?.company ?? t("job.unknownCompany");
  const strongest =
    typeof score === "number"
      ? ` ${t("inbox.deck.top", { company, score: roundScore(score) })}`
      : null;
  return (
    <>
      <b>{count}</b>
      {strongest}
    </>
  );
}
