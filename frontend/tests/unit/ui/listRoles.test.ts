import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = "src";
const LIST_TAGS = new Set(["ul", "ol"]);
const LIST_ROLE = "list";

type ListTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

/** True when the tag's first attribute is the literal role="list". */
function opensWithListRole(tag: ListTag): boolean {
  const first = tag.attributes.properties[0];
  if (first === undefined || !ts.isJsxAttribute(first)) return false;
  const value = first.initializer;
  return (
    first.name.getText() === "role" &&
    value !== undefined &&
    ts.isStringLiteral(value) &&
    value.text === LIST_ROLE
  );
}

function isBareList(node: ts.Node): node is ListTag {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
  return LIST_TAGS.has(node.tagName.getText()) && !opensWithListRole(node);
}

/**
 * 1-based lines of every JSX <ul>/<ol> whose first attribute is not role="list". Parsed as TSX,
 * so "<ul>" inside a comment or a string is no tag and never counts.
 */
function bareListLines(source: string): number[] {
  const file = ts.createSourceFile(
    "list.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lines: number[] = [];
  const lineOf = (node: ts.Node) =>
    file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node: ts.Node): void => {
    if (isBareList(node)) lines.push(lineOf(node));
    node.forEachChild(visit);
  };
  visit(file);
  return lines;
}

/** "path:line" below src, with "/" separators, for every list without a leading role="list". */
function bareLists(): string[] {
  // Recursive, so components in subfolders are read too.
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".tsx"))
    .flatMap((name) => {
      const path = name.split(sep).join("/");
      return bareListLines(readFileSync(join(SRC_DIR, name), "utf8")).map(
        (line) => `${path}:${line}`,
      );
    })
    .sort();
}

describe("the list reader", () => {
  it("flags JSX lists without a leading role, not comments or strings", () => {
    const source = [
      "// <ul> in a comment",
      'const html = "<ol>";',
      'const a = <ul role="list" className="a" />;',
      'const b = <ul className="b" role="list" />;',
      "const c = <ol>{html}</ol>;",
      "const d = (",
      "  <ul",
      '    role="list"',
      "  >",
      "    {/* <ol> */}",
      "  </ul>",
      ");",
      'const e = <ul role="presentation" />;',
    ].join("\n");
    expect(bareListLines(source)).toEqual([4, 5, 13]);
  });
});

describe("lists", () => {
  it('open with role="list", so Safari keeps their semantics without markers', () => {
    expect(bareLists()).toEqual([]);
  });
});
