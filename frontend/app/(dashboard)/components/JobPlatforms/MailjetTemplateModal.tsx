"use client";
import EmailTemplateModal, { EmailTemplateModalProps } from './EmailTemplateModal';

type MailjetTemplateModalProps = Omit<EmailTemplateModalProps, 'adapterName' | 'templateType'>;

export default function MailjetTemplateModal(props: MailjetTemplateModalProps) {
    return <EmailTemplateModal {...props} adapterName="Mailjet" templateType="MAILJET" />;
}
