import { describe, expect, it } from "vitest";
import {
  FIT_LINE_MAX,
  fitLine,
  flattenPages,
  inboxHref,
  inboxTabFromParam,
  isListStalled,
  listPhase,
  nextSelection,
  positionOf,
  selectedItem,
  withItemAt,
  withoutItem,
} from "@/domain/inbox";
import { buildListItem, pageOf } from "../support/listItemFactory";

const a = buildListItem({ id: "a" });
const b = buildListItem({ id: "b" });
const c = buildListItem({ id: "c" });

describe("inbox URL", () => {
  it("reads the German tab values and falls back to Neu", () => {
    expect(["unter", "aus", null, "x"].map(inboxTabFromParam)).toEqual([
      "below",
      "dismissed",
      "new",
      "new",
    ]);
  });

  it("writes only what differs from the default", () => {
    expect(inboxHref({ tab: "new" })).toBe("/inbox");
    expect(inboxHref({ tab: "below", jobId: "job 1" })).toBe("/inbox?tab=unter&job=job+1");
    expect(inboxHref({ tab: "new", setup: true })).toBe("/inbox?view=setup");
  });
});

describe("pages", () => {
  it("flattens pages and drops a row that offset paging repeated", () => {
    const rows = flattenPages([pageOf([a, b], 3), pageOf([b, c], 3)]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("is empty without data", () => {
    expect(flattenPages(undefined)).toEqual([]);
  });

  it("removes a row and lowers the total of every page", () => {
    expect(withoutItem([pageOf([a, b], 3), pageOf([c], 3)], "b")).toEqual([
      pageOf([a], 2),
      pageOf([c], 2),
    ]);
  });

  it("keeps other page fields", () => {
    const page = { ...pageOf([a], 1), extra: "kept" };
    expect(withoutItem([page], "a")[0]).toMatchObject({ extra: "kept", total: 0 });
  });

  it("leaves the pages alone when the row is not there", () => {
    expect(withoutItem([pageOf([a], 1)], "x")).toEqual([pageOf([a], 1)]);
  });

  it("finds the page and place of a row", () => {
    expect(positionOf([pageOf([a], 3), pageOf([b, c], 3)], "c")).toEqual({ page: 1, index: 1 });
    expect(positionOf([pageOf([a], 1)], "x")).toBeNull();
  });

  it("puts a row back at its old place and raises every total again", () => {
    const removed = withoutItem([pageOf([a, b], 3), pageOf([c], 3)], "b");
    expect(withItemAt(removed, b, { page: 0, index: 1 })).toEqual([
      pageOf([a, b], 3),
      pageOf([c], 3),
    ]);
  });

  it("puts a row back at the end when the rows before it left meanwhile", () => {
    expect(withItemAt([pageOf([], 0)], c, { page: 0, index: 2 })).toEqual([pageOf([c], 1)]);
  });

  it("puts a row back only once", () => {
    expect(withItemAt([pageOf([a, b], 2)], b, { page: 0, index: 0 })).toEqual([pageOf([a, b], 2)]);
  });

  it("puts a row back at the end of the last page when its page is gone", () => {
    expect(withItemAt([pageOf([a], 1)], c, { page: 3, index: 0 })).toEqual([pageOf([a, c], 2)]);
  });
});

describe("selection", () => {
  it("selects the job from the URL", () => {
    expect(selectedItem([a, b], "b")).toBe(b);
  });

  it("falls back to the first row for an unknown id", () => {
    expect(selectedItem([a, b], "gone")).toBe(a);
  });

  it("is null for an empty list", () => {
    expect(selectedItem([], null)).toBeNull();
  });

  it("hands the selection to the next row, else to the previous one", () => {
    expect(nextSelection([a, b, c], "b")).toBe("c");
    expect(nextSelection([a, b, c], "c")).toBe("b");
    expect(nextSelection([a], "a")).toBeNull();
    expect(nextSelection([a], "x")).toBeNull();
  });
});

describe("fitLine", () => {
  it("takes the first sentence of the summary without markdown", () => {
    const reasoning =
      "## Zusammenfassung\nDu passt gut: **Kotlin** ist dein Alltag. Das Team ist klein.\n\n## Stärken & Übereinstimmung\n- Kotlin";
    expect(fitLine(reasoning)).toBe("Du passt gut: Kotlin ist dein Alltag.");
  });

  it("falls back to the first strength", () => {
    expect(fitLine("## Stärken & Übereinstimmung\n- Kafka im Betrieb\n## Lücken\n- Go")).toBe(
      "Kafka im Betrieb",
    );
  });

  it("uses the first text line of markdown with unknown headings", () => {
    expect(fitLine("# Analyse\nSolide Passung für Backend")).toBe("Solide Passung für Backend");
  });

  it("shortens long text", () => {
    const line = fitLine("x".repeat(400));
    expect(line).toHaveLength(FIT_LINE_MAX);
    expect(line?.endsWith("…")).toBe(true);
  });

  it("keeps characters that only look like markdown", () => {
    expect(fitLine("Erfahrung mit **C#** und Node_js")).toBe("Erfahrung mit C# und Node_js");
    expect(fitLine("Von A -> B in einem Schritt")).toBe("Von A -> B in einem Schritt");
  });

  it("uses the text of a link", () => {
    expect(fitLine("Siehe [die Stelle](https://acme.de/jobs/1) für mehr")).toBe(
      "Siehe die Stelle für mehr",
    );
  });

  it("skips headings, rules, table rows and bold-only lines", () => {
    expect(
      fitLine("# Analyse\n---\n| a | b |\n|---|---|\n**Passung**\nEchter Text hier drin"),
    ).toBe("Echter Text hier drin");
  });

  it("strips list prefixes", () => {
    expect(fitLine("1. Erster Punkt ist lang genug")).toBe("Erster Punkt ist lang genug");
  });

  it("is null when only gaps are known", () => {
    expect(fitLine("## Lücken\n- Go fehlt\n- Rust fehlt")).toBeNull();
  });

  it("does not stop at an abbreviation", () => {
    expect(fitLine("z.B. Kotlin ist dein Alltag. Mehr dazu später.")).toBe(
      "z.B. Kotlin ist dein Alltag.",
    );
    expect(fitLine("Dr. Müller leitet das Team in Hamburg. Rest.")).toBe(
      "Dr. Müller leitet das Team in Hamburg.",
    );
  });

  it("does not split a surrogate pair when shortening", () => {
    const line = fitLine(`${"x".repeat(138)}😀${"y".repeat(50)}`);
    expect(line).toBe(`${"x".repeat(138)}😀…`);
  });

  it("is null without reasoning", () => {
    expect(fitLine(null)).toBeNull();
    expect(fitLine("   ")).toBeNull();
  });
});

describe("listPhase", () => {
  const status = { hasData: false, isError: false, failureCount: 0, itemCount: 0 };

  it("is loading, stalled while retrying, or error without data", () => {
    expect(listPhase(status)).toBe("loading");
    expect(listPhase({ ...status, failureCount: 1 })).toBe("stalled");
    expect(listPhase({ ...status, isError: true, failureCount: 3 })).toBe("error");
  });

  it("is empty or ready with data, also after a failed refetch", () => {
    expect(listPhase({ ...status, hasData: true })).toBe("empty");
    expect(listPhase({ ...status, hasData: true, isError: true, itemCount: 2 })).toBe("ready");
  });
});

describe("isListStalled", () => {
  const request = { hasData: false, isError: false, failureCount: 0 };

  it("is stalled only while a failed request without data is retried", () => {
    expect(isListStalled({ ...request, failureCount: 1 })).toBe(true);
    expect(isListStalled(request)).toBe(false);
    expect(isListStalled({ ...request, failureCount: 3, isError: true })).toBe(false);
    expect(isListStalled({ ...request, failureCount: 1, hasData: true })).toBe(false);
  });
});
