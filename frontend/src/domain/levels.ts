export type Level = "high" | "medium" | "low";

// A Map, not an object literal: AI text such as "constructor" must not hit a prototype key.
const LEVELS: ReadonlyMap<string, Level> = new Map([
  ["high", "high"],
  ["hoch", "high"],
  ["medium", "medium"],
  ["moderate", "medium"],
  ["mittel", "medium"],
  ["low", "low"],
  ["niedrig", "low"],
  ["gering", "low"],
]);

/** AI levels come as free text ("High", " moderate "); null when the value is not recognised. */
export function levelKey(value?: string | null): Level | null {
  return value ? (LEVELS.get(value.trim().toLowerCase()) ?? null) : null;
}
