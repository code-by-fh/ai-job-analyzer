// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { ChannelBody, ChannelTypeBody } from "../../../src/api/notificationChannels";
import { E2E_SECRETS } from "./profileFixtures";

const SET = "set";
const STAMP = "2026-10-15T08:00:00+00:00";

const label = (de: string, en: string) => ({ de, en });
const API_KEY = {
  name: "api_key",
  label: label("API-Schlüssel", "API key"),
  kind: "token",
  required: true,
  secret: true,
  max_length: 200,
} as const;
const FROM_EMAIL = {
  name: "from_email",
  label: label("Absender-Adresse", "Sender address"),
  kind: "email",
  required: true,
  secret: false,
  max_length: 254,
} as const;
const RECIPIENTS = {
  name: "recipients",
  label: label("Empfänger", "Recipients"),
  kind: "email_list",
  required: true,
  secret: false,
  max_length: 254,
  max_items: 50,
} as const;

/**
 * GET /notifications/channel-types as the service answers it (notification-service
 * app/channel_types.py CHANNEL_TYPES): labels and field schemas are the service's, not the web's.
 */
export const CHANNEL_TYPES: ChannelTypeBody[] = [
  {
    id: "pushover",
    label: label("Pushover", "Pushover"),
    fields: [
      {
        name: "api_token",
        label: label("API-Token", "API token"),
        kind: "token",
        required: true,
        secret: true,
        max_length: 100,
      },
      {
        name: "user_key",
        label: label("User- oder Gruppen-Key", "User or group key"),
        kind: "token",
        required: true,
        secret: true,
        max_length: 100,
      },
    ],
  },
  {
    id: "resend",
    label: label("E-Mail (Resend)", "Email (Resend)"),
    fields: [API_KEY, FROM_EMAIL, RECIPIENTS],
  },
  {
    id: "mailjet",
    label: label("E-Mail (Mailjet)", "Email (Mailjet)"),
    fields: [
      API_KEY,
      { ...API_KEY, name: "secret_key", label: label("Secret Key", "Secret key") },
      FROM_EMAIL,
      RECIPIENTS,
    ],
  },
  {
    id: "smtp",
    label: label("E-Mail (SMTP)", "Email (SMTP)"),
    fields: [
      {
        name: "host",
        label: label("SMTP-Server", "SMTP server"),
        kind: "host",
        required: true,
        secret: false,
        max_length: 253,
      },
      {
        name: "port",
        label: label("Port (STARTTLS)", "Port (STARTTLS)"),
        kind: "port",
        required: false,
        secret: false,
        default: 587,
      },
      {
        name: "username",
        label: label("Benutzername", "Username"),
        kind: "ascii_text",
        required: true,
        secret: false,
        max_length: 254,
      },
      {
        name: "password",
        label: label("Passwort", "Password"),
        kind: "ascii_text",
        required: true,
        secret: true,
        max_length: 256,
      },
      FROM_EMAIL,
      RECIPIENTS,
    ],
  },
];

/** The user's channels (no Mailjet), oldest first, as GET /notifications/channels lists them. */
export const PUSHOVER_CHANNEL: ChannelBody = {
  id: "6f1c2a10-0000-4000-8000-000000000001",
  type: "pushover",
  name: "Mein Handy",
  fields: {},
  secrets: { api_token: SET, user_key: SET },
  created_at: STAMP,
  updated_at: STAMP,
};
export const RESEND_CHANNEL: ChannelBody = {
  id: "6f1c2a10-0000-4000-8000-000000000002",
  type: "resend",
  name: "Bewerbungs-Mail",
  fields: { from_email: "jobs@example.com", recipients: ["me@example.com"] },
  secrets: { api_key: SET },
  created_at: STAMP,
  updated_at: STAMP,
};
export const SMTP_CHANNEL: ChannelBody = {
  id: "6f1c2a10-0000-4000-8000-000000000003",
  type: "smtp",
  name: "Firmen-SMTP",
  fields: {
    host: "smtp.example.com",
    port: 587,
    username: "smtp-user",
    from_email: "jobs@example.com",
    recipients: ["me@example.com"],
  },
  secrets: { password: SET },
  created_at: STAMP,
  updated_at: STAMP,
};
export const CHANNELS: ChannelBody[] = [PUSHOVER_CHANNEL, RESEND_CHANNEL, SMTP_CHANNEL];

/**
 * What the fake service stores for each fixture secret: the Profil fixture secrets, so a spec that
 * checks the page and every request for them also covers the channels (R4).
 */
export const CHANNEL_SECRETS: Readonly<Record<string, Record<string, string>>> = {
  [PUSHOVER_CHANNEL.id]: {
    api_token: E2E_SECRETS.pushover_api_token,
    user_key: "PUSH_USER_E2E_4711",
  },
  [RESEND_CHANNEL.id]: { api_key: E2E_SECRETS.resend_api_key },
  [SMTP_CHANNEL.id]: { password: E2E_SECRETS.smtp_password },
};
