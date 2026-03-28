"use client";
import EmailTemplateModal, {
  EmailTemplateModalProps,
} from "./EmailTemplateModal";

type SmtpTemplateModalProps = Omit<
  EmailTemplateModalProps,
  "adapterName" | "templateType"
>;

export default function SmtpTemplateModal(props: SmtpTemplateModalProps) {
  return (
    <EmailTemplateModal {...props} adapterName="SMTP" templateType="SMTP" />
  );
}
