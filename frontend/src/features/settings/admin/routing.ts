import type { AiSettings } from "@/api/admin";
import type { AiProvider, AiTask } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

export type RoutingWarning = "localWithoutUrl" | "cloudWithoutKey";

export const WARNING_TEXT: Readonly<Record<RoutingWarning, MessageKey>> = {
  localWithoutUrl: "settings.ai.warnLocal",
  cloudWithoutKey: "settings.ai.warnCloud",
};

export type RoutingCheck = Readonly<{
  /** The draft: the warning appears while the admin routes, before Speichern (D4). */
  routing: Readonly<Record<AiTask, AiProvider>>;
  /** The stored provider state; only what is saved can run a task. */
  settings: Pick<
    AiSettings,
    "ollama_base_url" | "ollama_base_url_from_env" | "openrouter_api_key_set"
  >;
}>;

/** What a routed provider lacks; saving stays allowed (an admin may set the provider up next). */
export function routingWarnings({ routing, settings }: RoutingCheck): RoutingWarning[] {
  const used = new Set(Object.values(routing));
  const warnings: RoutingWarning[] = [];
  const hasUrl = settings.ollama_base_url !== "" || settings.ollama_base_url_from_env;
  if (used.has("local") && !hasUrl) warnings.push("localWithoutUrl");
  if (used.has("cloud") && !settings.openrouter_api_key_set) warnings.push("cloudWithoutKey");
  return warnings;
}
