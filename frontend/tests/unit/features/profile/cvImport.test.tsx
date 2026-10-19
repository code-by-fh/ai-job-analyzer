import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { redirectToLogin } from "@/api/session";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

// A lost session ends on /login (a full navigation jsdom does not do); the test only checks the call.
vi.mock("@/api/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/session")>()),
  redirectToLogin: vi.fn(),
}));

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => {
  liveNavigation.reset("section=lebenslauf");
  vi.mocked(redirectToLogin).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const EMPTY_CV = { experience: [], projects: [], education: "" };
const EMPTY = {
  ...STORED_SETTINGS,
  role: "",
  skills: "",
  location: "",
  min_salary: "",
  cv_data: EMPTY_CV,
};
// What GET /settings answers for a user who never saved: server/database/core.py's defaults.
const FRESH = {
  ...EMPTY,
  role: "Software Engineer",
  skills: "Python, Docker",
  location: "Remote",
  min_salary: "60000",
};
const IMPORTED = {
  role: "Backend-Entwickler",
  skills: "Kotlin, Java",
  min_salary: "",
  location: "Hamburg",
  cv_data: {
    experience: [
      { company: "Hanseatic Commerce GmbH", role: "Senior", duration: "2021", description: "x" },
    ],
    projects: [],
    education: "B.Sc. Informatik",
  },
};
const IMPORT_ANSWER = { status: "success", data: IMPORTED };
const READING = "Der Lebenslauf wird gelesen. Das kann einige Minuten dauern.";
const DONE = "Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.";
const DRAFT_KEPT =
  "Der Lebenslauf wurde importiert und gespeichert. Deine ungespeicherten Änderungen hier sind noch offen: „Speichern“ ersetzt den Import durch sie.";

// GET /settings while the server runs an import this page did not send (a reload).
const RUNNING = {
  ...EMPTY,
  cv_import_running: true,
  cv_import_started_at: "2026-10-16T09:30:00+00:00",
  cv_import_error: null,
};
const FAILED = "Die KI konnte den Lebenslauf nicht lesen. Versuche es später noch einmal.";
const ALREADY_RUNNING = "Es läuft bereits ein Import. Warte, bis er fertig ist.";

const pdf = () => new File(["%PDF-1.4"], "Lebenslauf.PDF", { type: "application/pdf" });
const importButton = () => screen.findByRole("button", { name: "Lebenslauf importieren (PDF)" });
const fileInput = () => document.querySelector<HTMLInputElement>("#pf-cv-import-file")!;
const pick = async (file: File) => userEvent.upload(fileInput(), file, { applyAccept: false });
const uploads = (calls: RecordedCall[]) =>
  calls.filter((call) => call.url.endsWith("/settings/upload-cv"));
const gets = (calls: { url: string; method: string }[], path: string) =>
  calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === path);
/** Only the open section is mounted (D2): switching unmounts Lebenslauf and mounts it anew. */
const openSection = (query: string) => act(() => liveNavigation.replace(`/profile${query}`));
const pageRegion = () =>
  screen.getAllByRole("status").find((region) => region.classList.contains("sr-only"))!;

/** A response the test releases itself, to look at the screen while the import runs. */
function heldResponse() {
  let release: (response: Response) => void = () => undefined;
  const held = {
    released: false,
    response: new Promise<Response>((resolve) => {
      release = resolve;
    }),
    release: () => {
      held.released = true;
      release(jsonResponse(200, IMPORT_ANSWER));
    },
  };
  return held;
}

/** GET /settings answers what is stored; like the server, the import stores when it answers. */
function storingImport(held: ReturnType<typeof heldResponse>) {
  return {
    "GET /settings": () => jsonResponse(200, held.released ? { ...EMPTY, ...IMPORTED } : EMPTY),
    "POST /settings/upload-cv": () => held.response,
  };
}

describe("CV import", () => {
  it("imports into an empty profile without asking", async () => {
    const calls = stubRoutes(
      profileStubs({ "GET /settings": EMPTY, "POST /settings/upload-cv": IMPORT_ANSWER }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploads(calls)).toHaveLength(1);
  });

  it("does not ask a fresh user who only has the server's defaults", async () => {
    const calls = stubRoutes(
      profileStubs({ "GET /settings": FRESH, "POST /settings/upload-cv": IMPORT_ANSWER }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploads(calls)).toHaveLength(1);
  });

  it("asks before replacing existing data; Abbrechen sends nothing and keeps focus", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings/upload-cv": IMPORT_ANSWER }));
    renderWithProviders(<ProfilePage />);
    const button = await importButton();
    await userEvent.click(button);
    await pick(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    expect(dialog).toHaveTextContent("Berufserfahrung, Projekte und Ausbildung werden ersetzt.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploads(calls)).toHaveLength(0);
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("Übernehmen in the dialog sends the file", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings/upload-cv": IMPORT_ANSWER }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(uploads(calls)).toHaveLength(1);
    expect(uploads(calls)[0]!.rawBody).toBeInstanceOf(FormData);
  });

  it("is inactive while the form is dirty", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), " und mehr");
    const button = await importButton();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Erst speichern oder verwerfen.");
  });

  it("refuses a non-PDF before sending it", async () => {
    const calls = stubRoutes(profileStubs({ "GET /settings": EMPTY }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(new File(["x"], "cv.docx", { type: "application/msword" }));
    expect(
      await screen.findByText("cv.docx: Dieser Dateityp wird nicht unterstützt."),
    ).toBeVisible();
    expect(uploads(calls)).toHaveLength(0);
  });

  it("refuses a file over 10 MB before sending it", async () => {
    const calls = stubRoutes(profileStubs({ "GET /settings": EMPTY }));
    const big = pdf();
    Object.defineProperty(big, "size", { value: MAX_FILE_BYTES + 1 });
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(big);
    expect(await screen.findByText("Lebenslauf.PDF ist größer als 10 MB.")).toBeVisible();
    expect(uploads(calls)).toHaveLength(0);
  });

  it.each([
    [413, { detail: "file_too_large" }, "Die Datei ist größer als 10 MB."],
    [
      415,
      { detail: "unsupported_type" },
      "Das ist kein PDF. Bitte lade deinen Lebenslauf als PDF hoch.",
    ],
    [
      422,
      { detail: [{ type: "value_error", loc: ["body", "file"], msg: "cv_no_text" }] },
      "In diesem PDF steht kein lesbarer Text (eingescannt?). Bitte lade ein PDF mit Text hoch.",
    ],
    [
      502,
      { detail: "cv_parse_failed" },
      "Die KI konnte den Lebenslauf nicht lesen. Versuche es später noch einmal.",
    ],
    [
      503,
      { detail: "ai_busy" },
      "Gerade laufen zu viele KI-Vorgänge. Bitte versuche es gleich noch einmal.",
    ],
    [
      500,
      { detail: "Internal Server Error" },
      "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
    ],
  ])("maps the refusal %i to a fixed sentence, never the server's words", async (...args) => {
    const [status, body, sentence] = args;
    stubRoutes(
      profileStubs({
        "GET /settings": EMPTY,
        "POST /settings/upload-cv": () => jsonResponse(status, body),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(await screen.findByText(sentence)).toBeVisible();
    expect(
      screen.queryByText(/file_too_large|unsupported_type|cv_no_text|cv_parse|ai_busy|Internal/),
    ).toBeNull();
  });

  it("without an AI provider shows the sentence and no button", async () => {
    stubRoutes(
      profileStubs({
        "GET /setup-status": {
          has_source: true,
          ai_configured: false,
          profile_complete: true,
          has_jobs: true,
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    expect(
      await screen.findByText(/Für den Import muss eine KI eingerichtet sein\./),
    ).toBeVisible();
    expect(await screen.findByRole("link", { name: "KI-Anbieter einrichten" })).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Lebenslauf importieren (PDF)" })).toBeNull(),
    );
  });

  it("while it runs: a busy button, a calm static line and one announcement", async () => {
    const held = heldResponse();
    stubRoutes(
      profileStubs({ "GET /settings": EMPTY, "POST /settings/upload-cv": () => held.response }),
    );
    renderWithProviders(<ProfilePage />);
    const button = await importButton();
    await pick(pdf());
    expect(await screen.findByText(READING, { selector: ".notice *" })).toBeVisible();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.closest(".cv-import")).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(pageRegion()).toHaveTextContent(READING));
    held.release();
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(button.closest(".cv-import")).not.toHaveAttribute("aria-busy");
    expect(screen.queryByText(READING, { selector: ".notice *" })).toBeNull();
  });

  it("adopts the server's answer at once and refreshes the setup status", async () => {
    let settingsLoads = 0;
    // Only the first load answers, so what shows afterwards came from the import's own answer.
    const settings = () =>
      settingsLoads++ === 0 ? jsonResponse(200, EMPTY) : new Promise<Response>(() => undefined);
    const calls = stubRoutes(
      profileStubs({ "GET /settings": settings, "POST /settings/upload-cv": IMPORT_ANSWER }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    const setupLoads = gets(calls, "/setup-status").length;
    await pick(pdf());
    expect(await screen.findByText("Hanseatic Commerce GmbH", { exact: false })).toBeVisible();
    expect(screen.getByLabelText("Ausbildung")).toHaveValue("B.Sc. Informatik");
    await waitFor(() => expect(gets(calls, "/setup-status").length).toBeGreaterThan(setupLoads));
  });

  it("keeps edits typed during the import and offers the imported CV instead", async () => {
    const held = heldResponse();
    stubRoutes(profileStubs(storingImport(held)));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    const education = screen.getByLabelText("Ausbildung");
    await userEvent.type(education, "Abitur");
    held.release();
    expect(await screen.findByText(DRAFT_KEPT, { selector: ".cv-draft-kept p" })).toBeVisible();
    expect(education).toHaveValue("Abitur");
    await waitFor(() => expect(pageRegion()).toHaveTextContent(DRAFT_KEPT));
    // Announced once by the page region; the notice itself is no second live region.
    expect(
      screen.getByText(DRAFT_KEPT, { selector: ".cv-draft-kept p" }).closest("[role]"),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Änderungen verwerfen und Import anzeigen" }),
    );
    expect(screen.getByLabelText("Ausbildung")).toHaveValue("B.Sc. Informatik");
    expect(document.querySelector(".cv-draft-kept")).toBeNull();
    expect(screen.getByRole("heading", { level: 4, name: "Berufserfahrung" })).toHaveFocus();
  });

  it("closes an entry editor that was open (but clean) when the import lands", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings/upload-cv": IMPORT_ANSWER }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dev bearbeiten" }));
    expect(screen.getByLabelText("Rolle")).toHaveValue("Dev");
    await pick(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(uploads(calls)).toHaveLength(1);
    expect(screen.queryByLabelText("Rolle")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("stays busy after a switch to Ziel and back, and blocks a second import", async () => {
    const held = heldResponse();
    const calls = stubRoutes(profileStubs(storingImport(held)));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    openSection("");
    await screen.findByLabelText("Wunschrolle");
    openSection("?section=lebenslauf");
    const button = await importButton();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.closest(".cv-import")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(READING, { selector: ".notice *" })).toBeVisible();
    await userEvent.click(button);
    expect(uploads(calls)).toHaveLength(1);
    held.release();
    expect(await screen.findByText(DONE)).toBeVisible();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it("keeps edits typed after coming back to Lebenslauf when the import lands", async () => {
    const held = heldResponse();
    stubRoutes(profileStubs(storingImport(held)));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    openSection("");
    await screen.findByLabelText("Wunschrolle");
    openSection("?section=lebenslauf");
    const education = await screen.findByLabelText("Ausbildung");
    await userEvent.type(education, "Abitur");
    held.release();
    expect(await screen.findByText(DRAFT_KEPT, { selector: ".cv-draft-kept p" })).toBeVisible();
    expect(education).toHaveValue("Abitur");
    await waitFor(() => expect(pageRegion()).toHaveTextContent(DRAFT_KEPT));
  });

  it("Escape closes the confirmation and sends nothing", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings/upload-cv": IMPORT_ANSWER }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploads(calls)).toHaveLength(0);
  });

  it("gives focus back to the import button after Übernehmen", async () => {
    const held = heldResponse();
    stubRoutes(profileStubs({ "POST /settings/upload-cv": () => held.response }));
    renderWithProviders(<ProfilePage />);
    const button = await importButton();
    await pick(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    await waitFor(() => expect(button).toHaveFocus());
    held.release();
    expect(await screen.findByText(DONE)).toBeVisible();
  });

  it("an expired session reads the fixed sentence", async () => {
    stubRoutes(
      profileStubs({
        "GET /settings": EMPTY,
        "POST /settings/upload-cv": () => jsonResponse(401, { detail: "Not authenticated" }),
        "POST /auth/refresh": () => jsonResponse(401, { detail: "Refresh token expired" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(
      await screen.findByText("Deine Sitzung ist abgelaufen. Bitte melde dich neu an."),
    ).toBeVisible();
    expect(redirectToLogin).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Not authenticated|expired/)).toBeNull();
  });

  it("a lost connection reads the fixed sentence", async () => {
    stubRoutes(
      profileStubs({
        "GET /settings": EMPTY,
        "POST /settings/upload-cv": () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(await screen.findByText("Keine Verbindung zum Server.")).toBeVisible();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("after a reload shows the import the server still runs and blocks a second one", async () => {
    const calls = stubRoutes(profileStubs({ "GET /settings": RUNNING }));
    renderWithProviders(<ProfilePage />);
    const button = await importButton();
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByText(READING, { selector: ".notice *" })).toBeVisible();
    await userEvent.click(button);
    expect(uploads(calls)).toHaveLength(0);
  });

  it("after a reload counts the running import from the server's start", async () => {
    const startedAt = new Date(Date.now() - (2 * 60_000 + 1_000)).toISOString();
    const running = { ...RUNNING, cv_import_started_at: startedAt };
    stubRoutes(profileStubs({ "GET /settings": running }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText("läuft seit 2 Minuten")).toBeInTheDocument();
  });

  it("shows the fixed sentence for an import the server ended with an error", async () => {
    stubRoutes(profileStubs({ "GET /settings": { ...EMPTY, cv_import_error: "cv_parse_failed" } }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText(FAILED)).toBeVisible();
    expect(screen.queryByText(/cv_parse_failed/)).toBeNull();
  });

  it("keeps edits typed during an import the server ran for a reloaded page", async () => {
    let finished = false;
    const settings = () => jsonResponse(200, finished ? { ...EMPTY, ...IMPORTED } : RUNNING);
    stubRoutes(profileStubs({ "GET /settings": settings }));
    const { queryClient } = renderWithProviders(<ProfilePage />);
    const education = await screen.findByLabelText("Ausbildung");
    await userEvent.type(education, "Abitur");
    finished = true;
    // The cv_import_ended event invalidates the profile (realtime/applyEvent.ts).
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.profile }));
    expect(await screen.findByText(DRAFT_KEPT, { selector: ".cv-draft-kept p" })).toBeVisible();
    expect(education).toHaveValue("Abitur");
  });

  it("shows the CV the server imported for a reloaded page on a clean form", async () => {
    let finished = false;
    const settings = () => jsonResponse(200, finished ? { ...EMPTY, ...IMPORTED } : RUNNING);
    stubRoutes(profileStubs({ "GET /settings": settings }));
    const { queryClient } = renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Ausbildung");
    finished = true;
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.profile }));
    await waitFor(() =>
      expect(screen.getByLabelText("Ausbildung")).toHaveValue("B.Sc. Informatik"),
    );
    expect(document.querySelector(".cv-draft-kept")).toBeNull();
    expect(screen.queryByText(READING, { selector: ".notice *" })).toBeNull();
  });

  it("a second import while one runs reads a fixed sentence", async () => {
    stubRoutes(
      profileStubs({
        "GET /settings": EMPTY,
        "POST /settings/upload-cv": () => jsonResponse(409, { detail: "cv_import_running" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await importButton();
    await pick(pdf());
    expect(await screen.findByText(ALREADY_RUNNING)).toBeVisible();
    expect(screen.queryByText(/cv_import_running/)).toBeNull();
  });
});
