import type { ProofDocType } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";

export const PROOF_TYPE_LABEL: Readonly<Record<ProofDocType, MessageKey>> = {
  CERTIFICATE: "profile.proofs.type.CERTIFICATE",
  REFERENCE: "profile.proofs.type.REFERENCE",
};

/** A stored type the web does not know reads as a neutral "Nachweis", never as the raw enum. */
export function proofTypeLabel(docType: string): MessageKey {
  return Object.hasOwn(PROOF_TYPE_LABEL, docType)
    ? PROOF_TYPE_LABEL[docType as ProofDocType]
    : "profile.proofs.type.other";
}
