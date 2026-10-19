import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const UNPROCESSABLE = 422;
const BAD_REQUEST = 400;
const OK = 200;
const NEVER = () => new Promise<Response>(() => {});
const REQUEST_TIMEOUT = 408;
const CHECKING =
  "Seite wird geladen und nach Stellenlinks durchsucht. Das kann bis zu einer Minute dauern.";
const PREVIEW = "POST /platforms/preview-links";
const PATTERN = "POST /platforms/url-pattern";
const DERIVED = { url_pattern: "/jobsuche/p/" };
const FOUND_URL = "https://www.get-in-it.de/jobsuche?q=java";
const LINKS = {
  links: [
    { url: "https://www.get-in-it.de/jobsuche/p/java-1", text: "Java" },
    { url: "https://www.get-in-it.de/jobsuche/p/go-2", text: "Go" },
  ],
};

const ONE_LINK = { links: [LINKS.links[0]!] };
const NAVIGATION_LINK = { url: "https://www.get-in-it.de/unternehmen/top", text: "Unternehmen" };

/** A preview answer that waits until the test resolves it. */
function pendingPreview() {
  const pending: { answer: (value: Response) => void } = { answer: () => {} };
  const respond = () => new Promise<Response>((resolve) => (pending.answer = resolve));
  return { pending, respond };
}

const wizard = () => screen.findByRole("dialog", { name: "Quelle hinzufügen" });

async function check(url: string) {
  const dialog = await wizard();
  await userEvent.type(within(dialog).getByLabelText("Adresse einer Suchergebnisseite"), url);
  await userEvent.click(within(dialog).getByRole("button", { name: "Seite prüfen" }));
  return dialog;
}

beforeEach(async () => {
  // A wizard closed by the previous test schedules its focus fallback for the next frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  liveNavigation.reset("add=1");
});
afterEach(() => vi.unstubAllGlobals());

describe("add wizard, steps 1 and 2", () => {
  it("?add=1 opens step 1 as the current step", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await wizard();
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Seite prüfen",
    );
  });

  it("an address that is already a source is caught before the check", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    await screen.findByRole("link", { name: "StepStone" });
    const dialog = await check(SOURCE_A.url);
    expect(await within(dialog).findByText("Diese Quelle gibt es schon.")).toBeInTheDocument();
    expect(calls.some((call) => call.url.endsWith("/platforms/preview-links"))).toBe(false);
  });

  it("the link to the existing source opens its drawer without asking", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    await screen.findByRole("link", { name: "StepStone" });
    const dialog = await check(SOURCE_A.url);
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "„StepStone“ ansehen" }),
    );
    expect(await screen.findByRole("dialog", { name: "Quelle StepStone" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Änderungen verwerfen" })).toBeNull();
  });

  it("an address that is not a complete link is caught before the check", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await check("get-in-it.de");
    expect(
      await within(dialog).findByText(
        "Bitte einen vollständigen Link angeben, der mit https:// beginnt.",
      ),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.url.endsWith("/platforms/preview-links"))).toBe(false);
  });

  it("a refused address shows on the field", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: () =>
        jsonResponse(UNPROCESSABLE, {
          detail: [{ loc: ["body", "url"], msg: "url_not_public", type: "value_error" }],
        }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("http://10.0.0.5/jobs");
    expect(
      await within(dialog).findByText("Diese Adresse kann nicht geprüft werden."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("url_not_public")).toBeNull();
  });

  it("an address the server rejects as invalid (400) shows the same fixed text", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: () => jsonResponse(BAD_REQUEST, { detail: "Invalid URL" }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://www.get-in-it.de/jobsuche");
    expect(
      await within(dialog).findByText("Diese Adresse kann nicht geprüft werden."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Invalid URL")).toBeNull();
  });

  it("a page that cannot be loaded says so on the field", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: () => jsonResponse(500, { detail: "Failed to fetch links from platform" }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://www.get-in-it.de/jobsuche");
    expect(
      await within(dialog).findByText("Die Seite konnte nicht geladen werden."),
    ).toBeInTheDocument();
  });

  it("any other client error (408) reads as a page that could not be loaded", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: () => jsonResponse(REQUEST_TIMEOUT, { detail: "Request Timeout" }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://www.get-in-it.de/jobsuche");
    expect(
      await within(dialog).findByText("Die Seite konnte nicht geladen werden."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Diese Adresse kann nicht geprüft werden.")).toBeNull();
  });

  it("editing the address during the check drops the result of the old address", async () => {
    const { pending, respond } = pendingPreview();
    sourcesStubs(undefined, { [PREVIEW]: respond });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.type(within(dialog).getByLabelText("Adresse einer Suchergebnisseite"), "x");
    pending.answer(jsonResponse(OK, LINKS));
    // Let the late answer run through fetch, parsing and the check's handler before looking.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Seite prüfen" })).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    expect(within(dialog).queryByText(/Links? gefunden/)).toBeNull();
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Seite prüfen",
    );
  });

  it("the start of a check is announced once in the wizard's live region", async () => {
    const { respond } = pendingPreview();
    sourcesStubs(undefined, { [PREVIEW]: respond });
    renderWithProviders(<SourcesPage />);
    const status = within(await wizard()).getByRole("status");
    expect(status).toHaveTextContent("");
    await check(FOUND_URL);
    await waitFor(() => expect(status).toHaveTextContent(CHECKING));
  });

  it("the live region goes quiet when the check settles and a second check is read again", async () => {
    const { pending, respond } = pendingPreview();
    sourcesStubs(undefined, { [PREVIEW]: respond });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    const status = within(dialog).getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(CHECKING));
    pending.answer(jsonResponse(OK, { links: [] }));
    await within(dialog).findByText(/keine Links gefunden/);
    await waitFor(() => expect(status).toHaveTextContent(""));
    await userEvent.click(within(dialog).getByRole("button", { name: "Seite prüfen" }));
    await waitFor(() => expect(status).toHaveTextContent(CHECKING));
  });

  it("one found link reads in the singular", async () => {
    sourcesStubs(undefined, { [PREVIEW]: { links: [...ONE_LINK.links] } });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    expect(
      await within(dialog).findByText("Auf www.get-in-it.de wurde 1 Link gefunden."),
    ).toBeInTheDocument();
  });

  it("a pattern that one of the found links contains reads in the singular", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: { links: [LINKS.links[0]!, NAVIGATION_LINK] },
      [PATTERN]: DERIVED,
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    expect(
      await within(dialog).findByText("1 von 2 gefundenen Links enthält dieses Muster."),
    ).toBeInTheDocument();
  });

  it("a page without links stays on step 1", async () => {
    sourcesStubs(undefined, { [PREVIEW]: { links: [] } });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://leer.example.com/jobs");
    expect(await within(dialog).findByText(/keine Links gefunden/)).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Seite prüfen",
    );
  });

  it("found links show unselected with the reason to choose and the pattern still pending", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    expect(
      await within(dialog).findByText("Auf www.get-in-it.de wurden 2 Links gefunden."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Aus deiner Auswahl leitet die App das URL-Muster ab/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("0 ausgewählt")).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("checkbox", { checked: true })).toHaveLength(0);
    expect(
      within(dialog).getByText(/dann erscheint hier das abgeleitete Muster/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("URL-Muster")).toBeNull();
  });

  it("the server derives the pattern from the chosen links; the user may edit it", async () => {
    const calls = sourcesStubs(undefined, { [PREVIEW]: LINKS, [PATTERN]: DERIVED });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    const field = within(dialog).getByLabelText("URL-Muster");
    await waitFor(() => expect(field).toHaveValue("/jobsuche/p/"));
    const sent = calls.find((call) => call.url.endsWith("/platforms/url-pattern"));
    expect(JSON.parse(sent!.body!)).toEqual({ selected_urls: [LINKS.links[0]!.url] });
    expect(
      within(dialog).getByText("2 von 2 gefundenen Links enthalten dieses Muster."),
    ).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText("URL-Muster"));
    await userEvent.type(within(dialog).getByLabelText("URL-Muster"), "/nirgends/");
    expect(
      within(dialog).getByText("Kein gefundener Link enthält dieses Muster."),
    ).toBeInTheDocument();
  });

  it("Weiter needs the pattern confirmed and puts focus on Muster passt", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS, [PATTERN]: DERIVED });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText("URL-Muster")).toHaveValue("/jobsuche/p/"),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Bestätige das Muster mit „Muster passt“ oder passe es an.",
    );
    const ok = within(dialog).getByRole("checkbox", { name: "Muster passt" });
    await waitFor(() => expect(ok).toHaveFocus());
    await userEvent.click(ok);
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Name und Zeitplan",
    );
  });

  it("a selection change while its pattern is derived refuses Weiter and the old confirmation", async () => {
    const answers = [() => jsonResponse(OK, DERIVED), NEVER];
    sourcesStubs(undefined, { [PREVIEW]: LINKS, [PATTERN]: () => answers.shift()!() });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    const field = within(dialog).getByLabelText("URL-Muster");
    await waitFor(() => expect(field).toHaveValue("/jobsuche/p/"));
    const ok = within(dialog).getByRole("checkbox", { name: "Muster passt" });
    await userEvent.click(ok);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Go/ }));
    expect([ok.hasAttribute("disabled"), (ok as HTMLInputElement).checked]).toEqual([true, false]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Das Muster wird noch abgeleitet. Bestätige es, sobald es erscheint.",
    );
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Stellenlinks wählen",
    );
  });

  it("editing a confirmed pattern asks for the confirmation again", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS, [PATTERN]: DERIVED });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText("URL-Muster")).toHaveValue("/jobsuche/p/"),
    );
    const ok = within(dialog).getByRole("checkbox", { name: "Muster passt" });
    await userEvent.click(ok);
    await userEvent.type(within(dialog).getByLabelText("URL-Muster"), "java");
    expect(ok).not.toBeChecked();
  });

  it("a pattern the server cannot derive asks the user to enter one", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: LINKS,
      [PATTERN]: () => jsonResponse(UNPROCESSABLE, { detail: [] }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Java/ }));
    expect(
      await within(dialog).findByText(
        "Das Muster konnte nicht abgeleitet werden. Gib es selbst ein.",
      ),
    ).toBeInTheDocument();
  });

  it("Weiter without a chosen link says so", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Keine" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Wähle mindestens einen Link.");
    expect(within(dialog).getByText("0 ausgewählt")).toBeInTheDocument();
  });

  it("Weiter without a chosen link puts focus on the first link (ruling 16)", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Keine" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("checkbox", { name: /Java/ })).toHaveFocus(),
    );
  });

  it("a refused address keeps step 1 and puts focus on the address (ruling 16)", async () => {
    sourcesStubs(undefined, {
      [PREVIEW]: () =>
        jsonResponse(UNPROCESSABLE, {
          detail: [{ loc: ["body", "url"], msg: "url_not_public", type: "value_error" }],
        }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("http://10.0.0.5/jobs");
    await within(dialog).findByText("Diese Adresse kann nicht geprüft werden.");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Adresse einer Suchergebnisseite")).toHaveFocus(),
    );
  });

  it("a step change puts focus on the new step's first field", async () => {
    sourcesStubs(undefined, { [PREVIEW]: LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await check(FOUND_URL);
    await waitFor(() => expect(within(dialog).getByLabelText("Links filtern")).toHaveFocus());
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurück" }));
    const address = within(dialog).getByLabelText("Adresse einer Suchergebnisseite");
    await waitFor(() => expect(address).toHaveFocus());
    expect(address).toHaveValue(FOUND_URL);
  });

  it("closing during the check asks first and then drops the late result", async () => {
    let answer: (value: Response) => void = () => {};
    sourcesStubs(undefined, {
      [PREVIEW]: () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderWithProviders(<SourcesPage />);
    await check(FOUND_URL);
    expect(await screen.findAllByText(CHECKING)).not.toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Änderungen verwerfen" }));
    answer(jsonResponse(OK, LINKS));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quelle hinzufügen" })).toBeNull(),
    );
    expect(screen.queryByText(/Links gefunden/)).toBeNull();
    expect(liveNavigation.replace).toHaveBeenLastCalledWith("/sources", { scroll: false });
  });
});
