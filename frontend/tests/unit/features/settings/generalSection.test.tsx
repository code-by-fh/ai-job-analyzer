import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs, STORED_NOTIFICATION_SETTINGS } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const STORED_ZONE = "Europe/Berlin";
const CHOSEN_ZONE = "Europe/Vienna";
const LATER_ZONE = "Asia/Tokyo";
const HTTP_OK = 200;
const HTTP_SERVER_ERROR = 500;
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";

const zoneSelect = () => screen.findByLabelText("Zeitzone");
/** Holds every POST /timezone-preference; each release answers the zone that call sent, 200 by default. */
function heldTimezoneSaves() {
  const releases: ((status?: number) => void)[] = [];
  const respond = (call: RecordedCall) =>
    new Promise<Response>((resolve) => {
      const { timezone } = JSON.parse(call.body!) as { timezone: string };
      releases.push((status = HTTP_OK) =>
        resolve(jsonResponse(status, { status: "saved", timezone })),
      );
    });
  return { releases, respond };
}
// A released answer runs through fetch, the JSON parse and the mutation callbacks.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const posts = (calls: RecordedCall[], path: string) =>
  calls.filter((call) => call.method === "POST" && new URL(call.url).pathname === path);

describe("Allgemein: theme and language", () => {
  it("applies the theme at once", async () => {
    installFakeMatchMedia(false);
    stubRoutes(settingsStubs());
    renderWithProviders(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Dunkel" }));
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(screen.getByRole("button", { name: "Dunkel" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the language at once and stores it on the server", async () => {
    const calls = stubRoutes(
      settingsStubs({ "POST /language-preference": { status: "saved", language: "en" } }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { level: 2, name: "General" })).toBeVisible();
    const [post] = posts(calls, "/language-preference");
    expect(JSON.parse(post!.body!)).toEqual({ language: "en" });
  });

  it("says that the language also sets the language of AI texts", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText("Gilt für die Oberfläche und für Texte, die die KI schreibt."),
    ).toBeVisible();
  });
});

describe("Allgemein: time zone", () => {
  it("shows the stored zone with its hint", async () => {
    stubRoutes(
      settingsStubs({
        "GET /settings": { ...STORED_NOTIFICATION_SETTINGS, timezone: "Asia/Tokyo" },
      }),
    );
    renderWithProviders(<SettingsPage />);
    expect(await zoneSelect()).toHaveValue("Asia/Tokyo");
    expect(screen.getByText("Gilt für die Zeitpläne der Quellen.")).toBeVisible();
  });

  it("shows the server's default when no zone is stored", async () => {
    stubRoutes(
      settingsStubs({ "GET /settings": { ...STORED_NOTIFICATION_SETTINGS, timezone: null } }),
    );
    renderWithProviders(<SettingsPage />);
    expect(await zoneSelect()).toHaveValue(STORED_ZONE);
  });

  it("offers no zone before the stored one is known", async () => {
    stubRoutes(settingsStubs({ "GET /settings": () => new Promise<Response>(() => undefined) }));
    renderWithProviders(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: "Allgemein" });
    expect(screen.queryByLabelText("Zeitzone")).not.toBeInTheDocument();
  });

  it("saves the time zone on change and toasts", async () => {
    const calls = stubRoutes(
      settingsStubs({ "POST /timezone-preference": { status: "saved", timezone: CHOSEN_ZONE } }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.selectOptions(await zoneSelect(), CHOSEN_ZONE);
    expect(await screen.findByText("Zeitzone gespeichert.")).toBeVisible();
    const [post] = posts(calls, "/timezone-preference");
    expect(JSON.parse(post!.body!)).toEqual({ timezone: CHOSEN_ZONE });
    expect(await zoneSelect()).toHaveValue(CHOSEN_ZONE);
  });

  it("shows the zone the server stored, not the one sent", async () => {
    stubRoutes(
      settingsStubs({ "POST /timezone-preference": { status: "saved", timezone: STORED_ZONE } }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.selectOptions(await zoneSelect(), CHOSEN_ZONE);
    await screen.findByText("Zeitzone gespeichert.");
    expect(await zoneSelect()).toHaveValue(STORED_ZONE);
  });

  // Preflight rulings 20/25: aria-busy, not disabled, so the focused select keeps its focus.
  it("stays focusable and busy with the pending zone while saving", async () => {
    stubRoutes(
      settingsStubs({ "POST /timezone-preference": () => new Promise<Response>(() => undefined) }),
    );
    renderWithProviders(<SettingsPage />);
    const select = await zoneSelect();
    await userEvent.selectOptions(select, CHOSEN_ZONE);
    await waitFor(() => expect(select).toHaveAttribute("aria-busy", "true"));
    expect(select).toBeEnabled();
    expect(select).toHaveFocus();
    expect(select).toHaveValue(CHOSEN_ZONE);
  });

  it("keeps the latest choice when an earlier save answers last", async () => {
    const held = heldTimezoneSaves();
    stubRoutes(settingsStubs({ "POST /timezone-preference": held.respond }));
    const { queryClient } = renderWithProviders(<SettingsPage />);
    const select = await zoneSelect();
    await userEvent.selectOptions(select, CHOSEN_ZONE);
    await userEvent.selectOptions(select, LATER_ZONE);
    await waitFor(() => expect(held.releases).toHaveLength(2));
    held.releases[1]!();
    await settle();
    held.releases[0]!();
    await settle();
    expect(select).toHaveValue(LATER_ZONE);
    expect(queryClient.getQueryData(queryKeys.profileTimezone)).toBe(LATER_ZONE);
    expect(screen.getAllByText("Zeitzone gespeichert.")).toHaveLength(1);
  });

  it("does not report a superseded save that fails", async () => {
    const held = heldTimezoneSaves();
    stubRoutes(settingsStubs({ "POST /timezone-preference": held.respond }));
    renderWithProviders(<SettingsPage />);
    const select = await zoneSelect();
    await userEvent.selectOptions(select, CHOSEN_ZONE);
    await userEvent.selectOptions(select, LATER_ZONE);
    await waitFor(() => expect(held.releases).toHaveLength(2));
    held.releases[1]!();
    await settle();
    held.releases[0]!(HTTP_SERVER_ERROR);
    await settle();
    expect(screen.queryByText(SERVER_ERROR_TEXT)).not.toBeInTheDocument();
    expect(select).toHaveValue(LATER_ZONE);
  });

  // Preflight ruling 21: the toast region is always an alert, so the text is asserted.
  it("keeps the stored zone selected when the save fails", async () => {
    stubRoutes(
      settingsStubs({
        "POST /timezone-preference": () => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    const select = await zoneSelect();
    await userEvent.selectOptions(select, CHOSEN_ZONE);
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeVisible();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(select).toHaveValue(STORED_ZONE);
    expect(select).not.toHaveAttribute("aria-busy");
  });
});
