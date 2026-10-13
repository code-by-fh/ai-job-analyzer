"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { REFUSAL } from "@/api/profilePaths";
import { givenUp } from "@/api/queryState";
import { templatePreviewQueryOptions } from "@/api/templates";
import { DOC_TYPE_OF, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { HTTP_NOT_FOUND, HTTP_UNPROCESSABLE, refusalText, type RefusalTable } from "../refusals";
import { cardName } from "./labels";
import { previewDocument } from "./previewHtml";

// Task 4's fixed answers by status and body (ruling R8); 429 and the rest get describeError.
const PREVIEW_REFUSALS: RefusalTable = {
  field: "template",
  refusals: [
    {
      status: HTTP_UNPROCESSABLE,
      code: REFUSAL.templateRejected,
      text: "profile.templates.previewRejected",
    },
    {
      status: HTTP_NOT_FOUND,
      code: REFUSAL.templateNotFound,
      text: "profile.templates.previewGone",
    },
  ],
};

export interface TemplatePreviewProps {
  kind: TemplateKind;
  card: TemplateCard;
  onClose: () => void;
}

/** D11: the template on the A4 sheet, filled with the user's own profile; no full-screen view (C-10). */
export function TemplatePreview({ kind, card, onClose }: TemplatePreviewProps) {
  const { t } = useI18n();
  const title = t("profile.templates.previewOf", { name: cardName(card, t) });
  return (
    <Dialog open onClose={onClose} label={title}>
      <div className="panel-in profile-dialog">
        <PanelHeader title={title} onClose={onClose} />
        <PreviewBody kind={kind} card={card} title={title} />
      </div>
    </Dialog>
  );
}

/**
 * A request being retried counts as failed (Phase 4 RB13): the error shows from the first failure,
 * never the busy sheet through the backoff. `failureReason` is that failure's error already while
 * retried (`error` stays null until the retries end) and equals `error` afterwards.
 */
function PreviewBody({
  kind,
  card,
  title,
}: Omit<TemplatePreviewProps, "onClose"> & { title: string }) {
  const { t } = useI18n();
  const preview = useQuery(templatePreviewQueryOptions(DOC_TYPE_OF[kind], card.ref));
  if (givenUp(preview))
    return <Notice tone="error">{refusalText(preview.failureReason, t, PREVIEW_REFUSALS)}</Notice>;
  return (
    <A4Preview
      title={title}
      pdfUrl={null}
      slug={t("profile.templates.previewSlug")}
      busy={preview.isPending}
    >
      {preview.data ? <PreviewFrame html={preview.data} title={title} /> : null}
    </A4Preview>
  );
}

/**
 * Ruling R7: preview HTML is untrusted (stored rows can carry script and remote images). It is
 * shown only through srcdoc in a frame with an empty sandbox (no scripts, no same-origin access),
 * stripped of active content and link targets (R18 a) and behind the editor CSP; never as markup in
 * this page, never as a frame src. The sheet styles the frame (`.paper iframe`); the notification
 * template preview reuses it inside its own box (preflight ruling 30).
 */
export function PreviewFrame({ html, title }: { html: string; title: string }) {
  const srcDoc = useMemo(() => previewDocument(html), [html]);
  return <iframe title={title} sandbox="" srcDoc={srcDoc} />;
}
