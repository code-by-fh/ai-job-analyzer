import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  ADMIN_SETTINGS_PATH,
  AI_ERROR_CODES,
  AI_PROVIDERS,
  AI_TASKS,
  CLEAR_AI_ERROR_PATH,
  CRAWL_CLEANUP_PATH,
  DATABASE_WIPE_PATH,
  LOCAL_TEST_PATH,
  OPENROUTER_MODELS_PATH,
  OPENROUTER_TEST_PATH,
  SYSTEM_STATUS_PATH,
  TEST_REASONS,
  USERS_LIST_PATH,
  USERS_PATH,
  adminCompanyPath,
  userPath,
  type AiProvider,
  type AiTask,
} from "./adminPaths";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

const DEFAULT_PROVIDER: AiProvider = "cloud";

const isProvider = (value: unknown): value is AiProvider =>
  (AI_PROVIDERS as readonly unknown[]).includes(value);

/** Every known task once, in display order; a missing or unknown provider reads as cloud, extra keys are dropped. */
export function routingOf(record: Readonly<Record<string, unknown>>): Record<AiTask, AiProvider> {
  const entries = AI_TASKS.map((task) => {
    const provider = record[task];
    return [task, isProvider(provider) ? provider : DEFAULT_PROVIDER] as const;
  });
  return Object.fromEntries(entries) as Record<AiTask, AiProvider>;
}

// routers/admin.py _settings_answer, the same for GET and POST (POST adds a status zod drops). The
// key itself has no field: only openrouter_api_key_set is read, so a key never reaches the cache.
// Likewise the env OLLAMA_BASE_URL only shows as ollama_base_url_from_env, never as its value.
const aiSettingsSchema = z.object({
  openrouter_model: z.string(),
  openrouter_api_key_set: z.boolean().catch(false),
  ollama_model: z.string(),
  ollama_base_url: z.string().catch(""),
  ollama_base_url_from_env: z.boolean().catch(false),
  ai_task_routing: z.record(z.string(), z.unknown()).catch({}).transform(routingOf),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type AiSettingsBody = z.input<typeof aiSettingsSchema>;
/**
 * Only the sent fields are written. "" as key removes it; "" as local address clears it. 422 on the
 * field for a model of 0 or more than 200, a key over 500, an address that is not http(s) with a
 * host, carries credentials or is link-local, and for an unknown task or provider.
 */
export interface AiSettingsPatch {
  openrouter_model?: string;
  openrouter_api_key?: string;
  ollama_model?: string;
  ollama_base_url?: string;
  ai_task_routing?: Record<AiTask, AiProvider>;
}

export function aiSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.aiSettings,
    queryFn: () => api.request(ADMIN_SETTINGS_PATH, aiSettingsSchema),
  });
}

/** The answer is the stored state in the read shape. */
export async function saveAiSettings(patch: AiSettingsPatch): Promise<AiSettings> {
  return api.request(ADMIN_SETTINGS_PATH, aiSettingsSchema, { method: "POST", json: patch });
}

// A test always answers 200: a failure is a fixed reason, never provider text. 429 after 10/min.
const connectionSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(TEST_REASONS).catch("failed").optional(),
  model: z.string().optional(),
  model_found: z.boolean().optional(),
  available_models: z.array(z.string()).optional(),
});
export type ConnectionResult = z.infer<typeof connectionSchema>;

/** Tests the stored key and model, so the form must be saved first. */
export const testOpenRouter = () =>
  api.request(OPENROUTER_TEST_PATH, connectionSchema, { method: "POST" });
/** Tests the stored address and model; available_models holds at most 200 ids of the server. */
export const testLocalModel = () =>
  api.request(LOCAL_TEST_PATH, connectionSchema, { method: "POST" });

// routers/admin.py _model_list forwards context_length and pricing as OpenRouter sends them: an
// odd value degrades that field instead of failing the whole list.
const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().nullish().catch(null),
  pricing: z.object({ prompt: z.string().optional(), completion: z.string().optional() }).catch({}),
});
export type OpenRouterModel = z.infer<typeof modelSchema>;

/** 400 "no_key" without a stored key, 502 when OpenRouter fails, 429 after 10/min. */
export function openRouterModelsQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.openRouterModels,
    queryFn: () => api.request(OPENROUTER_MODELS_PATH, z.array(modelSchema)),
    enabled,
    staleTime: Infinity,
    // The button shows busy while it runs; a retried 502 would only lengthen the wait (fix round M2).
    retry: false,
  });
}

// 503 "status_unavailable" when Redis is down: a SERVER_ERROR without text (describeError).
// A missing field means no error; only a present but unknown code reads as "unknown".
const systemStatusSchema = z.object({
  ai_error: z
    .enum(AI_ERROR_CODES)
    .catch("unknown")
    .nullish()
    .transform((code) => code ?? null),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;

/** realtime ai_error/ai_error_cleared invalidate it; their message text is never read. */
export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.systemStatus,
    queryFn: () => api.request(SYSTEM_STATUS_PATH, systemStatusSchema),
  });
}

const statusSchema = z.object({ status: z.string() });
const cleanupSchema = z.object({ removed: z.number().int() });

export async function clearAiError(): Promise<void> {
  await api.request(CLEAR_AI_ERROR_PATH, statusSchema, { method: "DELETE" });
}

/** Removes stalled crawl runs and answers how many. */
export async function cleanupCrawls(): Promise<number> {
  return (await api.request(CRAWL_CLEANUP_PATH, cleanupSchema, { method: "POST" })).removed;
}

/** 400 "wrong_password" (never 401), 429 after 5/min; allUsers wipes every user's data. */
export async function wipeDatabase(input: { password: string; allUsers: boolean }): Promise<void> {
  const json = { password: input.password, wipe_all_users: input.allUsers };
  await api.request(DATABASE_WIPE_PATH, statusSchema, { method: "POST", json });
}

const adminUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  is_admin: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** The server's largest page (ADMIN_LIMITS.usersPage users, sorted by name); a full page may be cut. */
export function usersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users,
    queryFn: () => api.request(USERS_LIST_PATH, z.array(adminUserSchema)),
  });
}

/**
 * Creates a member (never an admin). 409 "username_taken" (case-insensitive), 422 on username
 * (3-50 of USERNAME_PATTERN) or password (PASSWORD_LIMITS).
 */
export async function createUser(input: {
  username: string;
  password: string;
}): Promise<AdminUser> {
  const json = { username: input.username, password: input.password };
  return api.request(USERS_PATH, adminUserSchema, { method: "POST", json });
}

/** 409 "cannot_delete_self", "cannot_delete_admin" or "Crawl running"; 404 for an unknown id. */
export async function deleteUser(id: number): Promise<void> {
  await api.request(userPath(id), statusSchema, { method: "DELETE" });
}

const renamedSchema = z.object({ domain: z.string(), name: z.string() });

/** Renames the shared profile for every user; 404 without a profile, 422 on name (1-200 after the trim). */
export async function renameCompany(input: {
  domain: string;
  name: string;
}): Promise<z.infer<typeof renamedSchema>> {
  const json = { name: input.name };
  return api.request(adminCompanyPath(input.domain), renamedSchema, { method: "PATCH", json });
}

/** Deletes only the shared profile (jobs keep their domain); 404 without a profile. */
export async function deleteCompanyProfile(domain: string): Promise<void> {
  await api.request(adminCompanyPath(domain), statusSchema, { method: "DELETE" });
}
