import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CERT = { id: 1, doc_type: "CERTIFICATE", label: "AWS", original_filename: "aws.pdf" };
const OTHER = { id: 2, doc_type: "CV", label: "Alter Lebenslauf", original_filename: "cv.pdf" };
const MAX_NOTE_LENGTH = "50000";

function stub(profileDocuments: unknown[], overrides: Record<string, unknown> = {}) {
  return stubRoutes({
    "GET /jobs/job-1/documents": [],
    "GET /jobs/job-1/history": [],
    "GET /profile/documents": profileDocuments,
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/generate-package": { status: "started" },
    "POST /jobs/job-1/generate": { status: "started" },
    "POST /jobs/job-1/cancel-generation": { status: "cancelled" },
    ...overrides,
  });
}

function show(job: JobDetail, profileDocuments: unknown[] = [CERT]): RecordedCall[] {
  const calls = stub(profileDocuments);
  renderWithProviders(<DocumentsTab job={job} />);
  return calls;
}

const posted = (calls: RecordedCall[], path: string) =>
  calls
    .filter((call) => call.method !== "GET" && call.url.endsWith(path))
    .map((call) => JSON.parse(call.body ?? "null"));

describe("DocumentsTab", () => {
  it("creates both documents with the profile attachments", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    expect(screen.getAllByText("Nicht erstellt")).toHaveLength(2);
    expect(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Beide erstellen" }));
    await waitFor(() =>
      expect(posted(calls, "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: true },
      ]),
    );
  });

  it("leaves the attachments out when unticked", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Beide erstellen" }));
    await waitFor(() =>
      expect(posted(calls, "/generate-package")[0].include_profile_documents).toBe(false),
    );
  });

  it("regenerates the CV with a note", async () => {
    const calls = show(
      buildJob({ status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true }),
    );
    const row = screen.getByRole("group", { name: "Lebenslauf" });
    await userEvent.click(within(row).getByRole("button", { name: "Neu erstellen" }));
    await userEvent.type(
      within(row).getByLabelText("Hinweis an die KI (optional)"),
      "Führung betonen",
    );
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    await waitFor(() =>
      expect(posted(calls, "/jobs/job-1")).toEqual([{ cv_draft: "Führung betonen" }]),
    );
    await waitFor(() =>
      expect(posted(calls, "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: false, include_profile_documents: true },
      ]),
    );
  });

  it("creates the letter through /generate", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    const row = screen.getByRole("group", { name: "Anschreiben" });
    await userEvent.click(within(row).getByRole("button", { name: "Erstellen" }));
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    await waitFor(() => expect(posted(calls, "/generate")).toEqual([{ improvement_notes: null }]));
  });

  it("shows a running generation and cancels it", async () => {
    const calls = show(buildJob({ status: "GENERATING" }));
    expect(screen.getByText("Wird geschrieben und als PDF gesetzt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beide erstellen" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Erstellung abbrechen" }));
    await waitFor(() => expect(posted(calls, "/cancel-generation")).toHaveLength(1));
  });

  it("reports a failed generation without the server text", () => {
    show(buildJob({ status: "FAILED", generation_error: "openai.APIError 500" }));
    expect(screen.getByText("Die Unterlagen konnten nicht erstellt werden.")).toBeInTheDocument();
    expect(screen.queryByText(/APIError/)).not.toBeInTheDocument();
  });

  it("shares the attach choice with the next-step card", async () => {
    const job = buildJob({ status: "DRAFTED" });
    const calls = stub([CERT]);
    renderWithProviders(
      <>
        <NextStepCard job={job} />
        <DocumentsTab job={job} />
      </>,
    );
    await userEvent.click(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Unterlagen erstellen" }));
    await waitFor(() =>
      expect(posted(calls, "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: false },
      ]),
    );
  });

  it("counts only attachable profile documents and names the others", async () => {
    show(buildJob({ status: "DRAFTED" }), [CERT, OTHER]);
    expect(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)")).toBeChecked();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(
      screen.getByText("Wird nicht angehängt (nur Zeugnisse und Nachweise): Alter Lebenslauf"),
    ).toBeInTheDocument();
  });

  it("keeps the typed note when the generation cannot start", async () => {
    stub([CERT], { "POST /jobs/job-1/generate": jsonResponse(500, { detail: "boom" }) });
    renderWithProviders(
      <DocumentsTab job={buildJob({ status: "DRAFTED", cv_html_present: true })} />,
    );
    const row = screen.getByRole("group", { name: "Anschreiben" });
    await userEvent.click(within(row).getByRole("button", { name: "Erstellen" }));
    const note = within(row).getByLabelText("Hinweis an die KI (optional)");
    expect(note).toHaveAttribute("maxlength", MAX_NOTE_LENGTH);
    await userEvent.type(note, "kürzer");
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
    expect(within(row).getByLabelText("Hinweis an die KI (optional)")).toHaveValue("kürzer");
  });

  it("closes the note once the generation started", async () => {
    show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    const row = screen.getByRole("group", { name: "Anschreiben" });
    await userEvent.click(within(row).getByRole("button", { name: "Erstellen" }));
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    await waitFor(() =>
      expect(within(row).queryByLabelText("Hinweis an die KI (optional)")).not.toBeInTheDocument(),
    );
  });

  it("points to the profile when there is nothing to attach", async () => {
    show(buildJob({ status: "DRAFTED" }), []);
    expect(await screen.findByText("Keine Nachweise im Profil.")).toBeInTheDocument();
  });
});
