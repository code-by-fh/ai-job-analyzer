import { describe, expect, it } from "vitest";
import { fetchCompany, runDeepDive, startCompanyResearch } from "@/api/companies";
import { fetchProfileDocuments } from "@/api/profileDocuments";
import { jsonResponse } from "../support/fakeFetch";
import { stubRoutes } from "../support/stubRoutes";

const PROFILE = {
  id: 3,
  domain: "acme.de",
  name: "ACME GmbH",
  description: "",
  meta: { language: "de" },
  executive_summary: {
    assessment: "Solider Mittelständler.",
    confidence: "Moderate",
    suitable_for: ["Backend"],
    not_suitable_for: "Frontend-Fokus",
  },
  analysis: [{ area: "Kultur", assessment: "Offen", confidence: "Low" }],
  key_insights: null,
  risks: [{ title: "Fluktuation", probability: "Medium", impact: "High", description: "" }],
  market_comparison: null,
  deep_dive_buttons: [{ title: "Gehalt", focus: "Gehaltsband", how_to_proceed: "Portale" }],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T10:00:00+00:00",
};

describe("fetchCompany", () => {
  it("reads a profile and turns a single string into a list", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    const company = await fetchCompany("acme.de");
    expect(company?.executive_summary?.not_suitable_for).toEqual(["Frontend-Fokus"]);
    expect(company?.deep_dive_buttons[0]).toMatchObject({ title: "Gehalt", focus: "Gehaltsband" });
  });

  it("returns null when no research exists yet", async () => {
    stubRoutes({
      "GET /companies/acme.de": jsonResponse(404, { detail: "Company profile not found" }),
    });
    await expect(fetchCompany("acme.de")).resolves.toBeNull();
  });

  it("keeps the page alive when the AI wrote an odd shape", async () => {
    stubRoutes({ "GET /companies/acme.de": { ...PROFILE, analysis: "kaputt", risks: [42] } });
    const company = await fetchCompany("acme.de");
    expect(company?.analysis).toEqual([]);
    expect(company?.risks).toEqual([]);
  });

  it("rethrows other errors", async () => {
    stubRoutes({ "GET /companies/acme.de": jsonResponse(500, { detail: "boom" }) });
    await expect(fetchCompany("acme.de")).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
});

describe("research", () => {
  it("starts a refresh with force_refresh", async () => {
    const calls = stubRoutes({
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    await expect(startCompanyResearch("acme.de", true)).resolves.toBe("queued");
    expect(calls[0].body).toBe('{"force_refresh":true}');
  });

  it("runs a deep dive and returns its markdown", async () => {
    const calls = stubRoutes({ "POST /companies/acme.de/deep-dive": { result: "## Ergebnis" } });
    const result = await runDeepDive("acme.de", {
      focus: "Gehaltsband",
      howToProceed: "Portale",
      companyName: "ACME GmbH",
      title: "Backend",
      language: "de",
    });
    expect(result).toBe("## Ergebnis");
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      focus: "Gehaltsband",
      how_to_proceed: "Portale",
      company_name: "ACME GmbH",
      title: "Backend",
      language: "de",
    });
  });

  it("clips the deep dive texts to the server bounds by code points", async () => {
    const calls = stubRoutes({ "POST /companies/acme.de/deep-dive": { result: "ok" } });
    await runDeepDive("acme.de", {
      focus: "f".repeat(2500),
      howToProceed: "😀".repeat(2001),
      companyName: "n".repeat(201),
      title: "t".repeat(301),
      language: "en",
    });
    const sent = JSON.parse(calls[0].body ?? "");
    expect(sent.focus).toHaveLength(2000);
    expect(Array.from(sent.how_to_proceed)).toHaveLength(2000);
    expect(sent.company_name).toHaveLength(200);
    expect(sent.title).toHaveLength(300);
  });
});

describe("profile documents", () => {
  it("lists the user's certificates and references", async () => {
    stubRoutes({
      "GET /profile/documents": [
        {
          id: 1,
          doc_type: "CERTIFICATE",
          label: "AWS",
          original_filename: "aws.pdf",
          file_size: 1,
          mime_type: "application/pdf",
          created_at: null,
        },
      ],
    });
    await expect(fetchProfileDocuments()).resolves.toMatchObject([{ id: 1, label: "AWS" }]);
  });
});
