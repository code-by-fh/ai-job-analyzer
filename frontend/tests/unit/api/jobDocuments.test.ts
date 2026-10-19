import { describe, expect, it } from "vitest";
import {
  cancelGeneration,
  deleteJobDocument,
  documentVersion,
  downloadJobDocument,
  fetchDocumentHtml,
  fetchJobDocuments,
  generatedDocument,
  generateLetter,
  generatePackage,
  downloadDocumentPdf,
  saveDocumentHtml,
  uploadJobDocument,
  viewJobDocument,
  type JobDocument,
} from "@/api/jobDocuments";
import { stubRoutes } from "../support/stubRoutes";

const CV_PDF: JobDocument = {
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  file_size: 52_000,
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
  uploaded_at: "2026-10-07T10:00:00+00:00",
};

describe("job documents", () => {
  it("lists the documents of a job", async () => {
    stubRoutes({ "GET /jobs/job-1/documents": [CV_PDF] });
    await expect(fetchJobDocuments("job-1")).resolves.toEqual([CV_PDF]);
  });

  it("finds the generated PDF of a kind", () => {
    expect(generatedDocument([CV_PDF], "cv")).toBe(CV_PDF);
    expect(generatedDocument([CV_PDF], "cover_letter")).toBeUndefined();
  });

  it("uses the upload time as version, the id when it is missing", () => {
    expect(documentVersion(CV_PDF)).toBe("2026-10-07T10:00:00+00:00");
    expect(documentVersion({ ...CV_PDF, uploaded_at: null })).toBe("4");
  });
});

describe("file wrappers", () => {
  const pdf = () =>
    new Response("%PDF-1.4", {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Lebenslauf_ACME.pdf"',
      },
    });

  it("uploads one file as multipart form field 'file'", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/documents": { id: 10 } });
    const file = new File(["%PDF"], "referenz.pdf", { type: "application/pdf" });
    await uploadJobDocument("job-1", file);
    const form = calls[0].rawBody as FormData;
    expect(form.get("file")).toBe(file);
  });

  it("views a document inline and downloads it by id", async () => {
    const calls = stubRoutes({
      "GET /jobs/job-1/documents/4/view": pdf,
      "GET /jobs/job-1/documents/4/download": pdf,
    });
    await expect(viewJobDocument("job-1", 4)).resolves.toMatchObject({
      filename: "Lebenslauf_ACME.pdf",
    });
    await downloadJobDocument("job-1", 4);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/jobs/job-1/documents/4/view",
      "http://api.test/jobs/job-1/documents/4/download",
    ]);
  });

  it("deletes a document by id", async () => {
    const calls = stubRoutes({ "DELETE /jobs/job-1/documents/4": { status: "deleted" } });
    await deleteJobDocument("job-1", 4);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "DELETE http://api.test/jobs/job-1/documents/4",
    ]);
  });
});

describe("stored HTML", () => {
  it("reads the HTML of one kind", async () => {
    const calls = stubRoutes({ "GET /jobs/job-1/documents/html": { html: "<p>x</p>" } });
    await expect(fetchDocumentHtml("job-1", "cover_letter")).resolves.toBe("<p>x</p>");
    expect(calls[0].url).toBe("http://api.test/jobs/job-1/documents/html?kind=cover_letter");
  });

  it("saves the HTML with nothing else", async () => {
    const calls = stubRoutes({ "PUT /jobs/job-1/documents/html": { ok: true } });
    await saveDocumentHtml("job-1", "cv", "<p>neu</p>");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "PUT http://api.test/jobs/job-1/documents/html?kind=cv",
    ]);
    expect(calls[0].body).toBe('{"html":"<p>neu</p>"}');
  });

  it("downloads the PDF the server renders from the current HTML", async () => {
    const pdf = () =>
      new Response("%PDF-1.4", {
        headers: { "Content-Disposition": 'attachment; filename="Anschreiben_ACME.pdf"' },
      });
    const calls = stubRoutes({ "GET /jobs/job-1/documents/pdf": pdf });
    const file = await downloadDocumentPdf("job-1", "cover_letter");
    expect(calls[0].url).toBe("http://api.test/jobs/job-1/documents/pdf?kind=cover_letter");
    expect(file.filename).toBe("Anschreiben_ACME.pdf");
  });
});

describe("generation", () => {
  it("asks for the CV only with profile documents", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate-package": { status: "started" } });
    await generatePackage("job-1", { cv: true, letter: false, includeProfileDocuments: true });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      generate_cv: true,
      generate_letter: false,
      include_profile_documents: true,
    });
  });

  it("sends letter notes, null without notes", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate": { status: "started" } });
    await generateLetter("job-1", "kürzer");
    await generateLetter("job-1", "  ");
    expect(calls.map((call) => JSON.parse(call.body ?? ""))).toEqual([
      { improvement_notes: "kürzer" },
      { improvement_notes: null },
    ]);
  });

  it("cancels a running generation", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/cancel-generation": { status: "cancelled" } });
    await cancelGeneration("job-1");
    expect(calls).toHaveLength(1);
  });
});
