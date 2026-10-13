// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { Request } from "@playwright/test";
import {
  CHANNEL_STATUS_PATH,
  NOTIFICATION_TEMPLATES_PATH,
  NOTIFY_CHANNELS,
  type NotifyChannel,
} from "../../../src/api/platformPaths";
import { SECRET_MASK, SETTINGS_PATH } from "../../../src/api/profilePaths";
import {
  CHANGE_PASSWORD_PATH,
  EMAIL_FIELDS,
  FACTORY_RESET_PATH,
  JOBS_PATH,
  NOTIFICATION_LIMITS,
  NOTIFICATION_PREVIEW_PATH,
  NOTIFICATION_SETTINGS_PATH,
  notificationTemplatePath,
  notificationTemplatesWritePath,
  notificationTestPath,
  PASSWORD_LIMITS,
  PLAIN_FIELDS,
  PROFILE_RESET_PATH,
  REQUIRED_FIELDS,
  SECRET_FIELDS,
  STORAGE_DISCONNECT_PATH,
  STORAGE_SERVICES,
  STORAGE_STATUS_PATH,
  STORAGE_TOGGLE_PATH,
  TEMPLATE_SCOPES,
  TIMEZONE_PATH,
  type StorageService,
  type TemplateScope,
} from "../../../src/api/settingsPaths";
import { DEFAULT_TIMEZONE } from "../../../src/domain/settings";
import type { NotificationTemplateBody } from "../../../src/api/notifications";
import type { StorageStatusBody } from "../../../src/api/settings";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { live, reply, type MockRoutes, type MutableRoutes, type Reply } from "./mockApi";
import {
  NOTIFICATION_TEMPLATES,
  PASSWORD,
  SETTINGS_JOBS,
  settingsRow,
  type SettingsJob,
  type SettingsRow,
} from "./settingsFixtures";

// routers/deps.py _SECRET_FIELDS: masked on read; a sent mask keeps the stored value.
const MASKED_KEYS: readonly string[] = [...SECRET_FIELDS, "google_drive_refresh_token"];
// core.py NotificationSettingsData: every other key of a body is ignored.
const NOTIFICATION_KEYS: readonly string[] = [...PLAIN_FIELDS, ...SECRET_FIELDS];
const STRIPPED_KEYS: readonly string[] = [...EMAIL_FIELDS, "smtp_host"];
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
// deps.NOTIFICATION_TEST_RATE: 5/minute per endpoint and user (preflight ruling 35).
const TESTS_PER_MINUTE = 5;
const CHANNEL_NAME: Readonly<Record<NotifyChannel, string>> = {
  PUSHOVER: "Pushover",
  RESEND: "Resend",
  MAILJET: "Mailjet",
  SMTP: "SMTP",
};
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STORAGE_NONE: StorageService = "NONE";
const STORAGE_DRIVE: StorageService = "GOOGLE_DRIVE";
const LANGUAGE_PATH = "/language-preference";
const DEFAULT_LANGUAGE = "de";
const KNOWN_LANGUAGES: readonly unknown[] = ["de", "en"];
// routers/settings.py and admin.py create: SMTP templates are refused with 400 (G9).
const CREATABLE_TEMPLATE_TYPES: readonly string[] = ["PUSHOVER", "RESEND", "MAILJET"];
const EMAIL_TEMPLATE_TYPES: readonly string[] = ["RESEND", "MAILJET", "SMTP"];
// Template ids are known before a spec runs, so their PUT/DELETE routes exist for the fixtures and
// for this many templates a spec creates (mockApi matches exact paths; an unknown id answers 404).
const FIRST_NEW_TEMPLATE_ID = 100;
const NEW_TEMPLATE_SLOTS = 10;
const JOBS_OPEN = "{{#jobs}}";
const JOBS_CLOSE = "{{/jobs}}";
// routers/settings.py _FakeJob, PREVIEW_PLATFORM_NAME and the admin's user name (fixtures.ts).
const SAMPLE_JOB: Readonly<Record<string, string>> = {
  $title: "Senior Software Engineer",
  $company: "Acme Corp",
  $match_score: "87",
  $reasoning: "Strong match based on your Python and FastAPI experience.",
  $url: "https://example.com/job/123",
};
const PREVIEW_USER_NAME = "admin";
const PREVIEW_PLATFORM_NAME = "Test";
const DEFAULT_PUSH_TEXT = `Acme Corp - Score: 87%\n\n${SAMPLE_JOB.$reasoning}...`;
const DEFAULT_EMAIL_HTML = "<p>Hi admin,</p><h2>1 new job match from Test</h2>";
// Preflight ruling 43: script, an event handler and a link, each of which must stay inert.
// Fix round 1 (I1): a link and a SMIL setter inside declarative shadow roots, which DOMParser
// leaves unreachable while the frame attaches them.
const HOSTILE_PREVIEW_BODY =
  '<script>window.top.__pwned=1</script><img src=x onerror="window.top.__pwned=1"><a href="https://evil.example">x</a>' +
  '<div><template shadowrootmode="open"><a href="https://evil.example/shadow" style="display:block;width:300px;height:100px">s</a></template></div>' +
  '<div><template shadowrootmode="open"><svg width="200" height="100"><a><set attributeName="href" to="https://evil.example/smil"/><rect width="200" height="100"/></a></svg></template></div>' +
  "<p>x</p>";

// routers/jobs.py _ARCHIVE_ALL_KEPT_STATUSES: keep_applications keeps every status after OPEN.
const APPLICATION_STATUSES: readonly string[] = [
  "DRAFTED",
  "GENERATING",
  "FAILED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
];
const SEEN_STATUS = "SEEN";
// routers/settings.py _clear_goal_and_cv: Ziel and Lebenslauf become empty, not demo values.
const GOAL_AND_CV: SettingsRow = {
  role: "",
  skills: "",
  min_salary: "",
  location: "",
  preferences: "",
  cv_data: { experience: [], projects: [], education: "" },
  job_urls: [],
  spoken_languages: [],
};

/** routers/settings.py validates with zoneinfo.ZoneInfo; Intl knows the same IANA names and aliases. */
function isKnownZone(zone: unknown): zone is string {
  if (typeof zone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    // A RangeError is how Intl refuses a zone, as ZoneInfo raises for one.
    return false;
  }
}

type FieldRule = (value: unknown) => boolean;

/** Python's len() counts code points, as pydantic's length bounds do. */
const lengthOf = (text: string) => Array.from(text).length;
const textWithin =
  (max: number, strip: boolean): FieldRule =>
  (value) => {
    if (typeof value !== "string") return false;
    const length = lengthOf(strip ? value.trim() : value);
    return length >= 1 && length <= max;
  };
const isEmail: FieldRule = (value) =>
  textWithin(NOTIFICATION_LIMITS.email, true)(value) && EMAIL_SHAPE.test(String(value).trim());
const isPort: FieldRule = (value) => {
  const port = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return (
    Number.isInteger(port) &&
    Number(port) >= NOTIFICATION_LIMITS.portMin &&
    Number(port) <= NOTIFICATION_LIMITS.portMax
  );
};

/** core.py: EmailAddress, HostName and Port by name, every other notification field a Credential. */
function ruleOf(key: string): FieldRule {
  if (EMAIL_FIELDS.some((field) => field === key)) return isEmail;
  if (key === "smtp_host") return textWithin(NOTIFICATION_LIMITS.host, true);
  if (key === "smtp_port") return isPort;
  return textWithin(NOTIFICATION_LIMITS.credential, false);
}

/** Every notification key pydantic refuses (null always clears), in body order. */
function refusedKeys(body: SettingsRow): string[] {
  return Object.keys(body).filter(
    (key) => NOTIFICATION_KEYS.includes(key) && body[key] !== null && !ruleOf(key)(body[key]),
  );
}

/** What pydantic hands the router: stripped addresses and host, the port as a number. */
function storedValue(key: string, value: unknown): unknown {
  if (value === null) return null;
  if (key === "smtp_port") return Number(value);
  return STRIPPED_KEYS.includes(key) ? String(value).trim() : value;
}

/** routers/auth.py NewPassword: 8-128 code points and at most 72 UTF-8 bytes. */
function isNewPassword(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const length = lengthOf(value);
  const bytes = new TextEncoder().encode(value).length;
  return (
    length >= PASSWORD_LIMITS.min &&
    length <= PASSWORD_LIMITS.max &&
    bytes <= PASSWORD_LIMITS.maxBytes
  );
}

/** FastAPI's bool query parameter; the web sends "true" or "false", a missing one is the default true. */
const keepFlag = (query: URLSearchParams, name: string) => query.get(name) !== "false";

/** pydantic's 422: one entry per refused location; the msg is free text the web never shows. */
const refusal = (locations: readonly (readonly string[])[]): Reply =>
  reply(HTTP_UNPROCESSABLE, {
    detail: locations.map((loc) => ({ type: "value_error", loc, msg: "refused" })),
  });

const isObject = (value: unknown): value is SettingsRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One call of a channel test that passed the rate limit; Pushover has no recipient. */
export interface SettingsTestCall {
  channel: NotifyChannel;
  recipient: string | null;
}

/** settings.py TestEmailBody: "" (the stored default) or an address, stripped by pydantic. */
function testRecipient(sent: unknown): string | null {
  const recipient = isObject(sent) ? (sent.recipient ?? "") : "";
  if (recipient === "") return "";
  return isEmail(recipient) ? String(recipient).trim() : null;
}

/** Each job variable replaced by the sample job's value, as the senders do (single pass per name). */
function withSampleJob(text: string): string {
  return Object.entries(SAMPLE_JOB).reduce(
    (filled, [name, value]) => filled.replaceAll(name, value),
    text,
  );
}

/**
 * workers/notifications/templates.py render_email_html with one job, simplified: only the first
 * {{#jobs}} loop and $userName/$platform_name; no $jobs_html, $jobCount or default job rows.
 */
function renderEmail(content: string): string {
  if (!content) return DEFAULT_EMAIL_HTML;
  const open = content.indexOf(JOBS_OPEN);
  const close = content.indexOf(JOBS_CLOSE, open + JOBS_OPEN.length);
  if (open < 0 || close < 0) return content;
  const body = withSampleJob(content.slice(open + JOBS_OPEN.length, close));
  const html = content.slice(0, open) + body + content.slice(close + JOBS_CLOSE.length);
  return html
    .replaceAll("$userName", PREVIEW_USER_NAME)
    .replaceAll("$platform_name", PREVIEW_PLATFORM_NAME);
}

/** core.py NotificationTemplateName (trimmed 1-100) and NotificationTemplateText (1-100,000). */
const TEMPLATE_RULES: Readonly<Record<string, FieldRule>> = {
  name: textWithin(NOTIFICATION_LIMITS.templateName, true),
  content: textWithin(NOTIFICATION_LIMITS.templateContent, false),
};

/** The template fields pydantic refuses; `required` lists those a create must carry. */
function templateRefusals(body: SettingsRow, required: boolean): string[] {
  return Object.keys(TEMPLATE_RULES).filter((key) =>
    key in body ? !TEMPLATE_RULES[key]!(body[key]) : required,
  );
}

/**
 * The settings endpoints by the rules of routers/settings.py and storage.py: answers come from
 * this state, never from the request body. Pass ProfileServer's `profile` as `row`, and both
 * fakes read and write one user_profiles row (preflight ruling 16).
 */
export class SettingsServer {
  readonly profile: SettingsRow;
  templates: NotificationTemplateBody[] = structuredClone(NOTIFICATION_TEMPLATES);
  /** GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on the server. */
  driveAvailable = true;
  /** Every POST /notification-settings body, for "sends only its own fields" assertions. */
  readonly saved: SettingsRow[] = [];
  /** Every channel test that passed the rate limit, in order (preflight ruling 36). */
  readonly tests: SettingsTestCall[] = [];
  private readonly testCounts = new Map<NotifyChannel, number>();
  /** The signed-in user may use the admin endpoints (fixtures.ts: the admin; a spec unsets it). */
  isAdmin = true;
  /** Preflight ruling 43: the preview answers HOSTILE_PREVIEW_BODY instead of a render. */
  hostilePreview = false;
  private nextTemplateId = FIRST_NEW_TEMPLATE_ID;
  /** The account's password (routers/auth.py); a change stores the new one. */
  password = PASSWORD;
  /** The account's job rows as archive-all sees them (preflight ruling 36). */
  jobs: SettingsJob[] = SETTINGS_JOBS.map((entry) => ({ ...entry }));
  /** The query of every DELETE /jobs, e.g. { keep_favorites: "true", keep_applications: "true" }. */
  readonly archiveQueries: Record<string, string>[] = [];
  /** A crawl of this user runs: the factory reset answers 409. */
  crawlRunning = false;
  /** How many factory resets went through. */
  factoryResets = 0;

  constructor(row: SettingsRow = settingsRow()) {
    this.profile = row;
  }

  /** GET /settings: the whole row with secrets masked (deps._mask_profile). */
  settings(): SettingsRow {
    const masked: SettingsRow = {
      language: DEFAULT_LANGUAGE,
      timezone: DEFAULT_TIMEZONE,
      ...structuredClone(this.profile),
    };
    for (const key of MASKED_KEYS) if (masked[key]) masked[key] = SECRET_MASK;
    return masked;
  }

  /** POST /notification-settings: writes only the keys sent (B2); a refused key writes nothing. */
  saveNotifications(sent: unknown): Reply | { status: string } {
    this.saved.push(structuredClone(sent as SettingsRow));
    if (!isObject(sent)) return refusal([["body"]]);
    const body = sent;
    const refused = refusedKeys(body);
    if (refused.length > 0) return refusal(refused.map((key) => ["body", key]));
    for (const key of Object.keys(body).filter((name) => NOTIFICATION_KEYS.includes(name))) {
      if (MASKED_KEYS.includes(key) && body[key] === SECRET_MASK) continue;
      this.profile[key] = storedValue(key, body[key]);
    }
    return { status: "saved" };
  }

  /** POST /timezone-preference: an unknown zone is stored as Europe/Berlin; the answer is the stored one. */
  saveTimezone(sent: unknown): { status: string; timezone: string } {
    const zone = isObject(sent) ? sent.timezone : undefined;
    const timezone = isKnownZone(zone) ? zone : DEFAULT_TIMEZONE;
    this.profile.timezone = timezone;
    return { status: "saved", timezone };
  }

  /** POST /language-preference: "de" or "en", anything else is stored as "de". */
  saveLanguage(sent: unknown): { status: string; language: string } {
    const choice = isObject(sent) ? sent.language : undefined;
    const language = KNOWN_LANGUAGES.includes(choice) ? String(choice) : DEFAULT_LANGUAGE;
    this.profile.language = language;
    return { status: "saved", language };
  }

  /** GET /notification-settings/channels: _channel_status's predicates. */
  channels(): Record<string, boolean> {
    return Object.fromEntries(
      NOTIFY_CHANNELS.map((channel) => [
        channel,
        REQUIRED_FIELDS[channel].every((field) => Boolean(this.profile[field])),
      ]),
    );
  }

  /**
   * POST /notification-settings/test-{channel}: 422 for a recipient that is no address, 429 from
   * the sixth call of that channel, 400 without credentials or (email) without any recipient.
   */
  test(channel: NotifyChannel, sent: unknown): Reply | { ok: boolean } {
    const recipient = channel === "PUSHOVER" ? "" : testRecipient(sent);
    if (recipient === null) return refusal([["body", "recipient"]]);
    const count = (this.testCounts.get(channel) ?? 0) + 1;
    this.testCounts.set(channel, count);
    if (count > TESTS_PER_MINUTE) {
      return reply(HTTP_TOO_MANY_REQUESTS, { error: "Rate limit exceeded: 5 per 1 minute" });
    }
    this.tests.push({ channel, recipient: channel === "PUSHOVER" ? null : recipient });
    return this.testOutcome(channel, recipient);
  }

  private testOutcome(channel: NotifyChannel, recipient: string): Reply | { ok: boolean } {
    if (!this.channels()[channel]) {
      return reply(HTTP_BAD_REQUEST, {
        detail: `${CHANNEL_NAME[channel]} credentials not configured`,
      });
    }
    if (channel !== "PUSHOVER" && !recipient && !this.profile.email_global_recipient) {
      return reply(HTTP_BAD_REQUEST, { detail: "No recipient provided" });
    }
    return { ok: true };
  }

  /** POST /notification-templates (own) or /admin/notification-templates (global, admins only). */
  createTemplate(sent: unknown, scope: TemplateScope): Reply | NotificationTemplateBody {
    if (!this.mayWrite(scope)) return reply(HTTP_FORBIDDEN, { detail: "Not admin" });
    if (!isObject(sent)) return refusal([["body"]]);
    const refused = templateRefusals(sent, true);
    if (refused.length > 0) return refusal(refused.map((key) => ["body", key]));
    const type = String(sent.type ?? "").toUpperCase();
    if (!CREATABLE_TEMPLATE_TYPES.includes(type)) {
      return reply(HTTP_BAD_REQUEST, { detail: "type must be PUSHOVER, RESEND or MAILJET" });
    }
    return this.storeTemplate({ ...sent, type }, scope);
  }

  /** What the router stores: the trimmed name, the type in capitals, the scope as is_admin. */
  private storeTemplate(sent: SettingsRow, scope: TemplateScope): NotificationTemplateBody {
    const template = {
      id: this.nextTemplateId++,
      name: String(sent.name).trim(),
      type: String(sent.type),
      content: String(sent.content),
      is_admin: scope === "global",
    };
    this.templates.push(template);
    return structuredClone(template);
  }

  /** PUT …/{id}: own templates through the own path, global ones through the admin path, else 404. */
  updateTemplate(
    id: number,
    sent: unknown,
    scope: TemplateScope,
  ): Reply | NotificationTemplateBody {
    if (!this.mayWrite(scope)) return reply(HTTP_FORBIDDEN, { detail: "Not admin" });
    const template = this.templateIn(id, scope);
    if (!template) return reply(HTTP_NOT_FOUND, { detail: "Template not found" });
    if (!isObject(sent)) return refusal([["body"]]);
    const refused = templateRefusals(sent, false);
    if (refused.length > 0) return refusal(refused.map((key) => ["body", key]));
    if ("name" in sent) template.name = String(sent.name).trim();
    if ("content" in sent) template.content = String(sent.content);
    return structuredClone(template);
  }

  /** DELETE …/{id}: the same scoping as the update. */
  deleteTemplate(id: number, scope: TemplateScope): Reply | { ok: boolean } {
    if (!this.mayWrite(scope)) return reply(HTTP_FORBIDDEN, { detail: "Not admin" });
    const template = this.templateIn(id, scope);
    if (!template) return reply(HTTP_NOT_FOUND, { detail: "Template not found" });
    this.templates = this.templates.filter((entry) => entry !== template);
    return { ok: true };
  }

  /** The admin endpoints answer 403 to a member (get_current_admin_user). */
  private mayWrite(scope: TemplateScope): boolean {
    return scope === "own" || this.isAdmin;
  }

  /** Own: is_admin false (one user here); global: is_admin true. */
  private templateIn(id: number, scope: TemplateScope): NotificationTemplateBody | undefined {
    const global = scope === "global";
    return this.templates.find((entry) => entry.id === id && Boolean(entry.is_admin) === global);
  }

  /** POST /notification-templates/preview: the senders' rendering with the sample job; nothing is sent. */
  preview(sent: unknown): Reply | { html: boolean; body: string } {
    const type = isObject(sent) ? String(sent.type ?? "").toUpperCase() : "";
    const content = isObject(sent) && typeof sent.content === "string" ? sent.content : "";
    if (!(NOTIFY_CHANNELS as readonly string[]).includes(type)) return refusal([["body", "type"]]);
    if (lengthOf(content) > NOTIFICATION_LIMITS.templateContent)
      return refusal([["body", "content"]]);
    if (this.hostilePreview) return { html: true, body: HOSTILE_PREVIEW_BODY };
    if (EMAIL_TEMPLATE_TYPES.includes(type)) return { html: true, body: renderEmail(content) };
    return { html: false, body: content ? withSampleJob(content) : DEFAULT_PUSH_TEXT };
  }

  /** POST /auth/change-password: 422 on new_password first (pydantic), then 400 for a wrong current one. */
  changePassword(sent: unknown): Reply | { status: string } {
    const body = isObject(sent) ? sent : {};
    if (!isNewPassword(body.new_password)) return refusal([["body", "new_password"]]);
    if (body.current_password !== this.password) {
      return reply(HTTP_BAD_REQUEST, { detail: "Incorrect current password" });
    }
    this.password = String(body.new_password);
    return { status: "password updated" };
  }

  /** DELETE /jobs (Task 2 rule): archives what is not SEEN, not archived and not kept. */
  archiveAll(request: Request): { status: string; count: number } {
    const query = new URL(request.url()).searchParams;
    this.archiveQueries.push(Object.fromEntries(query));
    const keepFavorites = keepFlag(query, "keep_favorites");
    const keepApplications = keepFlag(query, "keep_applications");
    const archived = this.jobs.filter(
      (entry) =>
        entry.status !== SEEN_STATUS &&
        !entry.is_archived &&
        !(keepFavorites && entry.is_favorite) &&
        !(keepApplications && APPLICATION_STATUSES.includes(entry.status)),
    );
    for (const entry of archived) entry.is_archived = true;
    return { status: "archived", count: archived.length };
  }

  /** DELETE /settings: empties Ziel and Lebenslauf; channels, storage and templates stay. */
  resetProfile(): { status: string } {
    Object.assign(this.profile, structuredClone(GOAL_AND_CV));
    return { status: "deleted" };
  }

  /**
   * DELETE /user/reset: 400 for a wrong password, then 409 while a crawl runs; else the row,
   * the own templates and the jobs go (delete_user_content), global templates stay.
   */
  factoryReset(sent: unknown): Reply | Record<string, unknown> {
    const password = isObject(sent) ? sent.password : undefined;
    if (password !== this.password)
      return reply(HTTP_BAD_REQUEST, { detail: "Incorrect password" });
    if (this.crawlRunning) return reply(HTTP_CONFLICT, { detail: "A crawl is running" });
    const jobsDeleted = this.jobs.length;
    for (const key of Object.keys(this.profile)) delete this.profile[key];
    this.templates = this.templates.filter((template) => template.is_admin);
    this.jobs = [];
    this.factoryResets += 1;
    return {
      status: "reset complete",
      jobs_deleted: jobsDeleted,
      platforms_deleted: 0,
      profile_deleted: true,
    };
  }

  /** GET /storage/status: derived from the row, as routers/storage.py does; never the token. */
  storageStatus(): StorageStatusBody {
    return {
      available: this.driveAvailable,
      connected: Boolean(this.profile.google_drive_refresh_token),
      active:
        (this.profile.active_storage_service as StorageService | null | undefined) || STORAGE_NONE,
      email: (this.profile.google_drive_email as string | null | undefined) ?? null,
    };
  }

  /** POST /storage/toggle: 400 for an unknown service and for Drive without a connection. */
  toggleStorage(sent: unknown): Reply | { status: string; service: StorageService } {
    const service = STORAGE_SERVICES.find((known) => isObject(sent) && sent.service === known);
    if (!service) return reply(HTTP_BAD_REQUEST, { detail: "Invalid storage service" });
    if (service === STORAGE_DRIVE && !this.profile.google_drive_refresh_token) {
      return reply(HTTP_BAD_REQUEST, { detail: "Google Drive not connected" });
    }
    this.profile.active_storage_service = service;
    return { status: "success", service };
  }

  /** POST /storage/google/disconnect: drops the link and falls back to the database. */
  disconnect(): { status: string } {
    this.profile.active_storage_service = STORAGE_NONE;
    this.profile.google_drive_refresh_token = null;
    this.profile.google_drive_email = null;
    return { status: "disconnected" };
  }
}

function testRoutes(server: SettingsServer): MockRoutes {
  return Object.fromEntries(
    NOTIFY_CHANNELS.map((channel) => [
      `POST ${notificationTestPath(channel)}`,
      live((sent) => server.test(channel, sent)),
    ]),
  );
}

/** The template writes under both scopes; PUT and DELETE for every id a spec can reach. */
function templateRoutes(server: SettingsServer): MockRoutes {
  const created = Array.from(
    { length: NEW_TEMPLATE_SLOTS },
    (_, slot) => FIRST_NEW_TEMPLATE_ID + slot,
  );
  const ids = [...server.templates.map((template) => template.id), ...created];
  const routes: MutableRoutes = {
    [`POST ${NOTIFICATION_PREVIEW_PATH}`]: live((sent) => server.preview(sent)),
  };
  for (const scope of TEMPLATE_SCOPES) {
    routes[`POST ${notificationTemplatesWritePath(scope)}`] = live((sent) =>
      server.createTemplate(sent, scope),
    );
    for (const id of ids) {
      routes[`PUT ${notificationTemplatePath(id, scope)}`] = live((sent) =>
        server.updateTemplate(id, sent, scope),
      );
      routes[`DELETE ${notificationTemplatePath(id, scope)}`] = live(() =>
        server.deleteTemplate(id, scope),
      );
    }
  }
  return routes;
}

/**
 * The settings routes over `base`. A cross-page spec passes `base = {}` into another page's routes,
 * e.g. `sourcesRoutes(sources, settingsRoutes(settings, {}, {}))`, so the live channels and
 * templates win and the other page's live lists stay (preflight ruling 16).
 */
export function settingsRoutes(
  server = new SettingsServer(),
  extra: MockRoutes = {},
  base: MockRoutes = AUTHENTICATED_ROUTES,
): MutableRoutes {
  return {
    ...base,
    [`GET ${SETTINGS_PATH}`]: live(() => server.settings()),
    [`POST ${NOTIFICATION_SETTINGS_PATH}`]: live((sent) => server.saveNotifications(sent)),
    [`GET ${CHANNEL_STATUS_PATH}`]: live(() => server.channels()),
    [`GET ${NOTIFICATION_TEMPLATES_PATH}`]: live(() => structuredClone(server.templates)),
    [`GET ${STORAGE_STATUS_PATH}`]: live(() => server.storageStatus()),
    [`POST ${STORAGE_TOGGLE_PATH}`]: live((sent) => server.toggleStorage(sent)),
    [`POST ${STORAGE_DISCONNECT_PATH}`]: live(() => server.disconnect()),
    [`POST ${TIMEZONE_PATH}`]: live((sent) => server.saveTimezone(sent)),
    [`POST ${LANGUAGE_PATH}`]: live((sent) => server.saveLanguage(sent)),
    [`POST ${CHANGE_PASSWORD_PATH}`]: live((sent) => server.changePassword(sent)),
    [`DELETE ${JOBS_PATH}`]: live((_sent, request) => server.archiveAll(request)),
    [`DELETE ${PROFILE_RESET_PATH}`]: live(() => server.resetProfile()),
    [`DELETE ${FACTORY_RESET_PATH}`]: live((sent) => server.factoryReset(sent)),
    ...testRoutes(server),
    ...templateRoutes(server),
    ...extra,
  };
}
