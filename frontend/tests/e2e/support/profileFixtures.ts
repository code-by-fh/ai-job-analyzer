// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { ProfileBody } from "../../../src/api/profile";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import type { DocumentTemplateBody, FileTemplatesBody } from "../../../src/api/templates";

// Stored next to the profile like on the real server; GET /settings masks them (Review Focus 1).
export const E2E_SECRETS = {
  pushover_api_token: "PUSH_TOKEN_E2E_4711",
  resend_api_key: "RESEND_KEY_E2E_4711",
  mailjet_api_key: "MAILJET_KEY_E2E_4711",
  mailjet_secret_key: "MAILJET_SECRET_E2E_4711",
  smtp_password: "SMTP_PW_E2E_4711",
} as const;
export const E2E_NOTIFICATION_FIELDS = {
  pushover_user_key: "push-user",
  resend_from_email: "jobs@example.com",
  mailjet_from_email: "mailjet@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "smtp-user",
  smtp_from_email: "smtp@example.com",
  email_global_recipient: "me@example.com",
  active_notification_service: "PUSHOVER",
} as const;
// Columns of the same row that no Profil section owns (core.py UserProfile); a save keeps them.
export const E2E_OTHER_COLUMNS = {
  match_threshold: 70,
  job_urls: ["https://www.stepstone.de/jobs/kotlin"],
} as const;

export const STORED_PROFILE: ProfileBody = {
  role: "Senior Backend-Entwickler (Java/Kotlin)",
  skills: "Java 21, Kotlin, Spring Boot, PostgreSQL",
  min_salary: "78000",
  location: "Hamburg oder remote",
  preferences: "Hybrid, höchstens zwei Bürotage pro Woche.",
  spoken_languages: ["Deutsch (Muttersprache)", "Englisch (fließend)"],
  cv_data: {
    experience: [
      {
        company: "Hanseatic Commerce GmbH",
        role: "Senior Backend Engineer",
        duration: "03/2021 – heute",
        description: "Checkout- und Zahlungsdienste für 2 Mio. Kund:innen.",
      },
    ],
    projects: [
      {
        name: "kotlin-outbox",
        tech_stack: "Kotlin, Spring",
        description: "Transaktionale Outbox.",
      },
    ],
    education: "B.Sc. Informatik, Universität Hamburg, 2015",
  },
  cv_template: "classic",
  cover_letter_template: null,
};

export const PROFILE_DOCUMENTS: ProfileDocumentBody[] = [
  {
    id: 1,
    doc_type: "REFERENCE",
    label: "Arbeitszeugnis Nordlicht Software AG.pdf",
    original_filename: "Arbeitszeugnis Nordlicht Software AG.pdf",
    file_size: 421_888,
    mime_type: "application/pdf",
    created_at: "2026-08-12T09:00:00+00:00",
    downloadable: true,
  },
  {
    id: 2,
    doc_type: "CERTIFICATE",
    label: "AWS Developer.png",
    original_filename: "AWS Developer.png",
    file_size: 1_258_291,
    mime_type: "image/png",
    created_at: "2026-09-01T09:00:00+00:00",
    downloadable: false,
  },
];

export const DOCUMENT_TEMPLATES: DocumentTemplateBody[] = [
  {
    id: 7,
    doc_type: "CV",
    name: "Zweispaltig",
    is_admin: true,
    user_id: null,
    status: null,
    created_at: "2026-08-01T09:00:00+00:00",
    updated_at: "2026-08-01T09:00:00+00:00",
  },
  {
    id: 8,
    doc_type: "CV",
    name: "lebenslauf_2025",
    is_admin: false,
    user_id: 1,
    status: "annotation_rejected",
    created_at: "2026-08-12T09:00:00+00:00",
    updated_at: "2026-08-12T09:01:00+00:00",
  },
];

export const FILE_TEMPLATES: FileTemplatesBody = { cv: ["classic"], cover_letter: ["classic"] };
