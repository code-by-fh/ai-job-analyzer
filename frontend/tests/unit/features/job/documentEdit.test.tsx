import type { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import { queryKeys } from "@/api/queryKeys";
import { MAX_HTML_LENGTH } from "@/features/job/documents/editDocument";
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
const READY = buildJob({
  status: "DRAFTED",
  cv_html_present: true,
  cover_letter_html_present: true,
});
const PLAIN_HTML = "<html><body><p>alt</p></body></html>";
const HOSTILE_HTML =
  '<html><head><script>window.pwned=1</script></head><body><p>alt</p><img src="x" onerror="window.pwned=1"><a href="javascript:window.pwned=1">l</a></body></html>';

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

afterEach(() => vi.restoreAllMocks());

function show(html = PLAIN_HTML) {
  return stubRoutes({
    "GET /jobs/job-1/documents": [CV],
    "GET /profile/documents": [],
    "GET /jobs/job-1/documents/4/view": () => new Response("%PDF-1.4"),
    "GET /jobs/job-1/documents/html": { html },
    "PUT /jobs/job-1/documents/html": { ok: true },
    "POST /jobs/job-1/documents/render": { queued: true },
  });
}

let queryClient: QueryClient;

async function openEditor(): Promise<HTMLIFrameElement> {
  ({ queryClient } = renderWithProviders(<DocumentsTab job={READY} />));
  await userEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
  return (await screen.findByTitle("Lebenslauf bearbeiten")) as HTMLIFrameElement;
}

/** jsdom does not load srcdoc: fire the load event and an input by hand. */
function makeDirty(frame: HTMLIFrameElement) {
  frame.dispatchEvent(new Event("load"));
  frame.contentDocument!.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("editing a document", () => {
  it("loads the stored HTML onto the sheet", async () => {
    show();
    const frame = await openEditor();
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("<p>alt</p>");
  });

  it("saves the edited HTML, asks for a render and shows the progress", async () => {
    const calls = show();
    const frame = await openEditor();
    frame.contentDocument!.body.innerHTML = "<p>neu</p>";
    await userEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() =>
      expect(calls.map((call) => call.method)).toEqual(expect.arrayContaining(["PUT", "POST"])),
    );
    const put = calls.find((call) => call.method === "PUT");
    expect(JSON.parse(put?.body ?? "").html).toContain("<p>neu</p>");
    expect(await screen.findByText("PDF wird neu gesetzt …")).toBeInTheDocument();
  });

  it("discards an unchanged edit without asking or saving", async () => {
    const calls = show();
    const confirm = vi.spyOn(window, "confirm");
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(screen.queryByTitle("Lebenslauf bearbeiten")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("sandboxes hostile stored HTML: no scripts, no handlers, no allow-scripts", async () => {
    show(HOSTILE_HTML);
    const frame = await openEditor();
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("<p>alt</p>");
    expect(srcdoc).not.toMatch(/<script|onerror|javascript:/i);
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
  });

  it("does not save HTML above the size bound", async () => {
    const calls = show();
    const frame = await openEditor();
    frame.contentDocument!.body.innerHTML = `<p>${"x".repeat(MAX_HTML_LENGTH)}</p>`;
    await userEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByText(/zu groß/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("asks in a dialog before discarding unsaved changes and keeps editing on cancel", async () => {
    show();
    const confirm = vi.spyOn(window, "confirm");
    makeDirty(await openEditor());
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    const dialog = await screen.findByRole("dialog", { name: "Änderungen verwerfen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter bearbeiten" }));
    expect(screen.getByTitle("Lebenslauf bearbeiten")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await userEvent.click(screen.getByRole("button", { name: "Änderungen verwerfen" }));
    expect(screen.queryByTitle("Lebenslauf bearbeiten")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before the preview is switched to the other document", async () => {
    show();
    makeDirty(await openEditor());
    await userEvent.click(screen.getByRole("button", { name: "Anschreiben", pressed: false }));
    expect(
      await screen.findByRole("dialog", { name: "Änderungen verwerfen?" }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Lebenslauf bearbeiten")).toBeInTheDocument();
  });

  it("keeps the edit when the stored HTML changes underneath and says so", async () => {
    show();
    const frame = await openEditor();
    const before = frame.getAttribute("srcdoc");
    makeDirty(frame);
    queryClient.setQueryData(
      queryKeys.jobDocumentHtml("job-1", "cv"),
      "<html><body>neu</body></html>",
    );
    expect(await screen.findByText(/inzwischen geändert/)).toBeInTheDocument();
    expect(screen.getByTitle("Lebenslauf bearbeiten").getAttribute("srcdoc")).toBe(before);
  });

  it("blocks leaving the page while there are unsaved changes", async () => {
    show();
    makeDirty(await openEditor());
    await waitFor(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});
