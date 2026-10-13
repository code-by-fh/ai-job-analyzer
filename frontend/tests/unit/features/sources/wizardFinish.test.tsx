import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBody, PlatformSetupBody } from "@/api/platforms";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { setupRequestOf } from "@/features/sources/wizard/useCreateSource";
import { INITIAL_WIZARD } from "@/features/sources/wizard/wizardState";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, SOURCE_B, sourcesStubs } from "../../support/sourcesRoutes";
import type { RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const OK = 200;
const BAD_REQUEST = 400;
const UNPROCESSABLE = 422;
const PREVIEW = "POST /platforms/preview-links";
const SETUP = "POST /platforms/setup";
const URL_ = "https://www.get-in-it.de/jobsuche?q=java";
const LINKS = {
  links: [
    { url: "https://www.get-in-it.de/jobsuche/p/java-1", text: "Java" },
    { url: "https://www.get-in-it.de/jobsuche/p/go-2", text: "Go" },
  ],
};
const NEVER = () => new Promise<Response>(() => {});
// A legacy row of the same address that never finished setup; the server reuses it (D15).
const PENDING: PlatformBody = {
  id: 9,
  name: "get-in-it.de",
  url: URL_,
  setup_status: "pending_setup",
};
const CREATED: PlatformSetupBody = {
  id: 9,
  name: "get-in-it Java",
  url: URL_,
  schedule_time: "08:00",
  schedule_days: [0, 1, 2, 3, 4],
  initial_crawl_started: false,
};

/** A 422 as FastAPI shapes it for one field of the setup body. */
const refused = (field: string) => () =>
  jsonResponse(UNPROCESSABLE, {
    detail: [{ loc: ["body", field], msg: "x", type: "value_error" }],
  });

/**
 * Preflight ruling 22: the list is stateful, so the refetch after the create still holds the new
 * source and the focused row stays mounted.
 */
function setupStubs(setup: unknown = CREATED, extra: RouteTable = {}): RecordedCall[] {
  const server = { created: false };
  const list = () =>
    jsonResponse(OK, server.created ? [SOURCE_A, SOURCE_B, CREATED] : [SOURCE_A, SOURCE_B]);
  const create = (call: RecordedCall) => {
    server.created = true;
    return typeof setup === "function" ? setup(call) : jsonResponse(OK, setup);
  };
  return sourcesStubs(list, { [PREVIEW]: LINKS, [SETUP]: create, ...extra });
}

async function toStep3() {
  const dialog = await screen.findByRole("dialog", { name: "Quelle hinzufügen" });
  await userEvent.type(within(dialog).getByLabelText("Adresse einer Suchergebnisseite"), URL_);
  await userEvent.click(within(dialog).getByRole("button", { name: "Seite prüfen" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: "Weiter" }));
  return dialog;
}

const setupBody = (calls: RecordedCall[]) =>
  JSON.parse(calls.find((call) => call.url.endsWith("/platforms/setup"))!.body!);
const setupCalls = (calls: RecordedCall[]) =>
  calls.filter((call) => call.url.endsWith("/platforms/setup"));
const setupSent = (calls: RecordedCall[]) => setupCalls(calls).length > 0;

beforeEach(async () => {
  // A wizard closed by the previous test schedules its focus fallback for the next frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  liveNavigation.reset("add=1");
});
afterEach(() => vi.unstubAllGlobals());

describe("setup request", () => {
  it("leaves out an empty name and pattern and sends the schedule pair", () => {
    const state = {
      ...INITIAL_WIZARD,
      url: URL_,
      selected: ["a"],
      schedule: { enabled: false, time: "08:00", days: [0] },
    };
    expect(setupRequestOf(state)).toEqual({
      url: URL_,
      selected_urls: ["a"],
      initial_run: "seed",
      schedule_time: null,
      schedule_days: null,
    });
  });

  it("trims name and pattern and sorts the days", () => {
    const state = {
      ...INITIAL_WIZARD,
      url: ` ${URL_} `,
      selected: ["a"],
      name: "  Java  ",
      pattern: " /p/ ",
      schedule: { enabled: true, time: "07:30", days: [2, 0] },
    };
    expect(setupRequestOf(state)).toEqual({
      url: URL_,
      selected_urls: ["a"],
      initial_run: "seed",
      name: "Java",
      schedule_time: "07:30",
      schedule_days: [0, 2],
      url_pattern: "/p/",
    });
  });
});

describe("add wizard, step 3", () => {
  it("Weiter puts focus on the name field", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveFocus());
    expect(within(dialog).getByLabelText("Bekannte Stellen merken")).toBeChecked();
  });

  it("sends name, schedule, first run and pattern, then shows the new row with focus on it", async () => {
    const calls = setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.type(within(dialog).getByLabelText("Name"), "get-in-it Java");
    await userEvent.click(within(dialog).getByLabelText("Noch nicht durchsuchen"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    await waitFor(() =>
      expect(setupBody(calls)).toEqual({
        url: URL_,
        selected_urls: LINKS.links.map((link) => link.url),
        initial_run: "none",
        name: "get-in-it Java",
        schedule_time: "08:00",
        schedule_days: [0, 1, 2, 3, 4],
      }),
    );
    expect(await screen.findByText("Quelle „get-in-it Java“ angelegt.")).toBeInTheDocument();
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false });
    await waitFor(() => expect(screen.getByRole("link", { name: "get-in-it Java" })).toHaveFocus());
  });

  it("creating needs no leave question", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quelle hinzufügen" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Änderungen verwerfen" })).toBeNull();
  });

  it("an analysis that started says the search is running", async () => {
    setupStubs({ ...CREATED, initial_crawl_started: true });
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByLabelText("Jetzt durchsuchen und alles bewerten"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(
      await screen.findByText("Quelle „get-in-it Java“ angelegt. Das Durchsuchen läuft."),
    ).toBeInTheDocument();
  });

  it("an analysis that did not start says so", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByLabelText("Jetzt durchsuchen und alles bewerten"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await screen.findByText(/Der erste Lauf konnte nicht starten/)).toBeInTheDocument();
  });

  it("a cleared time is caught before the request", async () => {
    const calls = setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.clear(within(dialog).getByLabelText("Uhrzeit"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Gib eine Uhrzeit wie 08:00 ein.");
    expect(setupSent(calls)).toBe(false);
    await waitFor(() => expect(within(dialog).getByLabelText("Uhrzeit")).toHaveFocus());
  });

  it("a 422 on the time stays on step 3 with focus on the time", async () => {
    setupStubs(refused("schedule_time"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await within(dialog).findByText("Gib eine Uhrzeit wie 08:00 ein.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText("Uhrzeit")).toHaveFocus());
  });

  it("a 422 on the days stays on step 3 with focus on the first day", async () => {
    setupStubs(refused("schedule_days"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await within(dialog).findByText("Wähle mindestens einen Tag.")).toBeInTheDocument();
    const days = within(dialog).getByRole("group", { name: "Wochentage" });
    await waitFor(() => expect(within(days).getByRole("button", { name: "Mo" })).toHaveFocus());
  });

  it("a second click before the wizard has closed sends one request", async () => {
    const calls = setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    liveNavigation.defer();
    const create = within(dialog).getByRole("button", { name: "Quelle anlegen" });
    await userEvent.click(create);
    await screen.findByText("Quelle „get-in-it Java“ angelegt.");
    await userEvent.click(create);
    liveNavigation.release();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quelle hinzufügen" })).toBeNull(),
    );
    expect(setupCalls(calls)).toHaveLength(1);
  });

  it("a reused pending row is replaced, not listed twice", async () => {
    const server = { created: false };
    sourcesStubs(
      () => (server.created ? NEVER() : jsonResponse(OK, [SOURCE_A, SOURCE_B, PENDING])),
      {
        [PREVIEW]: LINKS,
        [SETUP]: () => {
          server.created = true;
          return jsonResponse(OK, CREATED);
        },
      },
    );
    renderWithProviders(<SourcesPage />);
    await screen.findByRole("link", { name: "get-in-it.de" });
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "get-in-it Java" })).toHaveFocus());
    expect(screen.getAllByRole("link", { name: "get-in-it Java" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "get-in-it.de" })).toBeNull();
  });

  it("Zurück and Weiter keep name, schedule and first run", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Java");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sa" }));
    await userEvent.click(within(dialog).getByLabelText("Noch nicht durchsuchen"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurück" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Java");
    expect(within(dialog).getByRole("button", { name: "Sa" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByLabelText("Noch nicht durchsuchen")).toBeChecked();
  });

  it("closing on step 3 asks the leave question first", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    await toStep3();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "Änderungen verwerfen" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Quelle hinzufügen" })).toBeInTheDocument();
  });

  it("a 422 on the name stays on step 3 and shows on the field", async () => {
    setupStubs(refused("name"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.type(within(dialog).getByLabelText("Name"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(
      await within(dialog).findByText("Gib einen Namen mit höchstens 100 Zeichen ein."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveFocus());
  });

  it("a duplicate the server refuses (400) says so in a toast and keeps the wizard", async () => {
    setupStubs(() => jsonResponse(BAD_REQUEST, { detail: "Platform URL already exists" }));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await screen.findByText("Diese Quelle gibt es schon.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Quelle hinzufügen" })).toBeInTheDocument();
  });

  it("Zurück from step 3 keeps the selection", async () => {
    setupStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurück" }));
    expect(within(dialog).getByText("2 ausgewählt")).toBeInTheDocument();
  });
});

describe("a setup 422 jumps back to the field with the error (ruling 16, R12)", () => {
  it("a 422 on the pattern goes back to step 2 with Erweitert open and focus on the pattern", async () => {
    setupStubs(refused("url_pattern"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(
      await within(dialog).findByText("Gib ein Muster mit 1 bis 300 Zeichen ein, nicht nur „/“."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Erweitert" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await waitFor(() => expect(within(dialog).getByLabelText("URL-Muster")).toHaveFocus());
  });

  it("a 422 on the selected links shows on step 2 and puts focus on the first link", async () => {
    setupStubs(refused("selected_urls"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Wähle mindestens einen Link.",
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("checkbox", { name: /Java/ })).toHaveFocus(),
    );
  });

  it("a 422 on the address goes back to step 1 with focus on the address", async () => {
    setupStubs(refused("url"));
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(
      await within(dialog).findByText("Diese Adresse kann nicht geprüft werden."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Adresse einer Suchergebnisseite")).toHaveFocus(),
    );
  });
});
