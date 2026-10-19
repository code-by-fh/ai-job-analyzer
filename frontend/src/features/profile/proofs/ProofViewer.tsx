"use client";

import type { ProfileDocument } from "@/api/profileDocuments";
import { FileViewerDialog } from "@/features/job/documents/FileViewer";
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
    <FileViewerDialog
      name={proof.original_filename}
      mimeType={proof.mime_type}
      file={file}
      onClose={onClose}
    />
  );
}
