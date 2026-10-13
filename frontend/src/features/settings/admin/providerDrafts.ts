import type { AiSettings, AiSettingsPatch } from "@/api/admin";
import { ADMIN_LIMITS } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

/** The key is write-only: the draft starts empty and only a typed key is sent (R4). */
export interface CloudDraft {
  key: string;
  model: string;
}

export interface LocalDraft {
  url: string;
  model: string;
}

export type DraftErrors<T> = Partial<Record<keyof T, MessageKey>>;

// The scheme and at least one character of an authority: "http:///v1" has no server.
const HTTP_URL = /^https?:\/\/[^/]/i;

/** Python's len() counts code points, as pydantic's length bounds do. */
const lengthOf = (text: string) => Array.from(text).length;

export const cloudDraftOf = (settings: AiSettings): CloudDraft => ({
  key: "",
  model: settings.openrouter_model,
});

export const localDraftOf = (settings: AiSettings): LocalDraft => ({
  url: settings.ollama_base_url,
  model: settings.ollama_model,
});

function modelProblem(model: string, required: boolean): MessageKey | null {
  const length = lengthOf(model.trim());
  if (required && length === 0) return "settings.problem.required";
  return length > ADMIN_LIMITS.model ? "settings.problem.tooLong" : null;
}

/**
 * Empty clears the address. The server also refuses userinfo and link-local hosts (R8b); the
 * credentials are caught here, a link-local literal only there.
 */
function urlProblem(url: string): MessageKey | null {
  const trimmed = url.trim();
  if (trimmed === "") return null;
  if (lengthOf(trimmed) > ADMIN_LIMITS.baseUrl) return "settings.problem.tooLong";
  if (!HTTP_URL.test(trimmed) || !URL.canParse(trimmed)) return "settings.ai.invalidUrl";
  const parsed = new URL(trimmed);
  if (parsed.hostname === "") return "settings.ai.invalidUrl";
  return parsed.username || parsed.password ? "settings.ai.urlRefused" : null;
}

const withoutNulls = <T>(errors: Record<keyof T, MessageKey | null>): DraftErrors<T> =>
  Object.fromEntries(
    Object.entries(errors).filter(([, problem]) => problem !== null),
  ) as DraftErrors<T>;

export function cloudErrors(draft: CloudDraft): DraftErrors<CloudDraft> {
  const keyTooLong = lengthOf(draft.key) > ADMIN_LIMITS.apiKey;
  return withoutNulls<CloudDraft>({
    key: keyTooLong ? "settings.problem.tooLong" : null,
    model: modelProblem(draft.model, true),
  });
}

export function localErrors(draft: LocalDraft): DraftErrors<LocalDraft> {
  return withoutNulls<LocalDraft>({
    url: urlProblem(draft.url),
    model: modelProblem(draft.model, false),
  });
}

/** Only a typed key and a changed model are sent. */
export function cloudPatch(draft: CloudDraft, settings: AiSettings): AiSettingsPatch {
  const model = draft.model.trim();
  return {
    ...(draft.key === "" ? {} : { openrouter_api_key: draft.key }),
    ...(model === settings.openrouter_model ? {} : { openrouter_model: model }),
  };
}

export function localPatch(draft: LocalDraft, settings: AiSettings): AiSettingsPatch {
  const url = draft.url.trim();
  const model = draft.model.trim();
  return {
    ...(url === settings.ollama_base_url ? {} : { ollama_base_url: url }),
    ...(model === settings.ollama_model ? {} : { ollama_model: model }),
  };
}

/** routers/admin.py SystemSettingsUpdate: the field a 422 names, with the form's own text. */
export const CLOUD_REFUSALS: Readonly<Record<string, [keyof CloudDraft, MessageKey]>> = {
  openrouter_api_key: ["key", "settings.problem.tooLong"],
  openrouter_model: ["model", "settings.problem.tooLong"],
};

export const LOCAL_REFUSALS: Readonly<Record<string, [keyof LocalDraft, MessageKey]>> = {
  ollama_base_url: ["url", "settings.ai.urlRefused"],
  ollama_model: ["model", "settings.problem.tooLong"],
};
