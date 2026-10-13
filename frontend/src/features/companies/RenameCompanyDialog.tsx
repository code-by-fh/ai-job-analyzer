"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { renameCompany } from "@/api/admin";
import { ADMIN_LIMITS } from "@/api/adminPaths";
import { companyQueryOptions } from "@/api/companies";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { queryKeys } from "@/api/queryKeys";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { TextField } from "@/ui/Field";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { dropCachedSearches, isProfileGone, useProfileGone } from "./afterProfileAction";

const NAME_FIELD_ID = "company-rename-name";
// A 422 means the name passed the client check, so only the server's bound can have refused it.
const SERVER_REFUSED: MessageKey = "settings.problem.tooLong";

/** routers/admin.py CompanyRename: 1-200 code points after the trim (Python's len()). */
function nameProblem(name: string): MessageKey | null {
  const length = Array.from(name.trim()).length;
  if (length === 0) return "settings.problem.required";
  return length > ADMIN_LIMITS.companyName ? "settings.problem.tooLong" : null;
}

const toNameField = (field: string): "name" | null => (field === "name" ? field : null);

interface RenameCompanyDialogProps {
  domain: string;
  /** The name the detail shows; the field starts with it. */
  name: string;
  onClose: () => void;
}

/**
 * The answer's name goes into the profile, so the h1 and the job's Firma tab show it at once; the
 * directory refetches.
 */
function storeRename(queryClient: QueryClient, answer: { domain: string; name: string }): void {
  queryClient.setQueryData(companyQueryOptions(answer.domain).queryKey, (profile) =>
    profile ? { ...profile, name: answer.name } : profile,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.companiesRoot });
  dropCachedSearches(queryClient);
}

/** The dialog's own focus return goes back to "Umbenennen", which stays with the profile. */
function useRename({ domain, onClose }: RenameCompanyDialogProps, onRefused: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const gone = useProfileGone(domain, onClose);
  return useMutation({
    mutationFn: renameCompany,
    onSuccess: (answer) => {
      storeRename(queryClient, { domain, name: answer.name });
      toast.show({ tone: "success", message: t("companies.admin.renamed") });
      onClose();
    },
    onError: (error) => {
      if (fieldErrorsFrom(error, toNameField).length > 0) return onRefused();
      if (isProfileGone(error)) gone();
      toast.show({ tone: "error", message: describeError(error, t) });
    },
  });
}

/** Spec 5: "Speichern" stays inactive (still focusable) until the name differs from the stored one. */
function useRenameForm(props: RenameCompanyDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(props.name);
  const [error, setError] = useState<string | undefined>();
  const rename = useRename(props, () => setError(t(SERVER_REFUSED)));
  const dirty = draft.trim() !== props.name;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || rename.isPending) return;
    const problem = nameProblem(draft);
    setError(problem ? t(problem) : undefined);
    if (!problem) rename.mutate({ domain: props.domain, name: draft.trim() });
  };
  return { draft, setDraft, error, submit, dirty, busy: rename.isPending };
}

type RenameForm = ReturnType<typeof useRenameForm>;

/** The hint gives way to an error on the field; both are fixed texts, never the server's. */
function NameField({ form }: { form: RenameForm }) {
  const { t } = useI18n();
  return (
    <TextField
      id={NAME_FIELD_ID}
      data-autofocus
      autoComplete="off"
      label={t("companies.admin.renameLabel")}
      hint={form.error ? undefined : t("companies.admin.renameHint")}
      value={form.draft}
      onChange={(event) => form.setDraft(event.target.value)}
      error={form.error}
    />
  );
}

function RenameActions({ form, onClose }: { form: RenameForm; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="row panel-actions">
      <Button type="submit" variant="primary" busy={form.busy} inactive={!form.dirty}>
        {t("dates.save")}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

/**
 * D9, 7b ruling 28: renames the shared profile for every user. The panel carries settings-dialog
 * for the 13 px hint and 44 px buttons, as the dialog portals outside the page.
 */
export function RenameCompanyDialog(props: RenameCompanyDialogProps) {
  const { t } = useI18n();
  const form = useRenameForm(props);
  const title = t("companies.admin.renameTitle");
  return (
    <Dialog open onClose={props.onClose} label={title}>
      <form className="panel-in settings-dialog" onSubmit={form.submit} noValidate>
        <PanelHeader title={title} onClose={props.onClose} />
        <NameField form={form} />
        <RenameActions form={form} onClose={props.onClose} />
      </form>
    </Dialog>
  );
}
