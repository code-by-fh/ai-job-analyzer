"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { archiveAllJobs } from "@/api/account";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useConfirmation } from "../useConfirmation";

interface ArchiveOptions {
  keepFavorites: boolean;
  keepApplications: boolean;
}

const KEEP_ALL: ArchiveOptions = { keepFavorites: true, keepApplications: true };
const HEADING_ID = "settings-archive-h";
const OPENER_ID = "settings-archive-open";

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

interface ArchiveDialogProps {
  options: ArchiveOptions;
  onDone: () => void;
  onClose: () => void;
}

/** Primary, not danger: archived jobs stay restorable under "Von dir aussortiert" (spec 5). */
function ArchiveDialog({ options, onDone, onClose }: ArchiveDialogProps) {
  const { t } = useI18n();
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
    </ConfirmDialog>
  );
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
        id="settings-archive-favorites"
        label={t("settings.account.keepFavorites")}
        checked={options.keepFavorites}
        onChange={(keepFavorites) => onChange({ ...options, keepFavorites })}
      />
      <CheckField
        id="settings-archive-applications"
        label={t("settings.account.keepApplications")}
        checked={options.keepApplications}
        onChange={(keepApplications) => onChange({ ...options, keepApplications })}
      />
    </>
  );
}

/** Phase 3 G8: archives the inbox matches after a question; both keep options start checked. */
export function ArchiveAll() {
  const { t } = useI18n();
  const [options, setOptions] = useState<ArchiveOptions>(KEEP_ALL);
  const confirmation = useConfirmation(OPENER_ID);
  return (
    <section className="settings-block account-block" aria-labelledby={HEADING_ID}>
      <h3 id={HEADING_ID} className="sec-title-sm">
        {t("settings.account.archive")}
      </h3>
      <p className="prose">{t("settings.account.archiveText")}</p>
      <KeepChecks options={options} onChange={setOptions} />
      <Button id={OPENER_ID} onClick={confirmation.ask}>
        {t("settings.account.archive")}
      </Button>
      {confirmation.open ? (
        <ArchiveDialog options={options} onDone={confirmation.done} onClose={confirmation.cancel} />
      ) : null}
    </section>
  );
}
