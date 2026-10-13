import type { OpenRouterModel } from "@/api/admin";
import { ADMIN_LIMITS } from "@/api/adminPaths";

export type ModelFilter = Readonly<{
  models: readonly OpenRouterModel[];
  query: string;
  freeOnly: boolean;
  /** The model the form holds; it stays the first option, whatever the filter says (D3). */
  current: string;
}>;

/** OpenRouter sends prices as decimal strings; a missing or unreadable price is not free. */
function costsNothing(price: string | undefined): boolean {
  if (price === undefined || price.trim() === "") return false;
  return Number(price) === 0;
}

/** D3: free means prompt and completion both cost nothing. */
export function isFreeModel(model: OpenRouterModel): boolean {
  return costsNothing(model.pricing.prompt) && costsNothing(model.pricing.completion);
}

function matcher(query: string, freeOnly: boolean): (model: OpenRouterModel) => boolean {
  const needle = query.trim().toLowerCase();
  return (model) =>
    (!freeOnly || isFreeModel(model)) &&
    (model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle));
}

/** The picker's options: the current model first when listed, then the matches, at most modelOptions. */
export function filterModels({ models, query, freeOnly, current }: ModelFilter): OpenRouterModel[] {
  const matches = matcher(query, freeOnly);
  const stored = models.filter((model) => model.id === current).slice(0, 1);
  const rest = models.filter((model) => model.id !== current && matches(model));
  return [...stored, ...rest].slice(0, ADMIN_LIMITS.modelOptions);
}
