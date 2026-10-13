import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilesSection } from "@/features/job/documents/FilesSection";
import type { RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const UPLOAD = {
  id: 9,
  original_filename: "zeugnis.png",
  file_size: 52_000,
  mime_type: "image/png",
  kind: "UPLOADED",
  uploaded_at: "2026-10-07T10:00:00Z",
};
const CV = {
  ...UPLOAD,
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
};
const user = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

function show(): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [UPLOAD, CV],
    "POST /jobs/job-1/documents": { id: 10 },
    "DELETE /jobs/job-1/documents/9": { status: "deleted" },
    "GET /jobs/job-1/documents/9/view": () =>
      new Response("png", { headers: { "Content-Type": "image/png" } }),
  });
  renderWithProviders(<FilesSection job={buildJob()} />);
  return calls;
}

async function pick(file: File): Promise<void> {
  await user.upload(await screen.findByLabelText("Datei hochladen"), file);
}

describe("FilesSection", () => {
  it("lists every file with its kind and size", async () => {
    show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Hochgeladen");
    expect(row).toHaveTextContent("51 KB");
    expect(screen.getByText("Lebenslauf_ACME.pdf").closest("li")).toHaveTextContent(
      "Lebenslauf (erstellt)",
    );
  });

  it("uploads an allowed file", async () => {
    const calls = show();
    await pick(new File(["%PDF"], "referenz.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
  });

  it("rejects a file over 10 MB before uploading", async () => {
    const calls = show();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "gross.pdf", {
      type: "application/pdf",
    });
    await pick(big);
    expect(screen.getByText("gross.pdf ist größer als 10 MB.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("rejects an unsupported type before uploading", async () => {
    const calls = show();
    await pick(new File(["x"], "a.zip", { type: "application/zip" }));
    expect(screen.getByText(/a.zip: Dieser Dateityp wird nicht unterstützt/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("explains a server refusal of the size", async () => {
    stubRoutes({
      "GET /jobs/job-1/documents": [],
      "POST /jobs/job-1/documents": () => new Response("{}", { status: 413 }),
    });
    renderWithProviders(<FilesSection job={buildJob()} />);
    await pick(new File(["%PDF"], "referenz.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Die Datei ist größer als 10 MB.")).toBeInTheDocument();
  });

  it("explains a server refusal of the type", async () => {
    stubRoutes({
      "GET /jobs/job-1/documents": [],
      "POST /jobs/job-1/documents": () => new Response("{}", { status: 415 }),
    });
    renderWithProviders(<FilesSection job={buildJob()} />);
    await pick(new File(["%PDF"], "referenz.pdf", { type: "application/pdf" }));
    expect(
      await screen.findByText(/Erlaubt sind PDF, Word, JPEG, PNG, WebP und Text/),
    ).toBeInTheDocument();
  });

  it("announces an upload problem in a region that was there before it", async () => {
    show();
    const upload = (await screen.findByLabelText("Datei hochladen")).closest(".upload");
    const live = upload?.querySelector('[role="alert"]');
    expect(live).toBeEmptyDOMElement();
    await pick(new File(["x"], "a.zip", { type: "application/zip" }));
    expect(live).toHaveTextContent(/a.zip: Dieser Dateityp wird nicht unterstützt/);
    expect(live?.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("deletes only after confirming", async () => {
    const calls = show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png löschen" }));
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    const dialog = screen.getByRole("dialog", { name: "Datei löschen?" });
    expect(dialog).toHaveTextContent("endgültig");
    await user.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
  });

  it("does not delete when the dialog is cancelled", async () => {
    const calls = show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png löschen" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("shows an image in the viewer", async () => {
    show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png ansehen" }));
    expect(await screen.findByRole("img", { name: "zeugnis.png" })).toHaveAttribute(
      "src",
      "blob:x",
    );
  });

  it("offers no viewer for Word files, only download", async () => {
    stubRoutes({
      "GET /jobs/job-1/documents": [
        { ...UPLOAD, id: 5, original_filename: "cv.docx", mime_type: "application/msword" },
      ],
    });
    renderWithProviders(<FilesSection job={buildJob()} />);
    await screen.findByText("cv.docx");
    expect(screen.queryByRole("button", { name: "cv.docx ansehen" })).toBeNull();
    expect(screen.getByRole("button", { name: "cv.docx herunterladen" })).toBeInTheDocument();
  });

  it("shows the Drive message when a stored file cannot be opened", async () => {
    stubRoutes({
      "GET /jobs/job-1/documents": [UPLOAD],
      "GET /jobs/job-1/documents/9/view": () => new Response("{}", { status: 400 }),
    });
    renderWithProviders(<FilesSection job={buildJob()} />);
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png ansehen" }));
    expect(await screen.findByText(/Google Drive/)).toBeInTheDocument();
  });
});
