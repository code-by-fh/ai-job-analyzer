import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CV, importCv, profileQueryOptions, saveProfile } from "@/api/profile";
import {
  deleteProfileDocument,
  fetchProfileDocuments,
  uploadProfileDocument,
} from "@/api/profileDocuments";
import { templatePreviewPath } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import {
  deleteTemplate,
  documentTemplatesQueryOptions,
  selectDefaultTemplate,
  templatePreviewQueryOptions,
  uploadTemplate,
} from "@/api/templates";
import { createTestQueryClient } from "../support/render";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const STORED = {
  id: 3,
  user_id: 1,
  role: "Lead",
  skills: "Kotlin",
  min_salary: null,
  location: "Hamburg",
  preferences: null,
  spoken_languages: null,
  cv_data: {},
  cv_template: "7",
  cover_letter_template: null,
  pushover_api_token: "__masked__",
  smtp_password: "__masked__",
  smtp_host: "smtp.example.com",
};

describe("profile api", () => {
  it("the profile schema drops secrets and notification fields and fills legacy gaps", async () => {
    stubRoutes({ "GET /settings": STORED });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile).toEqual({
      role: "Lead",
      skills: "Kotlin",
      min_salary: "",
      location: "Hamburg",
      preferences: "",
      spoken_languages: [],
      cv_data: { experience: [], projects: [], education: "" },
      cv_template: "7",
      cover_letter_template: null,
      // A server without the run state reads as no import running.
      cv_import_running: false,
    });
    expect(profileQueryOptions().queryKey).toEqual(queryKeys.profile);
  });

  it("fills missing entry fields of legacy CV data", async () => {
    stubRoutes({
      "GET /settings": {
        ...STORED,
        cv_data: { experience: [{ company: "Acme" }], education: null },
      },
    });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile.cv_data.experience).toEqual([
      { company: "Acme", role: "", duration: "", description: "" },
    ]);
  });

  it("keeps a year the old import stored as a number", async () => {
    stubRoutes({ "GET /settings": { ...STORED, cv_data: { experience: [{ duration: 2020 }] } } });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile.cv_data.experience[0]!.duration).toBe("2020");
  });

  it("reads odd shapes in the free JSON columns as empty instead of failing", async () => {
    stubRoutes({
      "GET /settings": { ...STORED, cv_data: "garbage", spoken_languages: { de: true } },
    });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect([profile.cv_data, profile.spoken_languages]).toEqual([
      { experience: [], projects: [], education: "" },
      [],
    ]);
  });

  it("joins a list the old import stored as text", async () => {
    stubRoutes({
      "GET /settings": { ...STORED, cv_data: { projects: [{ tech_stack: ["Kotlin", "Spring"] }] } },
    });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile.cv_data.projects[0]!.tech_stack).toBe("Kotlin, Spring");
  });

  it("drops one odd entry without emptying its list", async () => {
    const experience = [{ company: "Acme" }, "garbage", { company: "Beta" }];
    stubRoutes({ "GET /settings": { ...STORED, cv_data: { experience } } });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile.cv_data.experience.map((entry) => entry.company)).toEqual(["Acme", "Beta"]);
  });

  it("gives every profile without CV data its own empty CV", async () => {
    stubRoutes({ "GET /settings": { ...STORED, cv_data: null } });
    const first = await createTestQueryClient().fetchQuery(profileQueryOptions());
    const second = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(first.cv_data).not.toBe(second.cv_data);
    expect(first.cv_data.experience).not.toBe(EMPTY_CV.experience);
    expect(first.cv_data).toEqual(EMPTY_CV);
  });

  it("saves exactly the patch it is given", async () => {
    const calls = stubRoutes({ "POST /settings": { status: "saved" } });
    await saveProfile({ role: "Lead" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ role: "Lead" });
  });

  it("sends the CV as multipart under 'file'", async () => {
    const calls = stubRoutes({ "POST /settings/upload-cv": { status: "success", data: {} } });
    await importCv(new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    expect((calls[0]!.rawBody as FormData).get("file")).toBeInstanceOf(File);
  });

  it("reads the stored values from the import's answer, only the keys it sends", async () => {
    const stored = {
      role: "Backend",
      skills: "Kotlin",
      cv_data: { experience: [{ company: "Acme", role: null }], education: "BSc" },
    };
    stubRoutes({ "POST /settings/upload-cv": { status: "success", data: stored } });
    const imported = await importCv(new File(["%PDF-1.4"], "cv.pdf"));
    expect(imported).toEqual({
      role: "Backend",
      skills: "Kotlin",
      cv_data: {
        experience: [{ company: "Acme", role: "", duration: "", description: "" }],
        projects: [],
        education: "BSc",
      },
    });
  });
});

describe("templates api", () => {
  it("lists under the templates prefix that realtime invalidates", () => {
    expect(documentTemplatesQueryOptions().queryKey.slice(0, 1)).toEqual(queryKeys.templates);
  });

  it("selects a default per kind", async () => {
    const calls = stubRoutes({ "PATCH /settings/template": { status: "saved" } });
    await selectDefaultTemplate({ docType: "COVER_LETTER", ref: "classic" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ cover_letter_template: "classic" });
  });

  it("uploads JSON and deletes by id", async () => {
    const created = {
      id: 9,
      doc_type: "CV",
      name: "Mine",
      is_admin: false,
      user_id: 1,
      status: "processing",
    };
    const calls = stubRoutes({
      "POST /document-templates": created,
      "DELETE /document-templates/9": { ok: true },
    });
    expect(await uploadTemplate({ docType: "CV", name: "Mine", html: "<p/>" })).toMatchObject({
      id: 9,
      status: "processing",
    });
    await deleteTemplate(9);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ doc_type: "CV", name: "Mine", html: "<p/>" });
  });

  it("unwraps the preview HTML", async () => {
    const calls = stubRoutes({ "GET /document-templates/preview": { html: "<h1>Lea</h1>" } });
    const query = templatePreviewQueryOptions("CV", "classic");
    expect(await createTestQueryClient().fetchQuery(query)).toBe("<h1>Lea</h1>");
    expect(calls[0]!.url).toContain(templatePreviewPath("CV", "classic"));
  });

  it("encodes the preview query", () => {
    expect(templatePreviewPath("CV", "7")).toBe(
      "/document-templates/preview?doc_type=CV&template=7",
    );
  });
});

describe("profile documents api", () => {
  it("reads downloadable and treats an older answer without it as downloadable", async () => {
    stubRoutes({
      "GET /profile/documents": [
        {
          id: 1,
          doc_type: "CERTIFICATE",
          label: null,
          original_filename: "a.pdf",
          downloadable: false,
        },
        { id: 2, doc_type: "REFERENCE", label: "Ref", original_filename: "b.pdf" },
      ],
    });
    const [unstored, older] = await fetchProfileDocuments();
    expect([unstored!.downloadable, older!.downloadable]).toEqual([false, true]);
  });

  it("uploads with the type and deletes by id", async () => {
    const calls = stubRoutes({
      "POST /profile/documents": { id: 3 },
      "DELETE /profile/documents/3": { status: "deleted" },
    });
    const file = new File(["%PDF-"], "z.pdf", { type: "application/pdf" });
    await uploadProfileDocument({ file, docType: "REFERENCE" });
    await deleteProfileDocument(3);
    const sent = calls[0]!.rawBody as FormData;
    expect([sent.get("doc_type"), (sent.get("file") as File).name]).toEqual(["REFERENCE", "z.pdf"]);
    expect(calls[1]!.method).toBe("DELETE");
  });
});
