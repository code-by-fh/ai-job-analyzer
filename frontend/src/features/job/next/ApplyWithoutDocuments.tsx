"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { DOCUMENT_KINDS } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { DOCUMENT_LABEL } from "../labels";
import { useChangeStatus } from "../phase/useChangeStatus";

/** Prototype renderApplyWithout: an inline warning naming what is missing (spec 4.2 guard). */
export function ApplyWithoutDocuments({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [warning, setWarning] = useState(false);
  if (!warning) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setWarning(true)}>
        {t("applyWithout.open")}
      </Button>
    );
  }
  return <Warning job={job} onCancel={() => setWarning(false)} />;
}

function Warning({ job, onCancel }: { job: JobDetail; onCancel: () => void }) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  return (
    <div className="row">
      <Button size="sm" busy={isPending} onClick={() => void changeStatus({ to: "APPLIED" })}>
        {t("applyWithout.confirm")}
      </Button>
      <MissingWarning job={job} />
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

function MissingWarning({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const presence = documentPresence(job);
  const parts = DOCUMENT_KINDS.map((kind) =>
    t(presence[kind] ? "applyWithout.ready" : "applyWithout.missing", {
      doc: t(DOCUMENT_LABEL[kind]),
    }),
  );
  return (
    <span className="inline-warn" role="alert">
      <Icon icon={TriangleAlert} />
      <span>
        {parts.join(", ")}. {t("applyWithout.question")}
      </span>
    </span>
  );
}
