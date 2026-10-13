const LEGAL_FORMS = new Set([
  "gmbh",
  "ag",
  "se",
  "kg",
  "ug",
  "mbh",
  "co.",
  "&",
  "inc",
  "ltd",
  "llc",
]);
const MONOGRAM_LENGTH = 2;
const UNKNOWN = "?";

/** Two letters for the company square: first letters of two words, else the first two letters. */
export function monogramOf(name?: string | null): string {
  const words = (name ?? "")
    .split(/\s+/)
    .filter((word) => word !== "" && !LEGAL_FORMS.has(word.toLowerCase()));
  if (words.length === 0) return UNKNOWN;
  // Array.from splits by code point, so emoji and other surrogate pairs stay whole.
  const letters =
    words.length > 1 ? words.map((word) => Array.from(word)[0]) : Array.from(words[0]);
  return letters.slice(0, MONOGRAM_LENGTH).join("").toUpperCase();
}
