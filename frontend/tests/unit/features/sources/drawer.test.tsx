import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { PENDING_SETUP } from "@/domain/sources";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, SOURCE_B, sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const UNPROCESSABLE = 422;
const BAD_REQUEST = 400;
const SUGGESTED = "StepStone Jobs";

const drawer = () => screen.findByRole("dialog", { name: "Quelle StepStone" });
const patches = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body!));
const invalid = (field: string) => () =>
  jsonResponse(UNPROCESSABLE, {
    detail: [{ loc: ["body", field], msg: "x", type: "value_error" }],
  });
const saveButtons = (panel: HTMLElement) =>
  within(panel).getAllByRole("button", { name: "Speichern" });

beforeEach(async () => {
  // A drawer closed by the previous test schedules its focus fallback for the next frame; let it
  // run on the empty document, so it cannot move focus in this test.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset("quelle=1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("source drawer", () => {
  it("opens for ?quelle=1 with its sections and the profile time zone", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    expect(within(panel).getByRole("heading", { name: "Quelle" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Zeitplan" })).toBeInTheDocument();
    expect(
      await within(panel).findByText("Uhrzeit in deiner Zeitzone (Europe/Berlin)."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("stepstone.de")).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Wochentage" })).toBeInTheDocument();
  });

  it("opens only once the source is in the loaded list", async () => {
    let answer: (response: Response) => void = () => {};
    sourcesStubs(() => new Promise<Response>((resolve) => (answer = resolve)));
    renderWithProviders(<SourcesPage />);
    await screen.findByRole("status", { busy: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    answer(jsonResponse(200, [SOURCE_A, SOURCE_B]));
    expect(await drawer()).toBeInTheDocument();
  });

  it("a section save sends only its own fields", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const name = within(panel).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "StepStone Kotlin");
    await userEvent.click(saveButtons(panel)[0]!);
    await waitFor(() => expect(patches(calls)).toEqual([{ name: "StepStone Kotlin" }]));
    expect(await screen.findByText("Gespeichert.")).toBeInTheDocument();
  });

  it("a section without changes sends nothing", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(saveButtons(panel)[0]!);
    expect(within(panel).queryByRole("alert")).toBeNull();
    expect(patches(calls)).toEqual([]);
  });

  it("shows the stored form after a save (the server keeps the canonical address)", async () => {
    const stored = { ...SOURCE_A, url: "https://www.stepstone.de/jobs/java" };
    let listed = [SOURCE_A, SOURCE_B];
    const calls = sourcesStubs(() => jsonResponse(200, listed), {
      "PATCH /platforms/1": () => {
        listed = [stored, SOURCE_B];
        return jsonResponse(200, stored);
      },
    });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const url = within(panel).getByLabelText("Adresse der Suchergebnisseite");
    await userEvent.clear(url);
    await userEvent.type(url, "https://WWW.StepStone.de/jobs/java");
    await userEvent.click(saveButtons(panel)[0]!);
    await waitFor(() => expect(url).toHaveValue(stored.url));
    expect(patches(calls)).toEqual([{ url: "https://WWW.StepStone.de/jobs/java" }]);
  });

  it("an enabled schedule needs a day", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    for (const day of ["Mo", "Di", "Mi", "Do", "Fr"]) {
      await userEvent.click(within(panel).getByRole("button", { name: day }));
    }
    await userEvent.click(saveButtons(panel)[1]!);
    expect(await within(panel).findByText("Wähle mindestens einen Tag.")).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("turning the schedule off sends nulls", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByLabelText("Automatisch durchsuchen"));
    await userEvent.click(saveButtons(panel)[1]!);
    await waitFor(() =>
      expect(patches(calls)).toEqual([{ schedule_time: null, schedule_days: null }]),
    );
  });

  it("turning a manual schedule on starts from Mo–Fr 08:00", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/2": SOURCE_B });
    liveNavigation.reset("quelle=2");
    renderWithProviders(<SourcesPage />);
    const panel = await screen.findByRole("dialog", { name: "Quelle Indeed" });
    await userEvent.click(within(panel).getByLabelText("Automatisch durchsuchen"));
    expect(within(panel).getByLabelText("Uhrzeit")).toHaveValue("08:00");
    await userEvent.click(saveButtons(panel)[1]!);
    await waitFor(() =>
      expect(patches(calls)).toEqual([{ schedule_time: "08:00", schedule_days: [0, 1, 2, 3, 4] }]),
    );
  });

  it("maps a 422 on schedule_time to the time field and never shows the server text", async () => {
    sourcesStubs(undefined, { "PATCH /platforms/1": invalid("schedule_time") });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByRole("button", { name: "Sa" }));
    await userEvent.click(saveButtons(panel)[1]!);
    expect(await within(panel).findByText("Gib eine Uhrzeit wie 08:00 ein.")).toBeInTheDocument();
    expect(within(panel).queryByText("x")).toBeNull();
  });

  it("a refused address shows on the URL field", async () => {
    sourcesStubs(undefined, { "PATCH /platforms/1": invalid("url") });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const url = within(panel).getByLabelText("Adresse der Suchergebnisseite");
    await userEvent.clear(url);
    await userEvent.type(url, "https://www.stepstone.de/jobs/java");
    await userEvent.click(saveButtons(panel)[0]!);
    expect(
      await within(panel).findByText("Diese Adresse kann nicht geprüft werden."),
    ).toBeInTheDocument();
  });

  it("another site or an existing source shows on the URL field, not as a toast", async () => {
    sourcesStubs(undefined, {
      "PATCH /platforms/1": () => jsonResponse(BAD_REQUEST, { detail: "Domain change" }),
    });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const url = within(panel).getByLabelText("Adresse der Suchergebnisseite");
    await userEvent.clear(url);
    await userEvent.type(url, "https://de.indeed.com/jobs");
    await userEvent.click(saveButtons(panel)[0]!);
    expect(await within(panel).findByText(/Diese Adresse geht hier nicht/)).toBeInTheDocument();
    expect(screen.queryByText("Unerwarteter Fehler.")).toBeNull();
    expect(screen.queryByText(/Domain change/)).toBeNull();
  });

  it("checks name, address and pattern before sending and opens Erweitert for the pattern", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.clear(within(panel).getByLabelText("Name"));
    await userEvent.clear(within(panel).getByLabelText("Adresse der Suchergebnisseite"));
    await userEvent.type(within(panel).getByLabelText("Adresse der Suchergebnisseite"), "jobs");
    await userEvent.click(within(panel).getByRole("button", { name: "Erweitert" }));
    await userEvent.clear(within(panel).getByLabelText("URL-Muster"));
    await userEvent.type(within(panel).getByLabelText("URL-Muster"), "/");
    await userEvent.click(within(panel).getByRole("button", { name: "Erweitert" }));
    await userEvent.click(saveButtons(panel)[0]!);
    expect(within(panel).getByText(/Gib einen Namen/)).toBeInTheDocument();
    expect(within(panel).getByText("Diese Adresse kann nicht geprüft werden.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Erweitert" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(panel).getByText(/Gib ein Muster/)).toBeVisible();
    expect(patches(calls)).toEqual([]);
  });

  it("Namen vorschlagen shows the name the server stored, without an unsaved change", async () => {
    const calls = sourcesStubs(undefined, {
      "POST /platforms/1/generate-name": { id: 1, name: SUGGESTED },
    });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByRole("button", { name: "Namen vorschlagen" }));
    await waitFor(() => expect(within(panel).getByLabelText("Name")).toHaveValue(SUGGESTED));
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(SUGGESTED);
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }),
    );
    expect(patches(calls)).toEqual([]);
  });

  it("a failed suggestion says so and keeps the name", async () => {
    sourcesStubs(undefined, {
      "POST /platforms/1/generate-name": () => jsonResponse(500, { detail: "boom" }),
    });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByRole("button", { name: "Namen vorschlagen" }));
    expect(await screen.findByText("Gerade kein Vorschlag möglich.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Name")).toHaveValue("StepStone");
  });

  it("a refetch does not overwrite a dirty draft, but a clean section adopts it", async () => {
    sourcesStubs();
    const { queryClient } = renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), " neu");
    queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
      list!.map((p) => (p.id === 1 ? { ...p, name: "Anders", schedule_time: "09:30" } : p)),
    );
    await waitFor(() => expect(within(panel).getByLabelText("Uhrzeit")).toHaveValue("09:30"));
    expect(within(panel).getByLabelText("Name")).toHaveValue("StepStone neu");
  });

  it("Escape with an unsaved name asks first and keeps the draft", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), "!");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Weiter bearbeiten" }));
    expect(within(await drawer()).getByLabelText("Name")).toHaveValue("StepStone!");
    expect(liveNavigation.replace).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Änderungen verwerfen" }));
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }),
    );
  });

  it("after closing a deep-linked drawer, focus lands on the source's row", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("link", { name: "StepStone" })).toHaveFocus());
  });

  it("a source whose setup never finished says how to finish it", async () => {
    sourcesStubs([{ ...SOURCE_A, setup_status: PENDING_SETUP }]);
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    expect(
      within(panel).getByText(/Die Einrichtung ist nicht abgeschlossen\. Lege/),
    ).toHaveTextContent(
      "Benachrichtigungen bleiben, Zeitplan und Muster kommen aus dem Assistenten.",
    );
  });

  it("repeats the crawl control of this source in the header", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    expect(
      within(panel).getByRole("button", { name: "StepStone jetzt durchsuchen" }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Seite öffnen/ })).toHaveAttribute(
      "href",
      SOURCE_A.url,
    );
  });
  it("Speichern is inactive while its section holds no change", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    expect(saveButtons(panel).map((b) => b.getAttribute("aria-disabled"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    await userEvent.type(within(panel).getByLabelText("Name"), "!");
    expect(saveButtons(panel)[0]).not.toHaveAttribute("aria-disabled");
    expect(saveButtons(panel)[1]).toHaveAttribute("aria-disabled", "true");
  });

  it("a legacy source with an unreadable stored address can still be renamed and paused", async () => {
    const legacy = { ...SOURCE_A, url: "stepstone-alt" };
    const calls = sourcesStubs([legacy], { "PATCH /platforms/1": legacy });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), " alt");
    await userEvent.click(within(panel).getByLabelText("Aktiv (wird durchsucht)"));
    await userEvent.click(saveButtons(panel)[0]!);
    await waitFor(() =>
      expect(patches(calls)).toEqual([{ name: "StepStone alt", is_active: false }]),
    );
    expect(within(panel).queryByText("Diese Adresse kann nicht geprüft werden.")).toBeNull();
  });

  it("edits hidden by switching the schedule off again are no unsaved change", async () => {
    liveNavigation.reset("quelle=2");
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await screen.findByRole("dialog", { name: "Quelle Indeed" });
    await userEvent.click(within(panel).getByLabelText("Automatisch durchsuchen"));
    fireEvent.change(within(panel).getByLabelText("Uhrzeit"), { target: { value: "07:30" } });
    await userEvent.click(within(panel).getByRole("button", { name: "Sa" }));
    await userEvent.click(within(panel).getByLabelText("Automatisch durchsuchen"));
    expect(saveButtons(panel)[1]).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }),
    );
    expect(screen.queryByRole("button", { name: "Weiter bearbeiten" })).toBeNull();
  });

  it("saving one of two edited sections still asks before closing", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), "!");
    await userEvent.click(within(panel).getByRole("button", { name: "Sa" }));
    await userEvent.click(saveButtons(panel)[0]!);
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    // The Quelle section is clean again only once its save answered; else Escape asks for it.
    await waitFor(() => expect(saveButtons(panel)[0]).toHaveAttribute("aria-disabled", "true"));
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "Weiter bearbeiten" })).toBeInTheDocument();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });
});
