"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cleanupCrawls } from "@/api/admin";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";

const HEADING_ID = "settings-maintenance-h";

/** Preflight ruling 24: none, one, or the count. */
function cleanedText(count: number, t: Translate): string {
  if (count === 0) return t("settings.system.cleanedNone");
  if (count === 1) return t("settings.system.cleanedOne");
  return t("settings.system.cleaned", { count });
}

/** The removed runs leave the activity panel, which reads the crawl registry. */
function useCleanup() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: cleanupCrawls,
    onSuccess: (count) => toast.show({ tone: "success", message: cleanedText(count, t) }),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });
}

/** Wartung: removes crawl runs that stopped reporting progress (core/crawl_registry.py). */
export function MaintenanceBlock() {
  const { t } = useI18n();
  const cleanup = useCleanup();
  return (
    <section className="settings-block account-block" aria-labelledby={HEADING_ID}>
      <h3 id={HEADING_ID} className="sec-title-sm">
        {t("settings.system.maintenance")}
      </h3>
      <p className="prose">{t("settings.system.cleanupHint")}</p>
      <Button busy={cleanup.isPending} onClick={() => cleanup.mutate()}>
        {t("settings.system.cleanup")}
      </Button>
    </section>
  );
}
