import type { MessageKey } from "@/i18n/de";

/**
 * Curated motivating quotes for "Wie geht's weiter" (T14 ruling): a local DE/EN list, no external
 * quote API (CSP, privacy, works offline). Each fits a rejection, a withdrawal and a declined offer.
 */
export const QUOTES = [
  { text: "moveOn.quote.kaestner", source: "moveOn.source.kaestner" },
  { text: "moveOn.quote.proverbJapan", source: "moveOn.source.proverbJapan" },
  { text: "moveOn.quote.beckett", source: "moveOn.source.beckett" },
  { text: "moveOn.quote.hesse", source: "moveOn.source.hesse" },
  { text: "moveOn.quote.kierkegaard", source: "moveOn.source.kierkegaard" },
  { text: "moveOn.quote.laozi", source: "moveOn.source.laozi" },
  { text: "moveOn.quote.proverbChina", source: "moveOn.source.proverbChina" },
] as const satisfies ReadonlyArray<{ text: MessageKey; source: MessageKey }>;

/** A stable first quote per job, so a reload or a re-render does not swap it. */
export function firstQuoteIndex(jobId: string): number {
  let sum = 0;
  for (const char of jobId) sum += char.codePointAt(0) ?? 0;
  return sum % QUOTES.length;
}

export function nextQuoteIndex(index: number): number {
  return (index + 1) % QUOTES.length;
}
