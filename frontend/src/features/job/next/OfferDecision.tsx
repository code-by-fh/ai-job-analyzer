"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useChangeStatus } from "../phase/useChangeStatus";
import { useOpenTab } from "../tabs/JobTabs";

function useOfferChoices(job: JobDetail) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  return {
    isPending,
    accept: () => void changeStatus({ to: "ACCEPTED" }),
    decline: () => void changeStatus({ to: "REJECTED", note: t("offer.declined") }),
  };
}

/** Prototype offer row: accept, decline (REJECTED plus note, decision D4) or start a negotiation note. */
export function OfferDecision({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const choices = useOfferChoices(job);
  const openTab = useOpenTab();
  return (
    <div className="row" id="offer-decision">
      <Button variant="primary" busy={choices.isPending} onClick={choices.accept}>
        {t("offer.accepted")}
      </Button>
      <Button busy={choices.isPending} onClick={choices.decline}>
        {t("offer.declined")}
      </Button>
      <Button variant="ghost" onClick={() => openTab("history")}>
        {t("offer.note")}
      </Button>
    </div>
  );
}
