import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFile, uploadForm } from "@/api/files";
import { API_BASE_URL } from "@/config";
import { createFakeFetch, jsonResponse } from "../support/fakeFetch";

const PDF_BYTES = "%PDF-1.4";

function stubFetch(response: () => Response) {
  const fake = createFakeFetch(response);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchFile", () => {
  it("returns the bytes and the filename of a download", async () => {
    stubFetch(
      () =>
        new Response(PDF_BYTES, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="Lebenslauf_ACME.pdf"',
          },
        }),
    );
    const file = await fetchFile("/jobs/j1/documents/4/download");
    expect(await file.blob.text()).toBe(PDF_BYTES);
    expect(file.filename).toBe("Lebenslauf_ACME.pdf");
  });

  it("rejects a missing file with NOT_FOUND", async () => {
    stubFetch(() => jsonResponse(404, { detail: "Document not found" }));
    await expect(fetchFile("/jobs/j1/documents/9/view")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("uploadForm", () => {
  it("posts the form unchanged and without a JSON content type", async () => {
    const calls = stubFetch(() => jsonResponse(200, { id: 1 }));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "text/plain" }), "a.txt");
    await uploadForm("/jobs/j1/documents", form);
    expect(calls[0]).toMatchObject({ url: `${API_BASE_URL}/jobs/j1/documents`, method: "POST" });
    expect(calls[0].rawBody).toBe(form);
    expect(calls[0].headers.get("Content-Type")).toBeNull();
  });

  it("rejects a refused upload with the normalised error code", async () => {
    stubFetch(() => jsonResponse(422, { detail: "bad file" }));
    await expect(uploadForm("/jobs/j1/documents", new FormData())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
