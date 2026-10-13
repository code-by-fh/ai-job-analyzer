import { describe, expect, it } from "vitest";
import { MAX_DOMAIN_LENGTH, normalizeDomain } from "@/domain/companyDomain";

describe("normalizeDomain", () => {
  it.each([
    ["acme.de", "acme.de"],
    ["https://www.acme.de/karriere?x=1", "acme.de"],
    ["  ACME.DE ", "acme.de"],
    ["jobs.acme.co.uk", "jobs.acme.co.uk"],
    ["müller.de", "xn--mller-kva.de"],
    ["xn--mller-kva.de", "xn--mller-kva.de"],
    ["example.xn--p1ai", "example.xn--p1ai"],
  ])("%s -> %s", (input, domain) => {
    expect(normalizeDomain(input)).toBe(domain);
  });

  it.each([
    "",
    "acme",
    "acme gmbh",
    "http://",
    "javascript:alert(1)",
    "acme.de:8080",
    "user@acme.de",
    "127.0.0.1",
    "-acme.de",
    "acme..de",
    "acme.de.",
  ])("rejects %s", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });

  it("rejects a host name longer than the limit", () => {
    const tooLong = `${"a".repeat(MAX_DOMAIN_LENGTH)}.de`;
    expect(normalizeDomain(tooLong)).toBeNull();
  });
});
