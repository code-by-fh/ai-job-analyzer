"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  updateNotificationTemplate,
  type NotificationTemplate,
} from "@/api/notifications";
import { queryKeys } from "@/api/queryKeys";
import { useReportDirty } from "@/features/profile/useReportDirty";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import {
  scopeOf,
  templateDraftOf,
  templateProblems,
  typeOfKind,
  type TemplateDraft,
  type TemplateField,
  type TemplateProblems,
} from "./templateDraft";

/** Ruling 46: the template writes run one after the other. */
export const TEMPLATE_MUTATION_SCOPE = { id: "notification-templates" };
/** The page's dirty id: one template draft at a time. */
export const TEMPLATES_DIRTY_ID = "templates";

const TEMPLATE_FIELDS: ReadonlySet<string> = new Set<TemplateField>(["name", "content"]);
const toTemplateField = (field: string): TemplateField | null =>
  TEMPLATE_FIELDS.has(field) ? (field as TemplateField) : null;

/** Ruling 44: the shape was checked before sending, so a 422 on a field is its length bound. */
function refusedFields(error: unknown): TemplateProblems {
  const fields = fieldErrorsFrom(error, toTemplateField);
  return Object.fromEntries(fields.map((field) => [field, "tooLong"]));
}

/**
 * Toasts the outcome (a field refusal shows on its field instead) and refreshes the list, which the
 * source drawer's template select reads too.
 */
function useTemplateMutation<V>(mutationFn: (input: V) => Promise<unknown>, success: MessageKey) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: TEMPLATE_MUTATION_SCOPE,
    mutationFn,
    onSuccess: () => toast.show({ tone: "success", message: t(success) }),
    onError: (error) => {
      if (fieldErrorsFrom(error, toTemplateField).length === 0)
        toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationTemplates }),
  });
}

interface SaveInput {
  /** null: a new template. */
  template: NotificationTemplate | null;
  draft: TemplateDraft;
}

/** A new template takes its type and scope from the draft; a stored one keeps both. */
function saveTemplate({ template, draft }: SaveInput): Promise<NotificationTemplate> {
  const name = draft.name.trim();
  if (!template) {
    const scope = draft.global ? "global" : "own";
    const type = typeOfKind(draft.kind);
    return createNotificationTemplate({ scope, template: { name, type, content: draft.content } });
  }
  const scope = scopeOf(template);
  return updateNotificationTemplate({
    id: template.id,
    scope,
    template: { name, content: draft.content },
  });
}

const deleteTemplate = (template: NotificationTemplate) =>
  deleteNotificationTemplate({ id: template.id, scope: scopeOf(template) });

export const useDeleteTemplate = () =>
  useTemplateMutation(deleteTemplate, "settings.templates.deleted");

export interface TemplateEditorDeps {
  template: NotificationTemplate | null;
  report: ReportDirty;
  /** After a successful save; the library moves focus and closes the editor. */
  onSaved: () => void;
}

/** The open editor's draft, its checks before sending and its save (D8). */
export function useTemplateEditor({ template, report, onSaved }: TemplateEditorDeps) {
  const form = useSectionForm(templateDraftOf(template));
  const [problems, setProblems] = useState<TemplateProblems>({});
  const save = useTemplateMutation(saveTemplate, "settings.templates.saved");
  useReportDirty(report, TEMPLATES_DIRTY_ID, form.dirty);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.dirty) return;
    const found = templateProblems(form.draft);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { template, draft: form.draft },
      { onSuccess: onSaved, onError: (error) => setProblems(refusedFields(error)) },
    );
  };
  return { form, problems, submit, busy: save.isPending };
}

export type TemplateEditorState = ReturnType<typeof useTemplateEditor>;
