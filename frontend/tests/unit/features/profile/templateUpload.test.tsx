import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { TEMPLATE_STALL_MS } from "@/domain/templates";
import { templateName } from "@/features/profile/templates/useTemplateUpload";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { CLOCK_TICK_MS } from "@/lib/clock";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=vorlagen"));
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date().toISOString();
const created = {
  id: 21,
  doc_type: "CV",
  name: "lebenslauf_2026",
  is_admin: false,
  user_id: 1,
  status: "processing",
  created_at: NOW,
  updated_at: NOW,
};
const html = (text = "<p>{{ name }}</p>") =>
  new File([text], "lebenslauf_2026.html", { type: "text/html" });
const cvUpload = () => screen.getByLabelText("Lebenslauf-Vorlage hochladen");
const liveRegion = (container: HTMLElement) => container.querySelector("[role=status].sr-only")!;

describe("template upload and live state", () => {
  it("names the template after the file without its extension", () => {
    expect(templateName("  Mein CV.final.HTML ", "Vorlage")).toBe("Mein CV.final");
    expect(templateName(".html", "Vorlage")).toBe("Vorlage");
    expect(templateName(`${"x".repeat(120)}.htm`, "Vorlage")).toHaveLength(100);
    // An emoji across position 100 is kept whole or dropped whole, never cut in half.
    const emoji = templateName(`${"x".repeat(99)}\u{1F600}yz.html`, "Vorlage");
    expect(emoji).toBe(`${"x".repeat(99)}\u{1F600}`);
    expect(emoji.isWellFormed()).toBe(true);
  });

  it("uploads, shows the fill state without Als Standard, then the outcome", async () => {
    let list: object[] = [];
    const calls = stubRoutes(
      profileStubs({
        "GET /document-templates": () => jsonResponse(200, list),
        // Like the server: once created, the template is part of the list.
        "POST /document-templates": () => {
          list = [created];
          return jsonResponse(200, created);
        },
      }),
    );
    const { queryClient, container } = renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Lebenslauf-Vorlage hochladen"), html());
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    expect(card).toHaveTextContent("KI setzt Platzhalter ein …");
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(within(card).queryByRole("button", { name: "Als Standard" })).toBeNull();
    expect(JSON.parse(calls.find((call) => call.method === "POST")!.body!)).toEqual({
      doc_type: "CV",
      name: "lebenslauf_2026",
      html: "<p>{{ name }}</p>",
    });
    list = [{ ...created, status: "annotation_rejected" }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    await waitFor(() => expect(card).toHaveTextContent("Die KI-Platzhalter wurden verworfen."));
    expect(card).not.toHaveAttribute("aria-busy");
    await waitFor(() =>
      expect(liveRegion(container)).toHaveTextContent(
        "„lebenslauf_2026“: KI-Platzhalter verworfen.",
      ),
    );
  });

  it("a processing card shows one line that also says why it cannot be the default", async () => {
    stubRoutes(profileStubs({ "GET /document-templates": [created] }));
    renderWithProviders(<ProfilePage />);
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    // Ruling R17: the state line carries the reason, so it is not shown a second time.
    expect(
      within(card).getByText(
        "KI setzt Platzhalter ein … Als Standard wählbar, sobald die KI-Befüllung endet.",
      ),
    ).toBeVisible();
    expect(within(card).getAllByText(/KI-Befüllung endet/)).toHaveLength(1);
  });

  it("a failed fill shows the amber warning and stays selectable", async () => {
    stubRoutes(
      profileStubs({ "GET /document-templates": [{ ...created, status: "annotation_failed" }] }),
    );
    renderWithProviders(<ProfilePage />);
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    const line = within(card).getByText(
      "Die KI konnte die Vorlage nicht befüllen. Sie wird ohne deine Profildaten verwendet.",
    );
    expect(line.closest("p")).toHaveClass("tpl-state", "is-warn");
    expect(within(card).getByRole("button", { name: "Als Standard" })).toBeVisible();
  });

  it("announces each template that leaves the fill once, and nothing on the first load", async () => {
    let list: object[] = [{ ...created, status: null }];
    stubRoutes(profileStubs({ "GET /document-templates": () => jsonResponse(200, list) }));
    const { queryClient, container } = renderWithProviders(<ProfilePage />);
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    expect(liveRegion(container)).toHaveTextContent("");
    list = [{ ...created, status: "processing" }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    // The gallery saw the fill (query notifications arrive on a later tick).
    await waitFor(() => expect(card).toHaveTextContent("KI setzt Platzhalter ein …"));
    expect(liveRegion(container)).toHaveTextContent("");
    list = [{ ...created, status: null }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    await waitFor(() =>
      expect(liveRegion(container)).toHaveTextContent("„lebenslauf_2026“ ist bereit."),
    );
  });

  it("shows a fill that ran too long as stalled, with delete as the way out", async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    stubRoutes(
      profileStubs({
        "GET /document-templates": [{ ...created, created_at: old, updated_at: old }],
      }),
    );
    renderWithProviders(<ProfilePage />);
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    expect(card).toHaveTextContent(
      "Das dauert ungewöhnlich lange. Lösche die Vorlage und lade sie erneut hoch.",
    );
    expect(within(card).getByRole("button", { name: "lebenslauf_2026 löschen" })).toBeVisible();
  });

  it("refuses a non-HTML file and an oversized one before sending", async () => {
    const calls = stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Lebenslauf-Vorlage hochladen");
    await userEvent.upload(cvUpload(), new File(["x"], "cv.docx", { type: "application/msword" }), {
      applyAccept: false,
    });
    expect(await screen.findByText("Nur HTML-Vorlagen (.html) werden unterstützt.")).toBeVisible();
    await userEvent.upload(cvUpload(), html("x".repeat(1_000_001)));
    expect(await screen.findByText("Die Vorlage ist größer als 1 MB.")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("maps a server refusal of the template to a fixed sentence", async () => {
    const refused = {
      detail: [
        {
          type: "value_error",
          loc: ["body", "html"],
          msg: "Template must not access attributes starting with '_'",
        },
      ],
    };
    stubRoutes(profileStubs({ "POST /document-templates": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(
      await screen.findByLabelText("Lebenslauf-Vorlage hochladen"),
      html("{{ x.__class__ }}"),
    );
    expect(
      await screen.findByText("Die Vorlage enthält ungültige Platzhalter und wurde abgelehnt."),
    ).toBeVisible();
    expect(screen.queryByText(/attributes starting/)).toBeNull();
  });

  it("a letter template is ready at once and needs no AI", async () => {
    const letter = { ...created, id: 22, doc_type: "COVER_LETTER", name: "brief", status: null };
    let list: object[] = [];
    const calls = stubRoutes(
      profileStubs({
        "GET /document-templates": () => jsonResponse(200, list),
        "POST /document-templates": () => {
          list = [letter];
          return jsonResponse(200, letter);
        },
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(
      await screen.findByLabelText("Briefvorlage hochladen"),
      new File(["<p data-slot='body'></p>"], "brief.html", { type: "text/html" }),
    );
    expect(await screen.findByText("„brief“ hochgeladen.")).toBeVisible();
    expect(JSON.parse(calls.find((call) => call.method === "POST")!.body!)).toMatchObject({
      doc_type: "COVER_LETTER",
      name: "brief",
    });
    const card = within(screen.getByRole("region", { name: "Anschreiben" }))
      .getByText("brief")
      .closest("li")!;
    expect(card).not.toHaveTextContent("KI setzt Platzhalter ein");
    expect(card).not.toHaveAttribute("aria-busy");
    expect(within(card).getByRole("button", { name: "Als Standard" })).toBeVisible();
  });

  it("maps a refused name to its own fixed sentence", async () => {
    const refused = {
      detail: [{ type: "value_error", loc: ["body", "name"], msg: "String should have at most" }],
    };
    stubRoutes(profileStubs({ "POST /document-templates": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Lebenslauf-Vorlage hochladen"), html());
    expect(
      await screen.findByText(
        "Der Dateiname taugt nicht als Vorlagenname. Benenne die Datei um (1–100 Zeichen).",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/ungültige Platzhalter/)).toBeNull();
    expect(screen.queryByText(/should have/)).toBeNull();
  });

  it("ignores a second pick while an upload runs", async () => {
    let answer: (response: Response) => void = () => {};
    const calls = stubRoutes(
      profileStubs({
        "POST /document-templates": () => new Promise<Response>((resolve) => (answer = resolve)),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Lebenslauf-Vorlage hochladen"), html());
    await waitFor(() => expect(cvUpload().closest("li")).toHaveAttribute("aria-busy", "true"));
    await userEvent.upload(cvUpload(), html());
    answer(jsonResponse(200, created));
    expect(await screen.findByText(/„lebenslauf_2026“ hochgeladen\./)).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("ignores a second pick while the first file is still being read", async () => {
    let finishReading: (text: string) => void = () => {};
    const slow = html();
    // The first file's text arrives only when the test says so: the read window stays open.
    slow.text = () => new Promise<string>((resolve) => (finishReading = resolve));
    const calls = stubRoutes(profileStubs({ "POST /document-templates": created }));
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Lebenslauf-Vorlage hochladen");
    fireEvent.change(cvUpload(), { target: { files: [slow] } });
    fireEvent.change(cvUpload(), { target: { files: [html("<p>second</p>")] } });
    finishReading("<p>first</p>");
    expect(await screen.findByText(/„lebenslauf_2026“ hochgeladen\./)).toBeVisible();
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!.body!)).toMatchObject({ html: "<p>first</p>" });
  });

  it("a refused file does not hold the guard: the next pick uploads", async () => {
    const calls = stubRoutes(profileStubs({ "POST /document-templates": created }));
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Lebenslauf-Vorlage hochladen");
    fireEvent.change(cvUpload(), { target: { files: [html("x".repeat(1_000_001))] } });
    expect(await screen.findByText("Die Vorlage ist größer als 1 MB.")).toBeVisible();
    fireEvent.change(cvUpload(), { target: { files: [html()] } });
    expect(await screen.findByText(/„lebenslauf_2026“ hochgeladen\./)).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("a file that cannot be read says so and does not hold the guard: the next pick uploads", async () => {
    const unreadable = html();
    unreadable.text = () => Promise.reject(new DOMException("gone", "NotReadableError"));
    const calls = stubRoutes(profileStubs({ "POST /document-templates": created }));
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Lebenslauf-Vorlage hochladen");
    fireEvent.change(cvUpload(), { target: { files: [unreadable] } });
    expect(
      await screen.findByText("Etwas ist schiefgelaufen. Bitte versuche es erneut."),
    ).toBeVisible();
    fireEvent.change(cvUpload(), { target: { files: [html()] } });
    expect(await screen.findByText(/„lebenslauf_2026“ hochgeladen\./)).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  describe("with a ticking clock", () => {
    beforeEach(() =>
      vi.useFakeTimers({
        toFake: ["Date", "setInterval", "clearInterval"],
        shouldAdvanceTime: true,
      }),
    );
    afterEach(() => vi.useRealTimers());

    it("a processing card turns stalled when the clock passes the limit, without a refetch", async () => {
      const start = new Date(Date.now() - TEMPLATE_STALL_MS + CLOCK_TICK_MS / 2).toISOString();
      const calls = stubRoutes(
        profileStubs({
          "GET /document-templates": [{ ...created, created_at: start, updated_at: start }],
        }),
      );
      renderWithProviders(<ProfilePage />);
      const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
      expect(card).toHaveTextContent("KI setzt Platzhalter ein …");
      const reads = calls.length;
      act(() => vi.advanceTimersByTime(CLOCK_TICK_MS));
      expect(card).toHaveTextContent("Das dauert ungewöhnlich lange.");
      expect(card).not.toHaveAttribute("aria-busy");
      expect(calls).toHaveLength(reads);
    });
  });
});
