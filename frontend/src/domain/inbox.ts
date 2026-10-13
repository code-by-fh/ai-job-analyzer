import type { InboxTab, JobListItem, JobPage } from "@/api/jobList";
import { parseInline, parseMarkdown, plainInline, type MarkdownBlock } from "./markdown";
import { parseFitReasoning } from "./reasoning";

export const TAB_QUERY_KEY = "tab";
export const JOB_QUERY_KEY = "job";
export const VIEW_QUERY_KEY = "view";
export const SETUP_VIEW = "setup";
export const INBOX_PATH = "/inbox";
export const FIT_LINE_MAX = 140;

// Decision D1: German URL values like the job page (?tab=unterlagen); "Neu" is the default.
const TAB_PARAM: Readonly<Record<InboxTab, string | null>> = {
  new: null,
  below: "unter",
  dismissed: "aus",
};
const TABS = Object.keys(TAB_PARAM) as InboxTab[];
// Shorter "sentences" are abbreviations ("z.B.", "Dr.") or fragments; the line runs on to the next end.
export const MIN_FIT_SENTENCE = 15;
const SENTENCE_END = /[.!?](?=\s|$)/g;
const WHITESPACE = /\s+/g;
const RULE = /^[-*_]{3,}$/;
const ELLIPSIS = "…";

export function inboxTabFromParam(value: string | null): InboxTab {
  return TABS.find((tab) => TAB_PARAM[tab] === value) ?? "new";
}

export interface InboxLocation {
  tab: InboxTab;
  jobId?: string | null;
  setup?: boolean;
}

export function inboxHref({ tab, jobId, setup }: InboxLocation): string {
  const params = new URLSearchParams();
  const tabParam = TAB_PARAM[tab];
  if (tabParam) params.set(TAB_QUERY_KEY, tabParam);
  if (jobId) params.set(JOB_QUERY_KEY, jobId);
  if (setup) params.set(VIEW_QUERY_KEY, SETUP_VIEW);
  const query = params.toString();
  return query ? `${INBOX_PATH}?${query}` : INBOX_PATH;
}

/** Rows of all loaded pages; offset paging can repeat a row after a removal, so ids stay unique. */
export function flattenPages(pages: readonly JobPage[] | undefined): JobListItem[] {
  const seen = new Set<string>();
  const rows: JobListItem[] = [];
  for (const row of (pages ?? []).flatMap((page) => page.items)) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

/** Optimistic removal: drops the row and lowers every page's total, so paging stays consistent. */
export function withoutItem(pages: readonly JobPage[], id: string): JobPage[] {
  const found = pages.some((page) => page.items.some((row) => row.id === id));
  if (!found) return [...pages];
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((row) => row.id !== id),
    total: Math.max(0, page.total - 1),
  }));
}

export interface RowPosition {
  page: number;
  index: number;
}

export function positionOf(pages: readonly JobPage[], id: string): RowPosition | null {
  for (const [page, entry] of pages.entries()) {
    const index = entry.items.findIndex((row) => row.id === id);
    if (index !== -1) return { page, index };
  }
  return null;
}

/**
 * Undoes withoutItem for one row only (a failed or undone triage): the row goes back to its old
 * place, or to the end when that page is gone, and every total rises again. Rows other triages
 * removed meanwhile stay out; a row that is already listed is not added twice.
 */
export function withItemAt(
  pages: readonly JobPage[],
  item: JobListItem,
  at: RowPosition,
): JobPage[] {
  const listed = pages.some((page) => page.items.some((row) => row.id === item.id));
  if (listed || pages.length === 0) return [...pages];
  const last = pages.length - 1;
  const target = Math.min(at.page, last);
  const index = at.page > last ? Number.POSITIVE_INFINITY : at.index;
  return pages.map((page, number) => ({
    ...page,
    items: number === target ? insertAt(page.items, item, index) : page.items,
    total: page.total + 1,
  }));
}

function insertAt(items: readonly JobListItem[], item: JobListItem, index: number): JobListItem[] {
  const at = Math.min(index, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** The shown row: the one in the URL, else the first (a stale link must not leave the pane empty). */
export function selectedItem(
  rows: readonly JobListItem[],
  jobId: string | null,
): JobListItem | null {
  return rows.find((row) => row.id === jobId) ?? rows[0] ?? null;
}

/** After a row leaves the list its successor is shown, else its predecessor (prototype selectAfter). */
export function nextSelection(rows: readonly { id: string }[], removedId: string): string | null {
  const index = rows.findIndex((row) => row.id === removedId);
  if (index === -1) return null;
  return rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
}

/** One plain line for a row: the summary's first sentence, else the first strength. */
export function fitLine(reasoning?: string | null): string | null {
  const fit = parseFitReasoning(reasoning);
  const source = fit ? fit.summary || fit.strengths[0] || "" : (reasoning ?? "");
  const plain = firstPlainLine(source);
  return plain ? shorten(firstSentence(plain)) : null;
}

/** Line by line, so a heading or bold-only line is not glued to the text below it. */
function firstPlainLine(text: string): string {
  for (const raw of text.split("\n")) {
    const plain = plainText(parseMarkdown(raw.trim())[0]).replace(WHITESPACE, " ").trim();
    if (plain) return plain;
  }
  return "";
}

function plainText(block: MarkdownBlock | undefined): string {
  if (block?.type === "list") return plainInline(block.items[0]);
  if (block?.type !== "paragraph" || isStructure(block.text)) return "";
  return plainInline(block.text);
}

function isStructure(text: string): boolean {
  const segments = parseInline(text);
  const boldOnly = segments.length === 1 && segments[0].type === "strong";
  return boldOnly || text.startsWith("|") || RULE.test(text);
}

function firstSentence(text: string): string {
  for (const end of text.matchAll(SENTENCE_END)) {
    if (end.index + 1 >= MIN_FIT_SENTENCE) return text.slice(0, end.index + 1);
  }
  return text;
}

/** Cuts by code points so an emoji at the limit is never split. */
function shorten(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= FIT_LINE_MAX) return text;
  return `${chars
    .slice(0, FIT_LINE_MAX - ELLIPSIS.length)
    .join("")
    .trimEnd()}${ELLIPSIS}`;
}

export type ListPhase = "loading" | "stalled" | "error" | "empty" | "ready";

export interface ListStatus {
  hasData: boolean;
  isError: boolean;
  failureCount: number;
  itemCount: number;
}

/** Decision D10: without data a failed request that is being retried is "stalled", not an error yet. */
export function isListStalled(request: Omit<ListStatus, "itemCount">): boolean {
  return !request.hasData && !request.isError && request.failureCount > 0;
}

export function listPhase(status: ListStatus): ListPhase {
  if (status.hasData) return status.itemCount === 0 ? "empty" : "ready";
  if (status.isError) return "error";
  return isListStalled(status) ? "stalled" : "loading";
}
