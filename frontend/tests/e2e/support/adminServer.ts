// Runtime imports only from modules without the API client (it needs the app's env at load).
import type {
  AdminUser,
  AiSettingsBody,
  ConnectionResult,
  OpenRouterModel,
} from "../../../src/api/admin";
import {
  ADMIN_LIMITS,
  ADMIN_REFUSAL,
  ADMIN_SETTINGS_PATH,
  AI_PROVIDERS,
  AI_TASKS,
  CLEAR_AI_ERROR_PATH,
  CRAWL_CLEANUP_PATH,
  DATABASE_WIPE_PATH,
  LOCAL_TEST_PATH,
  OPENROUTER_MODELS_PATH,
  OPENROUTER_TEST_PATH,
  SYSTEM_STATUS_PATH,
  USERNAME_PATTERN,
  USERS_PATH,
  userPath,
  type AiErrorCode,
  type AiProvider,
  type AiTask,
} from "../../../src/api/adminPaths";
import { PASSWORD_LIMITS } from "../../../src/api/settingsPaths";
import { ADMIN_USER_ID } from "./fixtures";
import { live, reply, type MockRoutes, type MutableRoutes, type Reply } from "./mockApi";
import { PASSWORD } from "./settingsFixtures";
import { SettingsServer, settingsRoutes } from "./settingsServer";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
// routers/admin.py ADMIN_TEST_RATE (10/minute) and RESET_RATE for the wipe (5/minute).
const TEST_LIMIT = 10;
const WIPE_LIMIT = 5;
const RATE_LIMITED = { error: "Rate limit exceeded: 10 per 1 minute" };
// routers/admin.py DEFAULT_OPENROUTER_MODEL and DEFAULT_OLLAMA_MODEL.
const DEFAULT_CLOUD_MODEL = "tngtech/deepseek-r1t2-chimera:free";
const DEFAULT_LOCAL_MODEL = "llama3.1:8b";
/** The key the installation starts with; a spec asserts the page never shows it. */
export const STORED_KEY = "sk-or-e2e-gespeichert";
/** The admin's password, which the wipe checks (the signed-in account of SettingsServer). */
export const ADMIN_PASSWORD = PASSWORD;
// routers/auth.py DEFAULT_USERS_PAGE: what GET /users answers without a limit.
const DEFAULT_USERS_PAGE = 100;
const FIRST_NEW_USER_ID = 100;
const NEW_USER_SLOTS = 10;
// urlparse finds no hostname without an authority ("http:///v1").
const HTTP_URL = /^https?:\/\/[^/]/i;
const LINK_LOCAL = /^(169\.254\.|\[?fe[89ab][0-9a-f]:)/i;

// intelligence/service.py TASK_DEFAULTS: cv_tailoring runs locally unless routed otherwise.
const TASK_DEFAULTS: Readonly<Record<AiTask, AiProvider>> = {
  job_analysis: "cloud",
  cover_letter: "cloud",
  cv_tailoring: "local",
  interview_prep: "cloud",
  company_profile: "cloud",
  deep_dive: "cloud",
  extract_job_details: "cloud",
  platform_name: "cloud",
};

/** GET /admin/openrouter/models: three of OpenRouter's entries, one of them free. */
export const OPENROUTER_MODELS: OpenRouterModel[] = [
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI: GPT-4o mini",
    context_length: 128000,
    pricing: { prompt: "0.00000015", completion: "0.0000006" },
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Anthropic: Claude 3.5 Haiku",
    context_length: 200000,
    pricing: { prompt: "0.0000008", completion: "0.000004" },
  },
  {
    id: DEFAULT_CLOUD_MODEL,
    name: "TNG: DeepSeek R1T2 Chimera (free)",
    context_length: 163840,
    pricing: { prompt: "0", completion: "0" },
  },
];

/** The signed-in admin, another admin and a member, sorted by name like GET /users. */
export const ADMIN_USERS: readonly AdminUser[] = [
  { id: ADMIN_USER_ID, username: "admin", is_admin: true },
  { id: 3, username: "lena", is_admin: true },
  { id: 2, username: "mara", is_admin: false },
];

export type TestKind = "cloud" | "local";

/** The system_settings row as routers/admin.py stores it (the key apart, see AdminServer). */
export interface AdminRow {
  openrouter_model: string | null;
  ollama_model: string | null;
  ollama_base_url: string | null;
  routing: Partial<Record<string, string>>;
}

type Body = Record<string, unknown>;
type FieldRule = (value: unknown) => boolean;

const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** Python's len() counts code points, as pydantic's length bounds do. */
const lengthOf = (text: string) => Array.from(text).length;
const textWithin =
  (min: number, max: number, strip: boolean): FieldRule =>
  (value) => {
    if (typeof value !== "string") return false;
    const length = lengthOf(strip ? value.trim() : value);
    return length >= min && length <= max;
  };

/** SystemSettingsUpdate._http_url_or_empty: a host, no credentials, no link-local literal (R8b). */
function isBaseUrl(value: unknown): boolean {
  if (!textWithin(0, ADMIN_LIMITS.baseUrl, true)(value)) return false;
  const url = String(value).trim();
  if (url === "") return true;
  if (!HTTP_URL.test(url) || !URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (
    parsed.hostname !== "" &&
    !parsed.username &&
    !parsed.password &&
    !LINK_LOCAL.test(parsed.hostname)
  );
}

const ROUTING_FIELD = "ai_task_routing";

/**
 * Where pydantic refuses a routing map: each entry with a provider outside the AiProvider literal
 * (`ai_task_routing.<task>`); only when every value passes does _known_tasks refuse an unknown task
 * (`ai_task_routing`).
 */
function refusedRouting(value: unknown): string[] {
  if (!isObject(value)) return [ROUTING_FIELD];
  const badProviders = Object.entries(value)
    .filter(([, provider]) => !(AI_PROVIDERS as readonly unknown[]).includes(provider))
    .map(([task]) => `${ROUTING_FIELD}.${task}`);
  if (badProviders.length > 0) return badProviders;
  const known = Object.keys(value).every((task) => (AI_TASKS as readonly string[]).includes(task));
  return known ? [] : [ROUTING_FIELD];
}

const SETTINGS_RULES: Readonly<Record<string, FieldRule>> = {
  openrouter_model: textWithin(1, ADMIN_LIMITS.model, true),
  openrouter_api_key: textWithin(0, ADMIN_LIMITS.apiKey, false),
  ollama_model: textWithin(0, ADMIN_LIMITS.model, true),
  ollama_base_url: isBaseUrl,
};

const isSent = (body: Body, key: string) => key in body && body[key] !== null;

/** Every refused field path, dotted (null leaves a field alone, as Optional does). */
function refusedSettings(body: Body): string[] {
  const fields = Object.keys(SETTINGS_RULES).filter(
    (key) => isSent(body, key) && !SETTINGS_RULES[key]!(body[key]),
  );
  return isSent(body, ROUTING_FIELD) ? [...fields, ...refusedRouting(body[ROUTING_FIELD])] : fields;
}

/** FastAPI's 422: one issue per refused path, located under "body" like the real loc. */
const refusal = (fields: readonly string[]): Reply =>
  reply(HTTP_UNPROCESSABLE, {
    detail: fields.map((field) => ({
      type: "value_error",
      loc: ["body", ...field.split(".")],
      msg: "refused",
    })),
  });

const detail = (status: number, code: string): Reply => reply(status, { detail: code });

/** routers/auth.py UserCreate: 3-50 of USERNAME_PATTERN after the trim; NewPassword bounds. */
function refusedUser(body: Body): string[] {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const nameOk = textWithin(ADMIN_LIMITS.usernameMin, ADMIN_LIMITS.usernameMax, false)(username);
  const bytes = new TextEncoder().encode(password).length;
  const passwordOk =
    textWithin(PASSWORD_LIMITS.min, PASSWORD_LIMITS.max, false)(password) &&
    bytes <= PASSWORD_LIMITS.maxBytes;
  return [
    ...(nameOk && USERNAME_PATTERN.test(username) ? [] : ["username"]),
    ...(passwordOk ? [] : ["password"]),
  ];
}

/**
 * The admin endpoints by the rules of routers/admin.py and routers/auth.py: answers come from this
 * state, never from the request body. The stored key is private and only ever answered as
 * `openrouter_api_key_set` (R4).
 */
export class AdminServer {
  readonly row: AdminRow = {
    openrouter_model: null,
    ollama_model: null,
    ollama_base_url: null,
    routing: {},
  };
  /** Every POST /admin/settings body, for "sends only its own fields" assertions. */
  readonly saved: Body[] = [];
  /** The next answer per test; null answers the stored state's success. */
  nextResult: Record<TestKind, ConnectionResult | null> = { cloud: null, local: null };
  /** Calls per test endpoint within the spec (one minute): the eleventh is 429. */
  readonly tests: Record<TestKind, number> = { cloud: 0, local: 0 };
  /** The stored AI error code (GET /admin/system-status); null when there is none. */
  aiError: AiErrorCode | null = null;
  users: AdminUser[] = ADMIN_USERS.map((user) => ({ ...user }));
  /** A crawl of the user to delete runs: the delete answers 409. */
  crawlRunning = false;
  /** wipe_all_users of every wipe that went through. */
  readonly wipes: boolean[] = [];
  private keyValue: string | null;
  private wipeCalls = 0;
  private nextUserId = FIRST_NEW_USER_ID;

  constructor(key: string | null = STORED_KEY) {
    this.keyValue = key;
  }

  /** Whether a key is stored: all a spec (and the page) may know about it. */
  get key(): boolean {
    return Boolean(this.keyValue);
  }

  /** routers/admin.py _settings_answer: the same shape for GET and POST. */
  answer(): AiSettingsBody {
    const routing = Object.fromEntries(
      AI_TASKS.map((task) => {
        const stored = this.row.routing[task];
        return [
          task,
          (AI_PROVIDERS as readonly unknown[]).includes(stored) ? stored : TASK_DEFAULTS[task],
        ];
      }),
    );
    return {
      openrouter_model: this.row.openrouter_model || DEFAULT_CLOUD_MODEL,
      openrouter_api_key_set: this.key,
      ollama_model: this.row.ollama_model || DEFAULT_LOCAL_MODEL,
      ollama_base_url: this.row.ollama_base_url || "",
      ollama_base_url_from_env: false,
      ai_task_routing: routing,
    };
  }

  /** POST /admin/settings: a refused field writes nothing; "" as key removes it. */
  save(sent: unknown): Reply | Body {
    this.saved.push(structuredClone(sent as Body));
    if (!isObject(sent)) return refusal([]);
    const refused = refusedSettings(sent);
    if (refused.length > 0) return refusal(refused);
    this.apply(sent);
    return { status: "updated", ...this.answer() };
  }

  private apply(body: Body): void {
    const text = (key: string) => String(body[key]).trim();
    if (typeof body.openrouter_model === "string")
      this.row.openrouter_model = text("openrouter_model");
    if (typeof body.openrouter_api_key === "string")
      this.keyValue = body.openrouter_api_key || null;
    if (typeof body.ollama_model === "string") this.row.ollama_model = text("ollama_model") || null;
    if (typeof body.ollama_base_url === "string")
      this.row.ollama_base_url = text("ollama_base_url") || null;
    if (isObject(body.ai_task_routing))
      this.row.routing = { ...(body.ai_task_routing as Record<string, string>) };
  }

  /** POST /admin/test/openrouter and /ollama: always 200 with a fixed reason, 429 from the 11th. */
  test(kind: TestKind): Reply | ConnectionResult {
    this.tests[kind] += 1;
    if (this.tests[kind] > TEST_LIMIT) return reply(HTTP_TOO_MANY, RATE_LIMITED);
    const settings = this.answer();
    if (kind === "cloud" && !settings.openrouter_api_key_set)
      return { ok: false, reason: "no_key" };
    if (kind === "local" && settings.ollama_base_url === "") return { ok: false, reason: "no_url" };
    return this.nextResult[kind] ?? this.success(kind);
  }

  private success(kind: TestKind): ConnectionResult {
    const settings = this.answer();
    if (kind === "cloud") return { ok: true, model: settings.openrouter_model };
    const model = settings.ollama_model;
    return { ok: true, model, model_found: true, available_models: [model] };
  }

  /** GET /admin/openrouter/models: 400 no_key without a stored key. */
  models(): Reply | OpenRouterModel[] {
    if (!this.key) return detail(HTTP_BAD_REQUEST, ADMIN_REFUSAL.noKey);
    return structuredClone(OPENROUTER_MODELS);
  }

  clearAiError(): { status: string } {
    this.aiError = null;
    return { status: "cleared" };
  }

  /** POST /admin/database/wipe: 400 wrong_password (never 401), 429 from the sixth call. */
  wipe(sent: unknown): Reply | { status: string } {
    this.wipeCalls += 1;
    if (this.wipeCalls > WIPE_LIMIT) return reply(HTTP_TOO_MANY, RATE_LIMITED);
    const body = isObject(sent) ? sent : {};
    if (body.password !== ADMIN_PASSWORD)
      return detail(HTTP_BAD_REQUEST, ADMIN_REFUSAL.wrongPassword);
    this.wipes.push(body.wipe_all_users === true);
    return { status: "success" };
  }

  /** GET /users: sorted by name, one page of `limit` (routers/auth.py: default 100, 1-200, 422 beyond). */
  listUsers(query: URLSearchParams): Reply | AdminUser[] {
    const limit = Number(query.get("limit") ?? DEFAULT_USERS_PAGE);
    if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_LIMITS.usersPage)
      return reply(HTTP_UNPROCESSABLE, { detail: [{ loc: ["query", "limit"], msg: "refused" }] });
    const sorted = structuredClone(this.users).sort((a, b) => a.username.localeCompare(b.username));
    return sorted.slice(0, limit);
  }

  /** POST /users: a member only; 409 username_taken ignores case. */
  createUser(sent: unknown): Reply | AdminUser {
    const body = isObject(sent) ? sent : {};
    const refused = refusedUser(body);
    if (refused.length > 0) return refusal(refused);
    const username = String(body.username).trim();
    const taken = this.users.some((user) => user.username.toLowerCase() === username.toLowerCase());
    if (taken) return detail(HTTP_CONFLICT, ADMIN_REFUSAL.usernameTaken);
    const user = { id: this.nextUserId++, username, is_admin: false };
    this.users.push(user);
    return { ...user };
  }

  /** DELETE /users/{id}: 404 unknown, then 409 self, admin, running crawl. */
  deleteUser(id: number): Reply | { status: string } {
    const target = this.users.find((user) => user.id === id);
    if (!target) return detail(HTTP_NOT_FOUND, "User not found");
    if (id === ADMIN_USER_ID) return detail(HTTP_CONFLICT, ADMIN_REFUSAL.cannotDeleteSelf);
    if (target.is_admin) return detail(HTTP_CONFLICT, ADMIN_REFUSAL.cannotDeleteAdmin);
    if (this.crawlRunning) return detail(HTTP_CONFLICT, ADMIN_REFUSAL.crawlRunning);
    this.users = this.users.filter((user) => user.id !== id);
    return { status: "deleted" };
  }
}

/** DELETE /users/{id} is exact per id (mockApi): every known user plus the ids a create hands out. */
function userRoutes(server: AdminServer): MockRoutes {
  const created = Array.from({ length: NEW_USER_SLOTS }, (_, slot) => FIRST_NEW_USER_ID + slot);
  const ids = [...server.users.map((user) => user.id), ...created];
  return {
    [`GET ${USERS_PATH}`]: live((_sent, request) =>
      server.listUsers(new URL(request.url()).searchParams),
    ),
    [`POST ${USERS_PATH}`]: live((sent) => server.createUser(sent)),
    ...Object.fromEntries(
      ids.map((id) => [`DELETE ${userPath(id)}`, live(() => server.deleteUser(id))]),
    ),
  };
}

/**
 * The admin routes over `base` (by default the settings page's), so the frame's queries are
 * served too. A member spec passes `extra = { "GET /me": { body: MEMBER } }`.
 */
export function adminRoutes(
  server = new AdminServer(),
  extra: MockRoutes = {},
  base: MockRoutes = settingsRoutes(new SettingsServer()),
): MutableRoutes {
  return {
    ...base,
    [`GET ${ADMIN_SETTINGS_PATH}`]: live(() => server.answer()),
    [`POST ${ADMIN_SETTINGS_PATH}`]: live((sent) => server.save(sent)),
    [`POST ${OPENROUTER_TEST_PATH}`]: live(() => server.test("cloud")),
    [`POST ${LOCAL_TEST_PATH}`]: live(() => server.test("local")),
    [`GET ${OPENROUTER_MODELS_PATH}`]: live(() => server.models()),
    [`GET ${SYSTEM_STATUS_PATH}`]: live(() => ({ ai_error: server.aiError })),
    [`DELETE ${CLEAR_AI_ERROR_PATH}`]: live(() => server.clearAiError()),
    [`POST ${CRAWL_CLEANUP_PATH}`]: live(() => ({ removed: 2 })),
    [`POST ${DATABASE_WIPE_PATH}`]: live((sent) => server.wipe(sent)),
    ...userRoutes(server),
    ...extra,
  };
}
