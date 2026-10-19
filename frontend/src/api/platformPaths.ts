/**
 * Paths and wire constants of the platforms API without the API client, so e2e fixtures can
 * import them (the client needs the app's env at load).
 */
export const PLATFORMS_PATH = "/platforms";
export const PLATFORM_SETUP_PATH = "/platforms/setup";
export const PREVIEW_LINKS_PATH = "/platforms/preview-links";
export const URL_PATTERN_PATH = "/platforms/url-pattern";
export const NOTIFICATION_TEMPLATES_PATH = "/notification-templates";
export const CANCEL_CRAWL_PATH = "/scraper/cancel-crawl";
/** Runs shown in the drawer (D8); the server keeps 20. */
export const RUN_HISTORY_SIZE = 10;

export const NOTIFY_CHANNELS = ["PUSHOVER", "RESEND", "MAILJET", "SMTP"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** B8: what the setup does right after creating the source. */
export const INITIAL_RUNS = ["seed", "analyze", "none"] as const;
export type InitialRun = (typeof INITIAL_RUNS)[number];

export const CHANNEL_TEMPLATE_FIELD = {
  PUSHOVER: "pushover_template",
  RESEND: "resend_template",
  MAILJET: "mailjet_template",
  SMTP: "smtp_template",
} as const;

/** Pushover goes to the user's own device; the email channels need recipients per source. */
export const CHANNEL_RECIPIENTS_FIELD = {
  PUSHOVER: null,
  RESEND: "resend_recipients",
  MAILJET: "mailjet_recipients",
  SMTP: "smtp_recipients",
} as const;

const EMAIL_TEMPLATE_TYPES = ["RESEND", "MAILJET", "SMTP"] as const;
/** SMTP templates cannot be created on the server (G11), so every email channel offers all email types. */
export const CHANNEL_TEMPLATE_TYPES: Readonly<Record<NotifyChannel, readonly string[]>> = {
  PUSHOVER: ["PUSHOVER"],
  RESEND: EMAIL_TEMPLATE_TYPES,
  MAILJET: EMAIL_TEMPLATE_TYPES,
  SMTP: EMAIL_TEMPLATE_TYPES,
};

export function platformPath(id: number, suffix = ""): string {
  return `${PLATFORMS_PATH}/${id}${suffix}`;
}

export function platformRunsPath(id: number): string {
  return platformPath(id, `/runs?limit=${RUN_HISTORY_SIZE}`);
}

export function platformCrawlPath(id: number): string {
  return platformPath(id, "/crawl");
}

export function platformNamePath(id: number): string {
  return platformPath(id, "/generate-name");
}
