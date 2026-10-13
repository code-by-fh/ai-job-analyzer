export type MarkdownBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; href: string };

import { isHttpUrl } from "@/domain/links";

const HEADING = /^#{1,6}\s+(.+)$/;
export const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
// Bold and [text](target); anything else stays text. Rendered as React nodes, never as HTML.
// Every repetition is bounded and the alternatives are disjoint, so hostile input stays linear.
const INLINE_TOKEN = /(\*\*[^*]{1,200}\*\*|\[[^[\]]{1,200}\]\((?:[^()\s]|\([^()\s]*\)){1,2000}\))/g;
const LINK = /^\[([^\]]+)\]\((\S+)\)$/;
const BOLD_MARK_LENGTH = 2;

/** Small, safe subset for AI text (reasoning, deep dives, prep): headings, lists, paragraphs. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const line of source.split("\n")) appendLine(blocks, line.trim());
  // Empty paragraphs only marked paragraph breaks.
  return blocks.filter((block) => block.type !== "paragraph" || block.text !== "");
}

/** The list a bullet continues: the previous block, or the one before a blank-line marker. */
function listToExtend(blocks: MarkdownBlock[]): { items: string[] } | null {
  const last = blocks[blocks.length - 1];
  if (last?.type === "list") return last;
  const beforeBreak = blocks[blocks.length - 2];
  const isBreak = last?.type === "paragraph" && last.text === "";
  if (isBreak && beforeBreak?.type === "list") {
    blocks.pop();
    return beforeBreak;
  }
  return null;
}

function appendLine(blocks: MarkdownBlock[], line: string): void {
  const heading = HEADING.exec(line);
  const bullet = BULLET.exec(line);
  if (bullet) appendBullet(blocks, bullet[1].trim());
  else if (heading) blocks.push({ type: "heading", text: heading[1].trim() });
  else appendText(blocks, line);
}

function appendBullet(blocks: MarkdownBlock[], item: string): void {
  const list = listToExtend(blocks);
  if (list) list.items.push(item);
  else blocks.push({ type: "list", items: [item] });
}

function appendText(blocks: MarkdownBlock[], line: string): void {
  const last = blocks[blocks.length - 1];
  if (line === "") blocks.push({ type: "paragraph", text: "" });
  else if (last?.type === "paragraph" && last.text !== "") last.text = `${last.text} ${line}`;
  else if (last?.type === "paragraph") last.text = line;
  else blocks.push({ type: "paragraph", text: line });
}

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  for (const part of text.split(INLINE_TOKEN)) {
    if (part !== "") pushSegment(segments, toSegment(part));
  }
  return segments;
}

function toSegment(part: string): InlineSegment {
  const isBold = part.startsWith("**") && part.endsWith("**") && part.length > 2 * BOLD_MARK_LENGTH;
  if (isBold) return { type: "strong", text: part.slice(BOLD_MARK_LENGTH, -BOLD_MARK_LENGTH) };
  const link = LINK.exec(part);
  if (link && isHttpUrl(link[2])) return { type: "link", text: link[1], href: link[2] };
  return { type: "text", text: part };
}

/** The text of an inline run without its markup: bold marks and link targets are dropped. */
export function plainInline(text: string): string {
  return parseInline(text)
    .map((segment) => segment.text)
    .join("");
}

/** A rejected link target is split by the tokenizer; glue neighbouring text back together. */
function pushSegment(segments: InlineSegment[], segment: InlineSegment): void {
  const last = segments[segments.length - 1];
  if (segment.type === "text" && last?.type === "text") last.text += segment.text;
  else segments.push(segment);
}
