"use client";

import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { useState } from "react";
import { profileDocumentsQueryOptions, type ProfileDocument } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { DeleteProofDialog } from "./DeleteProofDialog";
import { ProofList } from "./ProofList";
import { ProofUpload } from "./ProofUpload";
import { ProofViewer } from "./ProofViewer";

export function ProofsSection() {
  const query = useQuery(profileDocumentsQueryOptions());
  return (
    <ProfileSectionFrame section="nachweise">
      <ProofUpload />
      <SectionState query={query}>
        {(documents) => <ProofBody documents={documents} />}
      </SectionState>
    </ProfileSectionFrame>
  );
}

/** The dialogs stay mounted when the last row goes, so a delete can finish and close its dialog. */
function ProofBody({ documents }: { documents: readonly ProfileDocument[] }) {
  const [viewing, setViewing] = useState<ProfileDocument | null>(null);
  const [deleting, setDeleting] = useState<ProfileDocument | null>(null);
  return (
    <>
      {documents.length === 0 ? (
        <ProofsEmpty />
      ) : (
        <ProofList documents={documents} onView={setViewing} onDelete={setDeleting} />
      )}
      {viewing ? <ProofViewer proof={viewing} onClose={() => setViewing(null)} /> : null}
      {deleting ? <DeleteProofDialog proof={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

function ProofsEmpty() {
  const { t } = useI18n();
  return (
    <EmptyState icon={Award} title={t("profile.proofs.emptyTitle")}>
      {t("profile.proofs.emptyText")}
    </EmptyState>
  );
}
