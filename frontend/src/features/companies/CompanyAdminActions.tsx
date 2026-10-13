"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteCompanyProfile } from "@/api/admin";
import { companyQueryOptions } from "@/api/companies";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import {
  dropCachedSearches,
  isProfileGone,
  leaveForHeading,
  useProfileGone,
} from "./afterProfileAction";
import { RenameCompanyDialog } from "./RenameCompanyDialog";

interface CompanyAdminActionsProps {
  domain: string;
  /** The name the detail shows; the rename starts with it. */
  name: string;
}

type AdminDialog = "rename" | "delete" | null;

/** The detail shows the research start at once; the directory and any search load anew. */
function storeDeleted(queryClient: QueryClient, domain: string): void {
  queryClient.setQueryData(companyQueryOptions(domain).queryKey, null);
  void queryClient.invalidateQueries({ queryKey: queryKeys.companiesRoot });
  dropCachedSearches(queryClient);
}

/**
 * No profile is left, so the detail shows the research start; its buttons go with the profile and
 * focus moves to the h1 (ruling 28). Other errors keep the profile: the dialog's focus return holds.
 */
function useDeleteProfile(domain: string, onClose: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const gone = useProfileGone(domain, onClose);
  return useMutation({
    mutationFn: () => deleteCompanyProfile(domain),
    onSuccess: () => {
      leaveForHeading(onClose);
      storeDeleted(queryClient, domain);
      toast.show({ tone: "success", message: t("companies.admin.deleted") });
    },
    onError: (error) => {
      if (isProfileGone(error)) gone();
      else onClose();
      toast.show({ tone: "error", message: describeError(error, t) });
    },
  });
}

/** D9: danger, and the text says the profile goes for every user while the jobs stay. */
function DeleteProfileDialog({ domain, onClose }: { domain: string; onClose: () => void }) {
  const { t } = useI18n();
  const remove = useDeleteProfile(domain, onClose);
  return (
    <ConfirmDialog
      title={t("companies.admin.deleteTitle")}
      confirmLabel={t("companies.admin.delete")}
      tone="danger"
      busy={remove.isPending}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <p className="prose">{t("companies.admin.deleteText")}</p>
    </ConfirmDialog>
  );
}

function AdminButtons({ onOpen }: { onOpen: (dialog: AdminDialog) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onOpen("rename")}>
        {t("companies.admin.rename")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="btn-danger"
        icon={Trash2}
        onClick={() => onOpen("delete")}
      >
        {t("companies.admin.delete")}
      </Button>
    </>
  );
}

/**
 * D9: an admin renames or deletes the shared profile. It sits in the profile's stamp row, so it
 * only exists while there is a profile (a second observer here would refetch it). Members get
 * nothing; the server refuses them anyway (403).
 */
export function CompanyAdminActions({ domain, name }: CompanyAdminActionsProps) {
  const isAdmin = useCurrentUser().data?.is_admin === true;
  const [open, setOpen] = useState<AdminDialog>(null);
  if (!isAdmin) return null;
  const close = () => setOpen(null);
  return (
    <>
      <AdminButtons onOpen={setOpen} />
      {open === "rename" ? (
        <RenameCompanyDialog domain={domain} name={name} onClose={close} />
      ) : null}
      {open === "delete" ? <DeleteProfileDialog domain={domain} onClose={close} /> : null}
    </>
  );
}
