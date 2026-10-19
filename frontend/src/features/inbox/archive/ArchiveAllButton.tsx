"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { archiveAllJobs } from "@/api/account";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Archive } from "lucide-react";
import { Button } from "@/ui/Button";
import { CheckField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { useConfirmation } from "@/features/settings/useConfirmation";

interface ArchiveOptions {
  keepFavorites: boolean;
  keepApplications: boolean;
}

const KEEP_ALL: ArchiveOptions = { keepFavorites: true, keepApplications: true };
const OPENER_ID = "inbox-archive-open";

/** Preflight ruling 48: none, one, or the count. */
function archivedText(count: number, t: Translate): string {
  if (count === 0) return t("settings.account.archivedNone");
  if (count === 1) return t("settings.account.archivedOne");
  return t("settings.account.archived", { count });
}

/** Ruling 48: the question says what an unchecked option adds to the archive. */
function questionText(options: ArchiveOptions, t: Translate): string {
  return [
    t("settings.account.archiveText"),
    options.keepFavorites ? null : t("settings.account.archiveAlsoFavorites"),
    options.keepApplications ? null : t("settings.account.archiveAlsoApplications"),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * R10: the lists, the nav counts and the onboarding (has_jobs) read the archived jobs; so do the
 * sources' job counts and the inbox threshold's distribution and preview, which count active jobs,
 * and the company directory's job counts.
 */
const ARCHIVE_READERS = [
  queryKeys.jobsRoot,
  queryKeys.companiesRoot,
  queryKeys.jobCounts,
  queryKeys.setupStatus,
  queryKeys.platforms,
  queryKeys.thresholdDistribution,
  queryKeys.thresholdPreviewRoot,
];

function useArchiveAll(onDone: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: archiveAllJobs,
    onSuccess: (count) => {
      toast.show({ tone: "success", message: archivedText(count, t) });
      onDone();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
    onSettled: () =>
      ARCHIVE_READERS.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey })),
  });
}

interface KeepChecksProps {
  options: ArchiveOptions;
  onChange: (options: ArchiveOptions) => void;
}

function KeepChecks({ options, onChange }: KeepChecksProps) {
  const { t } = useI18n();
  return (
    <>
      <CheckField
        id="inbox-archive-favorites"
        label={t("settings.account.keepFavorites")}
        checked={options.keepFavorites}
        onChange={(keepFavorites) => onChange({ ...options, keepFavorites })}
      />
      <CheckField
        id="inbox-archive-applications"
        label={t("settings.account.keepApplications")}
        checked={options.keepApplications}
        onChange={(keepApplications) => onChange({ ...options, keepApplications })}
      />
    </>
  );
}

/** Primary, not danger: archived jobs stay restorable under "Von dir aussortiert" (spec 5). */
function ArchiveDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<ArchiveOptions>(KEEP_ALL);
  const archive = useArchiveAll(onDone);
  return (
    <ConfirmDialog
      title={t("settings.account.archive")}
      confirmLabel={t("settings.account.archiveConfirm")}
      tone="primary"
      busy={archive.isPending}
      onConfirm={() => archive.mutate(options)}
      onClose={onClose}
    >
      <p className="prose">{questionText(options, t)}</p>
      <KeepChecks options={options} onChange={setOptions} />
    </ConfirmDialog>
  );
}

function ArchiveTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button id={OPENER_ID} size="sm" icon={Archive} onClick={onClick}>
      {t("settings.account.archive")}
    </Button>
  );
}

/**
 * Masthead action "Alle Stellen archivieren" (feedback 1, T9): archives the inbox matches after a
 * question; both keep options start checked. A labelled secondary button at every width.
 */
export function ArchiveAllButton() {
  const confirmation = useConfirmation(OPENER_ID);
  return (
    <>
      <ArchiveTrigger onClick={confirmation.ask} />
      {confirmation.open ? (
        <ArchiveDialog onDone={confirmation.done} onClose={confirmation.cancel} />
      ) : null}
    </>
  );
}
