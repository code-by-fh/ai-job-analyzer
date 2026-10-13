import { parseInline, parseMarkdown, type MarkdownBlock } from "@/domain/markdown";

/** AI markdown as React nodes (never as HTML), so model output cannot inject markup. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      {parseMarkdown(source).map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.type === "heading") {
    return (
      <h4 className="sec-title-sm">
        <InlineText text={block.text} />
      </h4>
    );
  }
  if (block.type === "list") return <ListBlock items={block.items} />;
  return (
    <p>
      <InlineText text={block.text} />
    </p>
  );
}

function ListBlock({ items }: { items: readonly string[] }) {
  return (
    <ul role="list">
      {items.map((item, index) => (
        <li key={index}>
          <InlineText text={item} />
        </li>
      ))}
    </ul>
  );
}

export function InlineText({ text }: { text: string }) {
  return parseInline(text).map((segment, index) => {
    if (segment.type === "strong") return <strong key={index}>{segment.text}</strong>;
    if (segment.type === "link") {
      return (
        <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer">
          {segment.text}
        </a>
      );
    }
    return <span key={index}>{segment.text}</span>;
  });
}
