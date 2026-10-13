import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES } from "@/api/profilePaths";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=nachweise"));
afterEach(() => vi.unstubAllGlobals());

const PDF_DOC = {
  id: 1,
  doc_type: "REFERENCE",
  label: "Zeugnis Nordlicht.pdf",
  original_filename: "Zeugnis Nordlicht.pdf",
  file_size: 421_888,
  mime_type: "application/pdf",
  created_at: "2026-08-12T09:00:00Z",
  downloadable: true,
};
const DRIVE_DOC = {
  ...PDF_DOC,
  id: 2,
  label: "AWS.png",
  original_filename: "AWS.png",
  mime_type: "image/png",
  downloadable: false,
};
const WORD_DOC = {
  ...PDF_DOC,
  id: 3,
  label: "Referenz.docx",
  original_filename: "Referenz.docx",
  mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const PROOF_UNSUPPORTED =
  "Dieser Dateityp wird nicht unterstützt. Erlaubt sind PDF, Word, JPEG, PNG und WebP.";
// Neutral: the server sends one flag for Drive files and for rows without stored bytes (M2).
const NOT_OPENABLE = "Diese Datei lässt sich hier nicht öffnen.";
const GENERIC_UNSUPPORTED = "bild.png: Dieser Dateityp wird nicht unterstützt.";

/** A response the test releases later, to watch the pending state. */
function held(response: () => Response) {
  let release = () => {};
  const answer = new Promise<Response>((resolve) => {
    release = () => resolve(response());
  });
  return { answer: () => answer, release: () => release() };
}

const pngFile = () => new File(["x"], "bild.png", { type: "image/png" });

describe("Nachweise", () => {
  it("lists each document with type, size and date", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [PDF_DOC] }));
    renderWithProviders(<ProfilePage />);
    const row = (await screen.findByText("Zeugnis Nordlicht.pdf")).closest("li")!;
    expect(row).toHaveTextContent("Referenz · 412 KB · 12.08.2026");
  });

  it("a Drive document has no view or download, and says why", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [DRIVE_DOC] }));
    renderWithProviders(<ProfilePage />);
    const download = await screen.findByRole("button", { name: "AWS.png herunterladen" });
    expect(download).toHaveAttribute("aria-disabled", "true");
    expect(download).toHaveAttribute("title", NOT_OPENABLE);
    expect(screen.getByRole("button", { name: "AWS.png ansehen" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // The reason is visible on the row too: a title never shows on a touch screen.
    const row = screen.getByText("AWS.png").closest("li")!;
    expect(row).toHaveTextContent(NOT_OPENABLE);
  });

  it("offers no viewer for Word files", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [WORD_DOC] }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Referenz.docx");
    expect(screen.queryByRole("button", { name: "Referenz.docx ansehen" })).toBeNull();
  });

  it("views a PDF in the job page's viewer, fetched from the view endpoint", async () => {
    const calls = stubRoutes(
      profileStubs({
        "GET /profile/documents": [PDF_DOC],
        "GET /profile/documents/1/view": () =>
          new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf ansehen" }),
    );
    expect(screen.getByRole("dialog", { name: "Zeugnis Nordlicht.pdf" })).toBeVisible();
    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/profile/documents/1/view"))).toBe(true),
    );
  });

  it("revokes the viewer's object URL when the viewer closes", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:proof-1"), revokeObjectURL: vi.fn() });
    stubRoutes(
      profileStubs({
        "GET /profile/documents": [PDF_DOC],
        "GET /profile/documents/1/view": () =>
          new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf ansehen" }),
    );
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:proof-1");
  });

  it("uploads with the chosen type and refuses a wrong file before sending", async () => {
    const calls = stubRoutes(profileStubs({ "POST /profile/documents": { id: 4 } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Referenz" }));
    const input = screen.getByLabelText("Dokument hochladen");
    await userEvent.upload(
      input,
      [
        new File(["%PDF-"], "a.pdf", { type: "application/pdf" }),
        new File(["x"], "b.txt", { type: "text/plain" }),
      ],
      { applyAccept: false },
    );
    expect(await screen.findByText("b.txt: Dieser Dateityp wird nicht unterstützt.")).toBeVisible();
    expect(await screen.findByText("a.pdf hochgeladen.")).toBeVisible();
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect((posts[0]!.rawBody as FormData).get("doc_type")).toBe("REFERENCE");
  });

  it("asks before deleting and moves focus to the heading", async () => {
    let stored = [PDF_DOC];
    stubRoutes(
      profileStubs({
        "GET /profile/documents": () => jsonResponse(200, stored),
        "DELETE /profile/documents/1": () => {
          stored = [];
          return jsonResponse(200, { status: "deleted" });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Datei löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Zeugnis Nordlicht.pdf gelöscht.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Nachweise" })).toHaveFocus(),
    );
  });

  it("a document already deleted elsewhere (404) ends like a delete", async () => {
    let stored = [PDF_DOC];
    stubRoutes(
      profileStubs({
        "GET /profile/documents": () => jsonResponse(200, stored),
        "DELETE /profile/documents/1": () => {
          stored = [];
          return jsonResponse(404, { detail: "Document not found" });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Datei löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Zeugnis Nordlicht.pdf gelöscht.")).toBeVisible();
    expect(screen.queryByText("Das wurde nicht gefunden.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Nachweise" })).toHaveFocus(),
    );
  });

  it("a second confirm while the delete runs sends no second request", async () => {
    const deletion = held(() => jsonResponse(200, { status: "deleted" }));
    const calls = stubRoutes(
      profileStubs({
        "GET /profile/documents": [PDF_DOC],
        "DELETE /profile/documents/1": deletion.answer,
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" }),
    );
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    deletion.release();
    expect(await screen.findByText("Zeugnis Nordlicht.pdf gelöscht.")).toBeVisible();
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  });

  it("the upload control is busy while an upload runs", async () => {
    const upload = held(() => jsonResponse(200, { id: 4 }));
    stubRoutes(profileStubs({ "POST /profile/documents": upload.answer }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), pngFile());
    const label = screen.getByText("Dokument hochladen").closest("label")!;
    await waitFor(() => expect(label).toHaveAttribute("aria-busy", "true"));
    upload.release();
    expect(await screen.findByText("bild.png hochgeladen.")).toBeVisible();
    await waitFor(() => expect(label).not.toHaveAttribute("aria-busy"));
  });

  it("refuses a file over the profile documents' limit before sending", async () => {
    const calls = stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    const big = pngFile();
    Object.defineProperty(big, "size", { value: MAX_FILE_BYTES + 1 });
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), big);
    expect(await screen.findByText("bild.png ist größer als 10 MB.")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("shows the empty state", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText("Noch keine Nachweise")).toBeVisible();
  });

  it("maps the server's type refusal to the proofs sentence, without text files", async () => {
    stubRoutes(
      profileStubs({
        "POST /profile/documents": () => jsonResponse(415, { detail: "unsupported_type" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), pngFile());
    expect(await screen.findByText(`bild.png: ${PROOF_UNSUPPORTED}`)).toBeVisible();
    expect(screen.queryByText(GENERIC_UNSUPPORTED)).toBeNull();
    expect(screen.queryByText(/unsupported_type/)).toBeNull();
  });

  it("maps the server's size refusal to a fixed sentence", async () => {
    stubRoutes(
      profileStubs({
        "POST /profile/documents": () => jsonResponse(413, { detail: "file_too_large" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), pngFile());
    expect(await screen.findByText("bild.png: Die Datei ist größer als 10 MB.")).toBeVisible();
  });

  it("maps a refused document type to a fixed sentence, never the server's words", async () => {
    const detail = [{ loc: ["body", "doc_type"], msg: "invalid_doc_type" }];
    stubRoutes(profileStubs({ "POST /profile/documents": () => jsonResponse(422, { detail }) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), pngFile());
    expect(
      await screen.findByText(
        "bild.png: Diese Art von Nachweis ist unbekannt. Wähle Zertifikat oder Referenz.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/invalid_doc_type/)).toBeNull();
  });

  it("an unknown code with a known status gets the generic sentence, not the server text", async () => {
    stubRoutes(
      profileStubs({
        "POST /profile/documents": () => jsonResponse(415, { detail: "Some <b>server</b> text" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), pngFile());
    expect(await screen.findByText(GENERIC_UNSUPPORTED)).toBeVisible();
    expect(screen.queryByText(/server/)).toBeNull();
  });
});
