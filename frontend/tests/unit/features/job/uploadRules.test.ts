import { describe, expect, it } from "vitest";
import {
  ACCEPTED_UPLOAD_TYPES,
  formatFileSize,
  MAX_UPLOAD_BYTES,
  previewKind,
  uploadProblem,
  viewKind,
} from "@/features/job/documents/uploadRules";

describe("uploadProblem", () => {
  it("accepts a PDF up to 10 MB", () => {
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES, type: "application/pdf" })).toBeNull();
  });

  it("rejects a file over 10 MB", () => {
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toBe("tooLarge");
  });

  it("rejects a type the server refuses", () => {
    expect(uploadProblem({ size: 1, type: "application/zip" })).toBe("unsupportedType");
    expect(uploadProblem({ size: 1, type: "" })).toBe("unsupportedType");
  });
});

// Literal copy of server/routers/jobs.py ALLOWED_MIME_TYPES: a change on either side fails here.
const SERVER_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];

describe("ACCEPTED_UPLOAD_TYPES", () => {
  it("equals the server's allow-list", () => {
    expect([...ACCEPTED_UPLOAD_TYPES].sort()).toEqual([...SERVER_ALLOWED_MIME_TYPES].sort());
  });
});

describe("formatFileSize", () => {
  it.each([
    [900, "900 B"],
    [52_000, "51 KB"],
    [3_500_000, "3,3 MB"],
  ])("%i bytes read %s", (bytes, text) => {
    expect(formatFileSize(bytes, "de")).toBe(text);
  });
});

describe("previewKind", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["image/png", "image"],
    ["text/plain", null],
    [null, null],
  ])("%s -> %s", (mime, kind) => {
    expect(previewKind(mime)).toBe(kind);
  });
});

describe("viewKind", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["image/webp", "image"],
    ["text/plain", "text"],
    ["application/msword", null],
    [undefined, null],
  ])("%s -> %s", (mime, kind) => {
    expect(viewKind(mime)).toBe(kind);
  });
});
