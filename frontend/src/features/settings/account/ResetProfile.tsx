"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetProfile } from "@/api/account";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useConfirmation } from "../useConfirmation";

const HEADING_ID = "settings-reset-profile-h";
const OPENER_ID = "settings-reset-profile-open";

/** R10: Profil, the onboarding (profile_complete) and every template preview read Ziel and Lebenslauf. */
function useResetProfile(onDone: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: resetProfile,
    onSuccess: () => {
      toast.show({ tone: "success", message: t("settings.account.profileReset") });
      onDone();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templatePreviewRoot });
    },
  });
}

function ResetProfileDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const reset = useResetProfile(onDone);
  return (
    <ConfirmDialog
      title={t("settings.account.resetProfile")}
      confirmLabel={t("settings.account.resetProfile")}
      busy={reset.isPending}
      onConfirm={() => reset.mutate()}
      onClose={onClose}
    >
      <p className="prose">{t("settings.account.resetProfileText")}</p>
    </ConfirmDialog>
  );
}

/** R8: empties Ziel and Lebenslauf after a question; channels, templates and proofs stay. */
export function ResetProfile() {
  const { t } = useI18n();
  const confirmation = useConfirmation(OPENER_ID);
  return (
    <section className="settings-block account-block" aria-labelledby={HEADING_ID}>
      <h3 id={HEADING_ID} className="sec-title-sm">
        {t("settings.account.resetProfile")}
      </h3>
      <p className="prose">{t("settings.account.resetProfileText")}</p>
      <Button id={OPENER_ID} onClick={confirmation.ask}>
        {t("settings.account.resetProfile")}
      </Button>
      {confirmation.open ? (
        <ResetProfileDialog onDone={confirmation.done} onClose={confirmation.cancel} />
      ) : null}
    </section>
  );
}
