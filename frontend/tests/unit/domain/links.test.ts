import { describe, expect, it } from "vitest";
import { hostOf, isHttpUrl, resourceLinks, safeHref } from "@/domain/links";
import { monogramOf } from "@/domain/monogram";

describe("resourceLinks", () => {
  it("collects http links from strings, lists and objects without duplicates", () => {
    expect(
      resourceLinks({
        careers: "https://acme.de/karriere",
        reviews: ["https://kununu.com/acme", "https://acme.de/karriere"],
        note: "siehe http://blog.acme.de und ftp://x",
      }),
    ).toEqual(["https://acme.de/karriere", "https://kununu.com/acme", "http://blog.acme.de"]);
  });

  it("drops trailing punctuation but keeps balanced parentheses", () => {
    expect(
      resourceLinks("(siehe https://a.de/x). Und https://de.wikipedia.org/wiki/Foo_(bar)!"),
    ).toEqual(["https://a.de/x", "https://de.wikipedia.org/wiki/Foo_(bar)"]);
  });

  it("trims a hostile run of closing parentheses in linear time", () => {
    const run = ")".repeat(50_000);
    const started = performance.now();
    const links = resourceLinks(`https://a.de/x${run}`);
    const elapsed = performance.now() - started;
    expect(links).toEqual(["https://a.de/x"]);
    expect(elapsed).toBeLessThan(50);
  });

  it("keeps a closing parenthesis that the URL opened itself", () => {
    expect(resourceLinks("https://a.de/(a)(b))).")).toEqual(["https://a.de/(a)(b)"]);
  });

  it("is empty for anything else", () => {
    expect(resourceLinks(42)).toEqual([]);
    expect(resourceLinks(null)).toEqual([]);
  });
});

describe("isHttpUrl", () => {
  it.each(["https://a.de", "HTTPS://a.de", "http://a.de"])("accepts %j", (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each([
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "//evil.example",
    " https://a.de",
    "\thttps://a.de",
    "\u0001https://a.de",
    "ht\ntps://a.de",
  ])("rejects %j", (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});

describe("safeHref", () => {
  it("keeps an http(s) URL", () => {
    expect(safeHref("https://acme.de/jobs/1")).toBe("https://acme.de/jobs/1");
  });

  it.each(["data:text/html,<script>alert(1)</script>", "ftp://acme.de/x", "javascript:alert(1)"])(
    "refuses %s",
    (url) => {
      expect(safeHref(url)).toBeNull();
    },
  );

  it("refuses a missing or broken URL", () => {
    expect(safeHref(null)).toBeNull();
    expect(safeHref("https://")).toBeNull();
  });
});

describe("hostOf", () => {
  it("returns the host without www", () => {
    expect(hostOf("https://www.stepstone.de/stellen/1")).toBe("stepstone.de");
  });

  it("is null for a missing or broken URL", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("keine url")).toBeNull();
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf("mailto:a@b.de")).toBeNull();
  });
});

describe("monogramOf", () => {
  it.each([
    ["ACME GmbH", "AC"],
    ["Deutsche Bahn AG", "DB"],
    ["n26", "N2"],
    ["😀Start Up", "😀U"],
    ["🚀rocket", "🚀R"],
    ["  ", "?"],
    [null, "?"],
  ])("%s -> %s", (name, initials) => {
    expect(monogramOf(name)).toBe(initials);
  });
});
