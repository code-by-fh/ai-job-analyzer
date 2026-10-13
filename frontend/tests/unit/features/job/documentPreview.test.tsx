import { StrictMode } from "react";
import { renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const pdf = () => new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });
let urlCount = 0;

beforeEach(() => {
  urlCount = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:http://localhost/${(urlCount += 1)}`),
    revokeObjectURL: vi.fn(),
  });
});

function show(routes: Record<string, unknown> = {}) {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [CV, LETTER],
    "GET /profile/documents": [],
    "GET /jobs/job-1/documents/4/view": pdf,
    "GET /jobs/job-1/documents/5/view": pdf,
    "GET /jobs/job-1/documents/4/download": pdf,
    ...routes,
  });
  const view = renderWithProviders(<DocumentsTab job={READY} />);
  return { calls, ...view };
}

describe("DocumentPreview", () => {
  it("shows the CV PDF from a blob URL", async () => {
    const { container } = show();
    await waitFor(() =>
      expect(container.querySelector("object")?.getAttribute("data")).toMatch(/^blob:/),
    );
    expect(container.querySelector(".proof-slug")).toHaveTextContent(/Probedruck vom/);
  });

  it("switches to the letter with the preview seg", async () => {
    const { calls, container } = show();
    const dataOf = () => container.querySelector("object")?.getAttribute("data");
    await waitFor(() => expect(dataOf()).toMatch(/^blob:/));
    const cvUrl = dataOf();
    await userEvent.click(screen.getByRole("button", { name: "Anschreiben", pressed: false }));
    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/documents/5/view"))).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Anschreiben", pressed: true })).toBeInTheDocument();
    await waitFor(() => expect(dataOf()).not.toBe(cvUrl));
  });

  it("explains that Drive files cannot be shown", async () => {
    show({
      "GET /jobs/job-1/documents/4/view": jsonResponse(400, {
        detail: "Viewing Google Drive files in app is not yet implemented.",
      }),
    });
    expect(
      await screen.findByText("Dateien aus Google Drive lassen sich hier noch nicht öffnen."),
    ).toBeInTheDocument();
  });

  it("fetches the PDF again when a new version of the document arrives", async () => {
    const { calls, queryClient } = show();
    const viewCalls = () => calls.filter((call) => call.url.endsWith("/documents/4/view")).length;
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
    show({ "GET /jobs/job-1/documents/4/view": octet });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });

  it("downloads the PDF", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { calls } = show();
    const [download] = await screen.findAllByRole("button", { name: "PDF herunterladen" });
    await userEvent.click(download);
    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/documents/4/download"))).toBe(true),
    );
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
