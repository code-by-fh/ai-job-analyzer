"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { profileDocumentsQueryOptions, type ProfileDocument } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { CheckField } from "@/ui/Field";

const PROFILE_DOCUMENTS_HREF = "/profile?section=documents";
// Mirror of server routers/profile_documents.py VALID_TYPES: the package copies only these.
const ATTACHABLE_TYPES: ReadonlySet<string> = new Set(["CERTIFICATE", "REFERENCE"]);

interface AttachProps {
  attach: boolean;
  onChange: (value: boolean) => void;
}

function NoDocuments() {
  const { t } = useI18n();
  return (
    <p className="meta">
      {t("docs.attachNone")}{" "}
      <Link className="link" href={PROFILE_DOCUMENTS_HREF}>
        {t("docs.attachManage")}
      </Link>
    </p>
  );
}

function documentNames(documents: readonly ProfileDocument[]): string {
  return documents.map((document) => document.label || document.original_filename).join(", ");
}

function SkippedHint({ documents }: { documents: readonly ProfileDocument[] }) {
  const { t } = useI18n();
  if (documents.length === 0) return null;
  return <p className="meta">{t("docs.attachSkipped", { names: documentNames(documents) })}</p>;
}

/** Certificates and references the package copies into the job; other kinds are only named. */
export function AttachProfileDocuments({ attach, onChange }: AttachProps) {
  const { t } = useI18n();
  const documents = useQuery(profileDocumentsQueryOptions()).data;
  if (!documents) return null;
  const attachable = documents.filter((document) => ATTACHABLE_TYPES.has(document.doc_type));
  const skipped = documents.filter((document) => !ATTACHABLE_TYPES.has(document.doc_type));
  if (attachable.length === 0) return <NoDocuments />;
  return (
    <div className="attach">
      <CheckField
        id="attach-profile-documents"
        label={t("docs.attach", { count: attachable.length })}
        checked={attach}
        onChange={onChange}
      />
      <p className="meta">{documentNames(attachable)}</p>
      <SkippedHint documents={skipped} />
    </div>
  );
}
