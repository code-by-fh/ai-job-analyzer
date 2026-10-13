"use client";

import type { ProfileDocument } from "@/api/profileDocuments";
import { FileViewerBody } from "@/features/job/documents/FileViewer";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { useProofFile } from "./useProofs";

interface ProofViewerProps {
  proof: ProfileDocument;
  onClose: () => void;
}

/**
 * D8: the job page's viewer (PDF on the A4 sheet, images inline). The bytes arrive as a blob, so
 * the API's X-Frame-Options DENY never meets a frame (phase 2 D1).
 */
export function ProofViewer({ proof, onClose }: ProofViewerProps) {
  const file = useProofFile(proof);
  return (
    <Dialog open onClose={onClose} label={proof.original_filename}>
      <div className="panel-in profile-dialog">
        <PanelHeader title={proof.original_filename} onClose={onClose} />
        <FileViewerBody name={proof.original_filename} mimeType={proof.mime_type} file={file} />
      </div>
    </Dialog>
  );
}
