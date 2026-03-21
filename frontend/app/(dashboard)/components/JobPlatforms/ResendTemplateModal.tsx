"use client";
import EmailTemplateModal, { EmailTemplateModalProps } from './EmailTemplateModal';

type ResendTemplateModalProps = Omit<EmailTemplateModalProps, 'adapterName' | 'templateType'>;

export default function ResendTemplateModal(props: ResendTemplateModalProps) {
    return <EmailTemplateModal {...props} adapterName="Resend" templateType="RESEND" />;
}
