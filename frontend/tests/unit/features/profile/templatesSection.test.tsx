import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=vorlagen"));
afterEach(() => vi.unstubAllGlobals());

const OWN = {
  id: 9,
  doc_type: "CV",
  name: "Mein Layout",
  is_admin: false,
  user_id: 1,
  status: null,
  created_at: "2026-08-12T09:00:00Z",
  updated_at: "2026-08-12T09:00:00Z",
};
const DEFAULT_LINE = "Standard für neue Bewerbungen";
const SERVER_ERROR = 500;
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
// One failure, then a retry far in the future: the preview stays without data and not yet in error.
const RETRY_LATER = { queries: { retry: 1, retryDelay: 600_000 } };
const NOT_YET = "Als Standard wählbar, sobald die KI-Befüllung endet.";
const cvGallery = () => screen.getByRole("region", { name: "Lebenslauf" });
const card = (name: string) => within(cvGallery()).getByText(name).closest("li")!;
const previewClassic = async () =>
  userEvent.click(
    within(await screen.findByRole("region", { name: "Lebenslauf" })).getByRole("button", {
      name: "Vorschau von Klassisch",
    }),
  );

describe("Vorlagen gallery", () => {
  it("lists bundled and own templates per kind and marks the default", async () => {
    stubRoutes(profileStubs({ "GET /document-templates": [OWN] }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    expect(card("Klassisch")).toHaveTextContent(DEFAULT_LINE);
    expect(card("Klassisch")).toHaveTextContent("Mitgeliefert");
    expect(card("Mein Layout")).toHaveTextContent("Hochgeladen am 12.08.2026");
    expect(within(card("Mein Layout")).getByRole("button", { name: "Als Standard" })).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Anschreiben" })).getByText("Klassisch"),
    ).toBeVisible();
  });

  it("selects a default, moves the marker and hands focus to the card's preview", async () => {
    // Like the server: the selection is stored, so the refetch after the PATCH reads it.
    let settings: typeof STORED_SETTINGS = STORED_SETTINGS;
    const calls = stubRoutes(
      profileStubs({
        "GET /settings": () => jsonResponse(200, settings),
        "GET /document-templates": [OWN],
        "PATCH /settings/template": () => {
          settings = { ...STORED_SETTINGS, cv_template: "9" };
          return jsonResponse(200, { status: "saved" });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    await userEvent.click(
      within(card("Mein Layout")).getByRole("button", { name: "Als Standard" }),
    );
    expect(
      await screen.findByText("„Mein Layout“ ist jetzt Standard für neue Bewerbungen."),
    ).toBeVisible();
    expect(JSON.parse(calls.find((call) => call.method === "PATCH")!.body!)).toEqual({
      cv_template: "9",
    });
    expect(card("Mein Layout")).toHaveTextContent(DEFAULT_LINE);
    // Preflight ruling 20: the button is gone after its own action; focus never falls to body.
    await waitFor(() =>
      expect(
        within(card("Mein Layout")).getByRole("button", { name: "Vorschau von Mein Layout" }),
      ).toHaveFocus(),
    );
  });

  it("a deleted default reads as the bundled one", async () => {
    stubRoutes(profileStubs({ "GET /settings": { ...STORED_SETTINGS, cv_template: "99" } }));
    renderWithProviders(<ProfilePage />);
    await screen.findAllByText(DEFAULT_LINE);
    expect(card("Klassisch")).toHaveTextContent(DEFAULT_LINE);
  });

  it("a template the AI is still filling cannot be the default and says why", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates": [
          { ...OWN, status: "processing", updated_at: new Date().toISOString() },
        ],
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    expect(within(card("Mein Layout")).queryByRole("button", { name: "Als Standard" })).toBeNull();
    expect(card("Mein Layout")).toHaveTextContent(NOT_YET);
    // Ruling R17: one line, the state line carries the reason.
    expect(within(card("Mein Layout")).getAllByText(/KI-Befüllung endet/)).toHaveLength(1);
  });

  it("a template whose fill was rejected stays selectable", async () => {
    stubRoutes(
      profileStubs({ "GET /document-templates": [{ ...OWN, status: "annotation_rejected" }] }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    expect(within(card("Mein Layout")).getByRole("button", { name: "Als Standard" })).toBeVisible();
  });

  it("a selection the server still refuses as filling gets the fixed sentence", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates": [OWN],
        "PATCH /settings/template": () => jsonResponse(409, { detail: "template_processing" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    await userEvent.click(
      within(card("Mein Layout")).getByRole("button", { name: "Als Standard" }),
    );
    expect(
      await screen.findByText("Die Vorlage wird noch befüllt. Versuche es gleich noch einmal."),
    ).toBeVisible();
  });

  it("an unusable template gets a fixed sentence, never the server's words", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates": [OWN],
        "PATCH /settings/template": () =>
          jsonResponse(422, { detail: "cv_template: template not found" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    await userEvent.click(
      within(card("Mein Layout")).getByRole("button", { name: "Als Standard" }),
    );
    expect(
      await screen.findByText("Diese Vorlage lässt sich nicht als Standard verwenden."),
    ).toBeVisible();
    expect(screen.queryByText(/template not found/)).toBeNull();
  });
});

describe("Vorlagen gallery, letters and stalled fills", () => {
  const LETTER = { ...OWN, id: 12, doc_type: "COVER_LETTER", name: "Mein Brief" };
  const letterGallery = () => screen.getByRole("region", { name: "Anschreiben" });
  const letterCard = (name: string) => within(letterGallery()).getByText(name).closest("li")!;

  it("selects a letter default with the letter field and moves the marker there", async () => {
    let settings: typeof STORED_SETTINGS = STORED_SETTINGS;
    const calls = stubRoutes(
      profileStubs({
        "GET /settings": () => jsonResponse(200, settings),
        "GET /document-templates": [LETTER],
        "PATCH /settings/template": () => {
          settings = { ...STORED_SETTINGS, cover_letter_template: "12" };
          return jsonResponse(200, { status: "saved" });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Brief");
    expect(letterCard("Klassisch")).toHaveTextContent(DEFAULT_LINE);
    await userEvent.click(
      within(letterCard("Mein Brief")).getByRole("button", { name: "Als Standard" }),
    );
    await waitFor(() => expect(letterCard("Mein Brief")).toHaveTextContent(DEFAULT_LINE));
    expect(JSON.parse(calls.find((call) => call.method === "PATCH")!.body!)).toEqual({
      cover_letter_template: "12",
    });
    expect(letterCard("Klassisch")).not.toHaveTextContent(DEFAULT_LINE);
    expect(card("Klassisch")).toHaveTextContent(DEFAULT_LINE);
  });

  it("a letter default that is not in the gallery reads as the bundled one", async () => {
    stubRoutes(
      profileStubs({
        "GET /settings": { ...STORED_SETTINGS, cover_letter_template: "99" },
        "GET /document-templates": [LETTER],
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Brief");
    expect(letterCard("Klassisch")).toHaveTextContent(DEFAULT_LINE);
    expect(letterCard("Mein Brief")).not.toHaveTextContent(DEFAULT_LINE);
  });

  it("a stalled fill cannot be the default", async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    stubRoutes(
      profileStubs({
        "GET /document-templates": [
          { ...OWN, status: "processing", created_at: old, updated_at: old },
        ],
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    expect(within(card("Mein Layout")).queryByRole("button", { name: "Als Standard" })).toBeNull();
    expect(card("Mein Layout")).toHaveTextContent("Das dauert ungewöhnlich lange.");
  });

  it("leaves focus where the user moved it while the selection was saving", async () => {
    let answer: (response: Response) => void = () => {};
    stubRoutes(
      profileStubs({
        "GET /document-templates": [OWN],
        "PATCH /settings/template": () => new Promise<Response>((resolve) => (answer = resolve)),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    await userEvent.click(
      within(card("Mein Layout")).getByRole("button", { name: "Als Standard" }),
    );
    const elsewhere = screen.getByRole("link", { name: "Ziel" });
    elsewhere.focus();
    answer(jsonResponse(200, { status: "saved" }));
    expect(
      await screen.findByText("„Mein Layout“ ist jetzt Standard für neue Bewerbungen."),
    ).toBeVisible();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(elsewhere).toHaveFocus();
  });
});

describe("Vorlagen preview", () => {
  it("the preview frame has an empty sandbox and the CSP", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates/preview": {
          html: "<html><body><script>parent.x=1</script><h1>Jonas</h1></body></html>",
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await previewClassic();
    const frame = await screen.findByTitle("Vorschau von Klassisch");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.hasAttribute("src")).toBe(false);
    const srcdoc = frame.getAttribute("srcdoc")!;
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).not.toContain("<script");
    expect(srcdoc).toContain("<h1>Jonas</h1>");
  });

  it("the preview drops link targets on every element so a click cannot leave the frame", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates/preview": {
          html:
            '<html><body><a href="https://evil.example/">Portfolio</a>' +
            '<map><area href="https://evil.example/" alt="x"></map>' +
            '<svg><a xlink:href="https://evil.example/"><text>Svg</text>' +
            '<set attributeName="href" to="https://evil.example/"></set>' +
            '<animate attributeName="xlink:href" values="https://evil.example/"></animate>' +
            "</a></svg>" +
            // Firefox follows an href on any MathML element.
            '<math href="https://evil.example"><mi href="https://evil.example">x</mi></math>' +
            "</body></html>",
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await previewClassic();
    const srcdoc = (await screen.findByTitle("Vorschau von Klassisch")).getAttribute("srcdoc")!;
    expect(srcdoc).not.toContain("href");
    expect(srcdoc).not.toContain("evil.example");
    // SVG animation elements could set a link target again at runtime, without script.
    expect(srcdoc).not.toMatch(/<set\b|<animate\b/);
    expect(srcdoc).toContain(">Portfolio</a>");
    expect(srcdoc).toContain("<text>Svg</text>");
    expect(srcdoc).toContain("<mi>x</mi>");
  });

  it("a template the server cannot render says so", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates/preview": () => jsonResponse(422, { detail: "template_rejected" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await previewClassic();
    expect(await screen.findByText("Diese Vorlage lässt sich nicht darstellen.")).toBeVisible();
  });

  it("a template that is gone says so", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates/preview": () =>
          jsonResponse(404, { detail: "Template not found" }),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await previewClassic();
    expect(await screen.findByText("Diese Vorlage gibt es nicht mehr.")).toBeVisible();
    expect(screen.queryByText("Template not found")).toBeNull();
  });

  it("a server failure shows the error at once, not the busy sheet through the retries", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates/preview": () => jsonResponse(SERVER_ERROR, { detail: "boom" }),
      }),
    );
    renderWithProviders(<ProfilePage />, new QueryClient({ defaultOptions: RETRY_LATER }));
    await previewClassic();
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeVisible();
    expect(screen.queryByText("boom")).toBeNull();
  });
});

describe("Vorlagen delete", () => {
  it("deletes an own template after asking, with the default note when it is the default", async () => {
    // Like the server: the template leaves the list and the selection naming it is reset.
    let templates: object[] = [OWN];
    let settings: typeof STORED_SETTINGS = { ...STORED_SETTINGS, cv_template: "9" };
    stubRoutes(
      profileStubs({
        "GET /settings": () => jsonResponse(200, settings),
        "GET /document-templates": () => jsonResponse(200, templates),
        "DELETE /document-templates/9": () => {
          templates = [];
          settings = { ...STORED_SETTINGS, cv_template: null };
          return jsonResponse(200, { ok: true });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mein Layout löschen" }));
    const dialog = screen.getByRole("dialog", { name: "Vorlage löschen?" });
    expect(dialog).toHaveTextContent("„Mein Layout“ wird endgültig gelöscht.");
    expect(dialog).toHaveTextContent("Danach wird „Klassisch“ verwendet.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("„Mein Layout“ gelöscht.")).toBeVisible();
    expect(within(cvGallery()).queryByText("Mein Layout")).toBeNull();
    expect(card("Klassisch")).toHaveTextContent(DEFAULT_LINE);
    // Preflight ruling 19: after ModalLayer returns focus to the gone opener, the heading takes it.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Vorlagen" })).toHaveFocus(),
    );
  });

  it("refreshes the profile after a delete, since the server may have reset the default", async () => {
    let templates: object[] = [OWN];
    const calls = stubRoutes(
      profileStubs({
        "GET /document-templates": () => jsonResponse(200, templates),
        "DELETE /document-templates/9": () => {
          templates = [];
          return jsonResponse(200, { ok: true });
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mein Layout löschen" }));
    const settingsReads = () =>
      calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === "/settings")
        .length;
    const before = settingsReads();
    const dialog = screen.getByRole("dialog", { name: "Vorlage löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(settingsReads()).toBeGreaterThan(before));
  });

  it("a template that is not the default gets no default note", async () => {
    stubRoutes(profileStubs({ "GET /document-templates": [OWN] }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mein Layout löschen" }));
    expect(screen.getByRole("dialog", { name: "Vorlage löschen?" })).not.toHaveTextContent(
      "Danach wird",
    );
  });

  it("never offers delete for bundled or global templates", async () => {
    stubRoutes(
      profileStubs({
        "GET /document-templates": [
          { ...OWN, id: 5, is_admin: true, user_id: null, name: "Firma" },
        ],
      }),
    );
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Firma");
    expect(card("Firma")).toHaveTextContent("Für alle");
    expect(screen.queryByRole("button", { name: /löschen$/ })).toBeNull();
  });
});
