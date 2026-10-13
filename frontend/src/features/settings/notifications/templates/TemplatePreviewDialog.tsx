"use client";

import { useQuery } from "@tanstack/react-query";
import { notificationPreviewQueryOptions, type TemplatePreview } from "@/api/notifications";
import { givenUp } from "@/api/queryState";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { PreviewFrame } from "@/features/profile/templates/TemplatePreview";
import { useI18n } from "@/i18n/useI18n";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { typeOfKind, type TemplateDraft } from "./templateDraft";

export interface TemplatePreviewDialogProps {
  draft: TemplateDraft;
  onClose: () => void;
}

/**
 * R4: an email answer is user-authored HTML, so it is shown only in Phase 6's sandboxed frame
 * (srcdoc after previewDocument: no script, no link targets, editor CSP); a push answer is text.
 */
function PreviewBody({ preview }: { preview: TemplatePreview }) {
  const { t } = useI18n();
  if (!preview.html) return <pre className="template-preview-text">{preview.body}</pre>;
  return (
    <div className="template-preview">
      <PreviewFrame html={preview.body} title={t("preview.title")} />
    </div>
  );
}

/**
 * Ruling 43: an existing MAILJET or SMTP template previews as RESEND (the same renderer). Every
 * refusal, 429 included, is describeError's fixed sentence with a retry (R10).
 */
function PreviewState({ draft }: { draft: TemplateDraft }) {
  const input = { type: typeOfKind(draft.kind), content: draft.content };
  const query = useQuery(notificationPreviewQueryOptions(input));
  if (query.data) return <PreviewBody preview={query.data} />;
  if (givenUp(query))
    return <ListError error={query.failureReason} onRetry={() => void query.refetch()} />;
  return <ListLoading stalled={false} />;
}

/** C.2: the draft rendered by the server with a sample job; nothing is sent. */
export function TemplatePreviewDialog({ draft, onClose }: TemplatePreviewDialogProps) {
  const { t } = useI18n();
  const title = t("preview.title");
  return (
    <Dialog open onClose={onClose} label={title}>
      <div className="panel-in settings-dialog">
        <PanelHeader title={title} onClose={onClose} />
        <p className="hint template-preview-hint">{t("settings.templates.previewHint")}</p>
        <PreviewState draft={draft} />
      </div>
    </Dialog>
  );
}
