"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { clearAiError, systemStatusQueryOptions } from "@/api/admin";
import type { AiErrorCode } from "@/api/adminPaths";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { SectionState } from "@/features/profile/SectionState";
import { AI_SETTINGS_HREF } from "@/features/shell/navigation";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { focusNextFrame, isFocusLost } from "@/ui/focus";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { useToast } from "@/ui/ToastProvider";
import { AI_ERROR_TEXT } from "./aiErrorText";

const HEADING_ID = "settings-ai-error-h";
// Any failed status read that answers 5xx (R8a: Redis down is 503 status_unavailable) gets this
// fixed sentence; other failures keep describeError's generic one.
const STATUS_ERROR_TEXT = { SERVER_ERROR: "settings.system.statusUnavailable" } as const;

const heading = () => document.getElementById(HEADING_ID);

/**
 * When the error turns calm, its reset button leaves the page: after our reset, and after a live
 * ai_error_cleared (every successful AI call publishes one). Focus that went with the button moves
 * to the block heading, never to the page.
 */
function useFocusWhenCleared(code: AiErrorCode | null) {
  const previous = useRef(code);
  useEffect(() => {
    const cleared = previous.current !== null && code === null;
    previous.current = code;
    if (cleared) focusNextFrame(() => (isFocusLost() ? heading() : null));
  }, [code]);
}

function useClearAiError() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: clearAiError,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus });
      toast.show({ tone: "success", message: t("settings.system.aiCleared") });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** D6: the stored code as a fixed sentence (never the stored text), the reset and the way to fix it. */
function AiErrorNotice({ code }: { code: AiErrorCode }) {
  const { t } = useI18n();
  const clear = useClearAiError();
  return (
    <Notice tone="error">
      <p className="ai-error-text">{t(AI_ERROR_TEXT[code])}</p>
      <div className="row">
        <Button size="sm" busy={clear.isPending} onClick={() => clear.mutate()}>
          {t("settings.system.aiClear")}
        </Button>
        <Link className="btn btn-ghost btn-sm" href={AI_SETTINGS_HREF}>
          {t("settings.system.toAi")}
        </Link>
      </div>
    </Notice>
  );
}

function AiErrorState({ code }: { code: AiErrorCode | null }) {
  const { t } = useI18n();
  useFocusWhenCleared(code);
  if (code !== null) return <AiErrorNotice code={code} />;
  return (
    <p className="meta t-ok status-line">
      <Icon icon={Check} />
      {t("settings.system.aiNone")}
    </p>
  );
}

/** KI-Fehler; the realtime ai_error events only invalidate the status, their text is never read. */
export function AiErrorBlock() {
  const { t } = useI18n();
  const query = useQuery(systemStatusQueryOptions());
  return (
    <section className="settings-block account-block" aria-labelledby={HEADING_ID}>
      <h3 id={HEADING_ID} className="sec-title-sm" tabIndex={-1}>
        {t("settings.system.aiTitle")}
      </h3>
      <SectionState query={query} errorText={STATUS_ERROR_TEXT}>
        {(status) => <AiErrorState code={status.ai_error} />}
      </SectionState>
    </section>
  );
}
