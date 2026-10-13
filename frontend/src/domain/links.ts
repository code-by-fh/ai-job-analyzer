const URL_IN_TEXT = /https?:\/\/[^\s,;"'<>]+/gi;
const HTTP_URL = /^https?:\/\//i;
const TRAILING_PUNCTUATION = ".,;:!?]";
const WWW_PREFIX = /^www\./;
// AI output may nest links in objects of lists; two levels cover every shape seen so far.
const MAX_DEPTH = 2;

export function isHttpUrl(text: string): boolean {
  return HTTP_URL.test(text);
}

/** Every http(s) link found in an AI "online_resources" value, first occurrence first. */
export function resourceLinks(value: unknown): string[] {
  return [...new Set(collect(value, 0))];
}

function collect(value: unknown, depth: number): string[] {
  if (typeof value === "string") return (value.match(URL_IN_TEXT) ?? []).map(trimTrailing);
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return [];
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.flatMap((child) => collect(child, depth + 1));
}

/**
 * Sentence punctuation after a link is not part of it; a ")" stays when the URL opens one itself.
 * One reverse scan with running counts, so a hostile ")" run costs linear time.
 */
function trimTrailing(url: string): string {
  const opened = count(url, "(");
  let closed = count(url, ")");
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    const strayParen = last === ")" && closed > opened;
    if (!strayParen && !TRAILING_PUNCTUATION.includes(last)) break;
    if (strayParen) closed -= 1;
    end -= 1;
  }
  return url.slice(0, end);
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

// Separators left between a title and its URL ("Blog: https://…", "Blog – https://…").
const TITLE_EDGE = /^[\s:–—-]+|[\s:–—-]+$/g;

/** The text of a source without its URLs, e.g. the title of "Engineering Blog https://…". */
export function sourceTitle(source: string): string {
  return source.replace(URL_IN_TEXT, " ").replace(TITLE_EDGE, "").replace(/\s+/g, " ");
}

/** The href for a link built from crawled or AI data: only a parseable http(s) URL, else null. */
export function safeHref(url?: string | null): string | null {
  return url && isHttpUrl(url) && URL.canParse(url) ? url : null;
}

export function hostOf(url?: string | null): string | null {
  const href = safeHref(url);
  return href ? new URL(href).host.replace(WWW_PREFIX, "") : null;
}
