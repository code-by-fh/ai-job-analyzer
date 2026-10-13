"use client";

import { Download, Eye, Trash2, type LucideIcon } from "lucide-react";
import type { ProfileDocument } from "@/api/profileDocuments";
import { formatFileSize, viewKind } from "@/features/job/documents/uploadRules";
import { formatDate } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { proofTypeLabel } from "./labels";
import { useDownloadProof } from "./useProofs";

interface ProofActionsProps {
  onView: (proof: ProfileDocument) => void;
  onDelete: (proof: ProfileDocument) => void;
}

export interface ProofListProps extends ProofActionsProps {
  documents: readonly ProfileDocument[];
}

interface ProofRowProps extends ProofActionsProps {
  proof: ProfileDocument;
}

export function ProofList({ documents, onView, onDelete }: ProofListProps) {
  return (
    <ul role="list" className="file-list proof-list">
      {documents.map((proof) => (
        <ProofRow key={proof.id} proof={proof} onView={onView} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function useProofMeta(proof: ProfileDocument): string {
  const { t, language } = useI18n();
  return [
    t(proofTypeLabel(proof.doc_type)),
    proof.file_size ? formatFileSize(proof.file_size, language) : null,
    proof.created_at ? formatDate(proof.created_at, language) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const proofName = (proof: ProfileDocument) => proof.label || proof.original_filename;

function ProofRow(props: ProofRowProps) {
  const meta = useProofMeta(props.proof);
  return (
    <li className="file-row">
      <div>
        <div className="file-name">{proofName(props.proof)}</div>
        <div className="meta">{meta}</div>
        <BlockedNote proof={props.proof} />
      </div>
      <div className="row proof-actions">
        <ProofActions {...props} />
      </div>
    </li>
  );
}

/** Visible on touch screens too, where the inactive buttons' title never shows; text, not an alarm. */
function BlockedNote({ proof }: { proof: ProfileDocument }) {
  const { t } = useI18n();
  if (proof.downloadable) return null;
  return <div className="meta proof-blocked">{t("profile.proofs.notOpenable")}</div>;
}

/** A Drive file or one without stored bytes (the server does not say which) keeps its buttons, inactive with the reason (D8). */
function ProofActions({ proof, onView, onDelete }: ProofRowProps) {
  const { t } = useI18n();
  const name = proofName(proof);
  const blocked = proof.downloadable ? undefined : t("profile.proofs.notOpenable");
  return (
    <>
      <ViewButton proof={proof} name={name} blocked={blocked} onView={onView} />
      <DownloadButton proof={proof} name={name} blocked={blocked} />
      <RowButton
        icon={Trash2}
        label={t("files.delete", { name })}
        onClick={() => onDelete(proof)}
      />
    </>
  );
}

interface FileButtonProps {
  proof: ProfileDocument;
  name: string;
  blocked?: string;
}

/** Word files have no viewer (download only), so they get no Ansehen. */
function ViewButton({ onView, ...props }: FileButtonProps & Pick<ProofActionsProps, "onView">) {
  const { t } = useI18n();
  if (!viewKind(props.proof.mime_type)) return null;
  return (
    <RowButton
      icon={Eye}
      label={t("files.view", { name: props.name })}
      blocked={props.blocked}
      onClick={() => onView(props.proof)}
    />
  );
}

function DownloadButton(props: FileButtonProps) {
  const { t } = useI18n();
  const download = useDownloadProof(props.proof);
  return (
    <RowButton
      icon={Download}
      label={t("files.download", { name: props.name })}
      blocked={props.blocked}
      busy={download.isPending}
      onClick={() => download.mutate()}
    />
  );
}

interface RowButtonProps {
  icon: LucideIcon;
  label: string;
  /** Why the action is unavailable; shown as the title. */
  blocked?: string;
  busy?: boolean;
  onClick: () => void;
}

function RowButton({ icon, label, blocked, busy, onClick }: RowButtonProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={icon}
      aria-label={label}
      title={blocked}
      inactive={Boolean(blocked)}
      busy={busy}
      onClick={onClick}
    />
  );
}
