import { StrictMode } from "react";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import { useObjectUrl } from "@/features/job/documents/useDocumentFile";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CV = {
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  file_size: 9,
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
  uploaded_at: "2026-10-07T10:00:00Z",
};
const LETTER = {
  ...CV,
  id: 5,
  original_filename: "Anschreiben_ACME.pdf",
  kind: "GENERATED_LETTER",
};
const READY = buildJob({
  status: "DRAFTED",
  cv_html_present: true,
  cover_letter_html_present: true,
});
// A job generated before CV and letter became HTML-only: just the stored PDFs.
const PDF_ONLY = buildJob({ status: "DRAFTED" });
const CV_HTML = "<html><body><p>Erfahrung</p></body></html>";
const HOSTILE_HTML =
  "<html><head><script>window.pwned=1</script></head><body><p>Erfahrung</p>" +
  '<img src="x" onerror="window.pwned=1"><a href="https://evil.example">Link</a></body></html>';
const pdf = () => new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });
let urlCount = 0;

beforeEach(() => {
  urlCount = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:http://localhost/${(urlCount += 1)}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // One test pretends a browser with an inline PDF viewer.
  Reflect.deleteProperty(navigator, "pdfViewerEnabled");
});

function show(routes: Record<string, unknown> = {}, job = READY) {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [CV, LETTER],
    "GET /profile/documents": [],
    "GET /jobs/job-1/documents/html": { html: CV_HTML },
    "GET /jobs/job-1/documents/4/view": pdf,
    "GET /jobs/job-1/documents/5/view": pdf,
    "GET /jobs/job-1/documents/4/download": pdf,
    "GET /jobs/job-1/documents/pdf": pdf,
    ...routes,
  });
  const view = renderWithProviders(<DocumentsTab job={job} />);
  return { calls, ...view };
}

async function openPreview(index = 0) {
  const buttons = await screen.findAllByRole("button", { name: "Vorschau" });
  await userEvent.click(buttons[index]);
}

const dataOf = () => document.querySelector("object")?.getAttribute("data");
const called = (calls: { url: string }[], suffix: string) =>
  calls.some((call) => call.url.endsWith(suffix));

async function clickDownload() {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const [download] = await screen.findAllByRole("button", { name: "PDF herunterladen" });
  await userEvent.click(download);
}

describe("DocumentPreview of an HTML document", () => {
  it("shows no preview until a document's preview button is clicked", async () => {
    const { calls } = show();
    await screen.findAllByRole("button", { name: "Vorschau" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(calls.some((call) => call.url.includes("/documents/html"))).toBe(false);
  });

  it("shows the stored HTML read-only in an empty sandbox, never a PDF", async () => {
    const { calls } = show();
    await openPreview();
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf" });
    const frame = await within(dialog).findByTitle("Lebenslauf");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame.getAttribute("srcdoc")).toContain("<p>Erfahrung</p>");
    expect(dialog.querySelector(".proof-slug")).toHaveTextContent("Bearbeitbares Dokument");
    expect(dialog.querySelector("object")).toBeNull();
    expect(called(calls, "/documents/4/view")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the job's company in the toolbar and offers edit and download there", async () => {
    show();
    await openPreview();
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf" });
    const bar = dialog.querySelector<HTMLElement>(".viewer-bar")!;
    expect(bar).toHaveTextContent("ACME GmbH");
    expect(within(bar).getByRole("button", { name: "Bearbeiten" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
  });

  it("switches the sheet to the editor from the toolbar, with save and discard there", async () => {
    show();
    await openPreview();
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf" });
    const bar = dialog.querySelector<HTMLElement>(".viewer-bar")!;
    await userEvent.click(within(bar).getByRole("button", { name: "Bearbeiten" }));
    expect(await within(dialog).findByTitle("Lebenslauf bearbeiten")).toHaveAttribute(
      "sandbox",
      "allow-same-origin",
    );
    expect(within(bar).getByRole("button", { name: "Änderungen speichern" })).toBeInTheDocument();
    expect(bar).toHaveTextContent("Klicke in den Text, um ihn direkt zu ändern.");
    expect(within(bar).queryByRole("button", { name: "PDF herunterladen" })).toBeNull();
    await userEvent.click(within(bar).getByRole("button", { name: "Verwerfen" }));
    expect(await within(dialog).findByTitle("Lebenslauf")).toHaveAttribute("sandbox", "");
  });

  it("strips scripts, handlers and link targets from hostile stored HTML", async () => {
    show({ "GET /jobs/job-1/documents/html": { html: HOSTILE_HTML } });
    await openPreview();
    const frame = await screen.findByTitle("Lebenslauf");
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("<p>Erfahrung</p>");
    expect(srcdoc).not.toMatch(/<script|onerror|evil\.example/i);
  });

  it("opens the letter's own HTML", async () => {
    const { calls } = show();
    await openPreview(1);
    expect(await screen.findByRole("dialog", { name: "Anschreiben" })).toBeInTheDocument();
    await waitFor(() => expect(called(calls, "/documents/html?kind=cover_letter")).toBe(true));
    expect(called(calls, "/documents/html?kind=cv")).toBe(false);
  });

  it("downloads the PDF the server renders from the current HTML", async () => {
    const { calls } = show();
    await clickDownload();
    await waitFor(() => expect(called(calls, "/documents/pdf?kind=cv")).toBe(true));
    expect(called(calls, "/documents/4/download")).toBe(false);
  });

  it("asks to retry when every server render slot is busy", async () => {
    show({ "GET /jobs/job-1/documents/pdf": jsonResponse(503, { detail: "pdf_render_busy" }) });
    await clickDownload();
    expect(
      await screen.findByText(
        "Gerade werden zu viele PDFs erstellt. Bitte gleich noch einmal versuchen.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a PDF the server could not render", async () => {
    show({ "GET /jobs/job-1/documents/pdf": jsonResponse(422, { detail: "pdf_render_failed" }) });
    await clickDownload();
    expect(
      await screen.findByText(
        "Das PDF ließ sich nicht erzeugen. Das Dokument ist vermutlich zu groß.",
      ),
    ).toBeInTheDocument();
  });
});

describe("DocumentPreview of a job that has only its stored PDF", () => {
  it("shows the stored PDF from a blob URL with its proof date, and offers no editing", async () => {
    show({}, PDF_ONLY);
    await openPreview();
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf" });
    await waitFor(() => expect(dataOf()).toMatch(/^blob:/));
    expect(dialog.querySelector(".proof-slug")).toHaveTextContent(/Probedruck vom/);
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();
  });

  it("offers no second, full-screen preview: the modal itself is large", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: true, configurable: true });
    show({}, PDF_ONLY);
    await openPreview();
    await waitFor(() => expect(dataOf()).toMatch(/^blob:/));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Vorschau groß öffnen" })).toBeNull();
  });

  it("shows the generic error, never server text, when the file cannot be shown", async () => {
    show(
      { "GET /jobs/job-1/documents/4/view": jsonResponse(400, { detail: "Invalid file path" }) },
      PDF_ONLY,
    );
    await openPreview();
    expect(
      await screen.findByText("Etwas ist schiefgelaufen. Bitte versuche es erneut."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Invalid file path/)).toBeNull();
  });

  it("fetches the PDF again when a new version of the document arrives", async () => {
    const { calls, queryClient } = show({}, PDF_ONLY);
    const viewCalls = () => calls.filter((call) => call.url.endsWith("/documents/4/view")).length;
    await openPreview();
    await waitFor(() => expect(viewCalls()).toBe(1));
    queryClient.setQueryData(queryKeys.jobDocuments("job-1"), [
      { ...CV, uploaded_at: "2026-10-08T09:00:00Z" },
      LETTER,
    ]);
    await waitFor(() => expect(viewCalls()).toBe(2));
  });

  it("pins the blob type to PDF when the server sends octet-stream", async () => {
    const octet = () =>
      new Response("%PDF-1.4", { headers: { "Content-Type": "application/octet-stream" } });
    show({ "GET /jobs/job-1/documents/4/view": octet }, PDF_ONLY);
    await openPreview();
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });

  it("downloads the stored PDF", async () => {
    const { calls } = show({}, PDF_ONLY);
    await clickDownload();
    await waitFor(() => expect(called(calls, "/documents/4/download")).toBe(true));
    expect(called(calls, "/documents/pdf")).toBe(false);
  });
});

describe("useObjectUrl", () => {
  it("revokes the previous URL when the blob changes and on unmount", () => {
    const first = new Blob(["a"]);
    const { result, rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: first as Blob | undefined },
    });
    const firstUrl = result.current;
    rerender({ blob: new Blob(["b"]) });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(result.current);
  });

  it("balances created and revoked URLs under StrictMode, blob changes and unmount", () => {
    const { rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: new Blob(["a"]) as Blob | undefined },
      wrapper: StrictMode,
    });
    rerender({ blob: new Blob(["b"]) });
    rerender({ blob: new Blob(["c"]) });
    unmount();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    );
  });

  it("is null without a blob", () => {
    const { result } = renderHook(() => useObjectUrl(undefined));
    expect(result.current).toBeNull();
  });
});
