import { describe, expect, it } from "vitest";
import {
  companiesHref,
  companiesLocationOf,
  filterCompanies,
  researchStateOf,
} from "@/domain/companies";

const ACME = {
  domain: "acme.de",
  name: "ACME",
  has_profile: true,
  analyzed_at: "2026-10-01T10:00:00Z",
  job_count: 2,
};
const GLOBEX = {
  domain: "globex.com",
  name: "Globex",
  has_profile: false,
  analyzed_at: null,
  job_count: 1,
};

describe("companies URL", () => {
  it("keeps the phase 2 detail contract and drops an invalid domain", () => {
    expect(companiesHref({ domain: "acme.de", q: "", all: false })).toBe(
      "/companies?domain=acme.de",
    );
    expect(companiesLocationOf(new URLSearchParams("domain=http://evil"))).toEqual({
      domain: null,
      q: "",
      all: false,
    });
    expect(companiesLocationOf(new URLSearchParams("q=ac&alle=1"))).toEqual({
      domain: null,
      q: "ac",
      all: true,
    });
  });

  it("drops a domain that is not already in its normal form", () => {
    expect(companiesLocationOf(new URLSearchParams("domain=www.acme.de")).domain).toBeNull();
    expect(companiesLocationOf(new URLSearchParams("domain=acme.de")).domain).toBe("acme.de");
  });

  it("writes the list filters, also beside a domain so the way back keeps them", () => {
    expect(companiesHref({ domain: null, q: "a&b", all: true })).toBe("/companies?q=a%26b&alle=1");
    expect(companiesHref({ domain: null, q: "", all: false })).toBe("/companies");
    expect(companiesHref({ domain: "acme.de", q: "ac", all: true })).toBe(
      "/companies?domain=acme.de&q=ac&alle=1",
    );
    expect(companiesLocationOf(new URLSearchParams("domain=acme.de&q=ac&alle=1"))).toEqual({
      domain: "acme.de",
      q: "ac",
      all: true,
    });
  });
});

describe("filterCompanies", () => {
  it("matches name or domain, case-insensitively, literally", () => {
    expect(filterCompanies([ACME, GLOBEX], "GLOB")).toEqual([GLOBEX]);
    expect(filterCompanies([ACME, GLOBEX], ".de")).toEqual([ACME]);
    expect(filterCompanies([ACME, GLOBEX], "%")).toEqual([]);
  });

  it("keeps every company for an empty or blank filter", () => {
    expect(filterCompanies([ACME, GLOBEX], "  ")).toEqual([ACME, GLOBEX]);
  });
});

describe("researchStateOf", () => {
  it("prefers a running research over the stored state", () => {
    expect(researchStateOf(ACME, "running")).toBe("running");
    expect(researchStateOf(GLOBEX, "stalled")).toBe("running");
    expect(researchStateOf(ACME, "idle")).toBe("done");
    expect(researchStateOf(GLOBEX, "idle")).toBe("none");
    expect(researchStateOf(GLOBEX, "failed")).toBe("none");
  });
});
