import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageStatusBody } from "@/api/settings";
import { createQueryClient } from "@/api/queryClient";
import { API_BASE_URL } from "@/config";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const HTTP_OK = 200;
const HTTP_SERVER_ERROR = 500;
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
const DRIVE_EMAIL = "jonas@example.com";
const STATUS_PATH = "/storage/status";
const NOT_CONNECTED: StorageStatusBody = {
  available: true,
  connected: false,
  active: "NONE",
  email: null,
};
const CONNECTED: StorageStatusBody = {
  available: true,
  connected: true,
  active: "GOOGLE_DRIVE",
  email: DRIVE_EMAIL,
};
const UNAVAILABLE: StorageStatusBody = { ...NOT_CONNECTED, available: false };

const callsTo = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && new URL(call.url).pathname === path);
const driveRadio = () => screen.findByRole("radio", { name: "Google Drive" });
const databaseRadio = () => screen.findByRole("radio", { name: "Datenbank" });
const connectButton = () => screen.findByRole("button", { name: "Mit Google Drive verbinden" });
/** Answers each GET /storage/status from `state.current`, so a test can change the server state. */
const liveStatus = (state: { current: StorageStatusBody }) => () =>
  jsonResponse(HTTP_OK, state.current);
const never = () => new Promise<Response>(() => undefined);
/** Holds every POST /storage/toggle; release(status) answers that call. */
function heldToggles() {
  const releases: ((status: number) => void)[] = [];
  const respond = () =>
    new Promise<Response>((resolve) => {
      releases.push((status) => resolve(jsonResponse(status, { status: "x" })));
    });
  return { releases, respond };
}
// A released answer runs through fetch, the JSON parse and the mutation callbacks.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe("Speicherort: choices", () => {
  it("disables the Drive radio with the reason when Drive is not available", async () => {
    stubRoutes(settingsStubs({ "GET /storage/status": UNAVAILABLE }));
    renderWithProviders(<SettingsPage />);
    const radio = await driveRadio();
    expect(radio).toBeDisabled();
    const reason = screen.getByText("Google Drive ist auf diesem Server nicht eingerichtet.");
    expect(reason).toBeVisible();
    expect(radio.getAttribute("aria-describedby")?.split(" ")).toContain(reason.id);
    expect(screen.queryByRole("button", { name: "Mit Google Drive verbinden" })).toBeNull();
  });

  it("checks the active service", async () => {
    stubRoutes(settingsStubs({ "GET /storage/status": CONNECTED }));
    renderWithProviders(<SettingsPage />);
    expect(await driveRadio()).toBeChecked();
    expect(await databaseRadio()).not.toBeChecked();
    expect(screen.getByText(`Verbunden als ${DRIVE_EMAIL}`)).toBeVisible();
  });

  it("choosing Datenbank posts the toggle and toasts", async () => {
    const calls = stubRoutes(
      settingsStubs({
        "GET /storage/status": CONNECTED,
        "POST /storage/toggle": { status: "success", service: "NONE" },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await databaseRadio());
    expect(await screen.findByText("Speicherort gespeichert.")).toBeVisible();
    const [post] = callsTo(calls, "POST", "/storage/toggle");
    expect(JSON.parse(post!.body!)).toEqual({ service: "NONE" });
  });

  it("shows the pending choice and marks the choices busy while saving", async () => {
    stubRoutes(settingsStubs({ "GET /storage/status": CONNECTED, "POST /storage/toggle": never }));
    renderWithProviders(<SettingsPage />);
    const database = await databaseRadio();
    await userEvent.click(database);
    const group = screen.getByRole("group", { name: "Speicherort" });
    await waitFor(() => expect(group).toHaveAttribute("aria-busy", "true"));
    expect(database).toBeChecked();
    expect(database).toHaveFocus();
  });

  it("falls back to the stored service and toasts when the toggle fails", async () => {
    stubRoutes(
      settingsStubs({
        "GET /storage/status": CONNECTED,
        "POST /storage/toggle": () => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await databaseRadio());
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeVisible();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(await driveRadio()).toBeChecked();
  });

  // Controller ruling R11 (WCAG 3.2.2): choosing Drive before connecting changes nothing and
  // moves no focus; the radio is aria-disabled and says why.
  it("choosing Drive before connecting sends nothing and keeps the focus", async () => {
    const calls = stubRoutes(settingsStubs({ "GET /storage/status": NOT_CONNECTED }));
    renderWithProviders(<SettingsPage />);
    const radio = await driveRadio();
    expect(radio).toBeEnabled();
    expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(radio).toHaveAccessibleDescription(
      "Dateien liegen in deinem Google Drive. Erst mit Google Drive verbinden.",
    );
    await userEvent.click(radio);
    expect(radio).toHaveFocus();
    expect(radio).not.toBeChecked();
    expect(await databaseRadio()).toBeChecked();
    expect(callsTo(calls, "POST", "/storage/toggle")).toHaveLength(0);
  });

  it("arrowing onto Drive before connecting sends nothing and keeps the focus there", async () => {
    const calls = stubRoutes(settingsStubs({ "GET /storage/status": NOT_CONNECTED }));
    renderWithProviders(<SettingsPage />);
    (await databaseRadio()).focus();
    await userEvent.keyboard("{ArrowDown}");
    const radio = await driveRadio();
    expect(radio).toHaveFocus();
    expect(radio).not.toBeChecked();
    expect(callsTo(calls, "POST", "/storage/toggle")).toHaveLength(0);
  });

  it("a connected Drive radio is a plain choice", async () => {
    stubRoutes(settingsStubs({ "GET /storage/status": { ...CONNECTED, active: "NONE" } }));
    renderWithProviders(<SettingsPage />);
    const radio = await driveRadio();
    expect(radio).not.toHaveAttribute("aria-disabled");
    expect(radio).toHaveAccessibleDescription("Dateien liegen in deinem Google Drive.");
    expect(screen.queryByText("Erst mit Google Drive verbinden.")).toBeNull();
  });

  // Review M1: only the latest choice's answer toasts (as the time zone).
  it("toasts once for the latest of two quick choices", async () => {
    const held = heldToggles();
    stubRoutes(
      settingsStubs({ "GET /storage/status": CONNECTED, "POST /storage/toggle": held.respond }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await databaseRadio());
    await userEvent.click(await driveRadio());
    await waitFor(() => expect(held.releases).toHaveLength(2));
    held.releases[1]!(HTTP_OK);
    held.releases[0]!(HTTP_OK);
    await settle();
    await waitFor(() => expect(screen.getAllByText("Speicherort gespeichert.")).toHaveLength(1));
    await settle();
    expect(screen.getAllByText("Speicherort gespeichert.")).toHaveLength(1);
  });

  it("does not toast the failure of a superseded choice", async () => {
    const held = heldToggles();
    stubRoutes(
      settingsStubs({ "GET /storage/status": CONNECTED, "POST /storage/toggle": held.respond }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await databaseRadio());
    await userEvent.click(await driveRadio());
    await waitFor(() => expect(held.releases).toHaveLength(2));
    held.releases[0]!(HTTP_SERVER_ERROR);
    held.releases[1]!(HTTP_OK);
    expect(await screen.findByText("Speicherort gespeichert.")).toBeVisible();
    await settle();
    expect(screen.queryByText(SERVER_ERROR_TEXT)).toBeNull();
  });
});

describe("Speicherort: connect", () => {
  it("connect refreshes before navigating", async () => {
    const statusCallsAtAssign: number[] = [];
    const calls = stubRoutes(settingsStubs({ "GET /storage/status": NOT_CONNECTED }));
    const assign = vi.fn(() => {
      statusCallsAtAssign.push(callsTo(calls, "GET", STATUS_PATH).length);
    });
    vi.stubGlobal("location", { ...window.location, assign });
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await connectButton());
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(`${API_BASE_URL}/storage/google/login`),
    );
    expect(statusCallsAtAssign).toEqual([2]);
  });

  it("does not navigate and toasts when the refresh fails", async () => {
    const answers = [jsonResponse(HTTP_OK, NOT_CONNECTED)];
    stubRoutes(
      settingsStubs({
        "GET /storage/status": () =>
          answers.shift() ?? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }),
      }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderWithProviders(<SettingsPage />);
    const button = await connectButton();
    await userEvent.click(button);
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("aria-busy");
  });

  // Review M2: the pre-check is a user action; it fails at once instead of after the query retries.
  it("a failing refresh is asked once, with the app's retry policy in place", async () => {
    const answers = [jsonResponse(HTTP_OK, NOT_CONNECTED)];
    const calls = stubRoutes(
      settingsStubs({
        "GET /storage/status": () =>
          answers.shift() ?? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }),
      }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderWithProviders(<SettingsPage />, createQueryClient());
    await userEvent.click(await connectButton());
    expect(await screen.findByText(SERVER_ERROR_TEXT)).toBeVisible();
    expect(callsTo(calls, "GET", STATUS_PATH)).toHaveLength(2);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("Speicherort: Trennen", () => {
  it("Trennen asks first and then posts disconnect", async () => {
    const state = { current: CONNECTED };
    const calls = stubRoutes(
      settingsStubs({
        "GET /storage/status": liveStatus(state),
        "POST /storage/google/disconnect": () => {
          state.current = NOT_CONNECTED;
          return jsonResponse(HTTP_OK, { status: "disconnected" });
        },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Trennen" }));
    const dialog = await screen.findByRole("dialog", { name: "Google Drive trennen?" });
    expect(callsTo(calls, "POST", "/storage/google/disconnect")).toHaveLength(0);
    expect(
      within(dialog).getByText(
        "Neue Dateien werden danach in der Datenbank gespeichert. Bereits in Drive gespeicherte Dateien bleiben dort.",
      ),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Trennen" }));
    expect(await screen.findByText("Google Drive getrennt.")).toBeVisible();
    expect(callsTo(calls, "POST", "/storage/google/disconnect")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "Google Drive trennen?" })).toBeNull();
    // Preflight ruling 20: the opener is gone, so focus moves to the connect button, not <body>.
    await waitFor(async () => expect(await connectButton()).toHaveFocus());
    expect(await databaseRadio()).toBeChecked();
  });

  it("Abbrechen closes the question without disconnecting", async () => {
    const calls = stubRoutes(settingsStubs({ "GET /storage/status": CONNECTED }));
    renderWithProviders(<SettingsPage />);
    const opener = await screen.findByRole("button", { name: "Trennen" });
    await userEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Google Drive trennen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    expect(callsTo(calls, "POST", "/storage/google/disconnect")).toHaveLength(0);
  });

  it("Enter in the question confirms", async () => {
    const calls = stubRoutes(
      settingsStubs({
        "GET /storage/status": CONNECTED,
        "POST /storage/google/disconnect": { status: "disconnected" },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Trennen" }));
    const dialog = await screen.findByRole("dialog", { name: "Google Drive trennen?" });
    within(dialog).getByRole("button", { name: "Trennen" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(callsTo(calls, "POST", "/storage/google/disconnect")).toHaveLength(1),
    );
  });
});

describe("Speicherort: Drive not available any more", () => {
  const LEFT_CONNECTED: StorageStatusBody = { ...CONNECTED, available: false };

  it("still offers Trennen next to the reason", async () => {
    stubRoutes(settingsStubs({ "GET /storage/status": LEFT_CONNECTED }));
    renderWithProviders(<SettingsPage />);
    expect(await driveRadio()).toBeDisabled();
    expect(
      screen.getByText("Google Drive ist auf diesem Server nicht eingerichtet."),
    ).toBeVisible();
    expect(screen.getByText(`Verbunden als ${DRIVE_EMAIL}`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Trennen" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mit Google Drive verbinden" })).toBeNull();
  });

  // Preflight ruling 20: without a connect button the section heading takes the focus.
  it("moves the focus to the heading after Trennen", async () => {
    const state = { current: LEFT_CONNECTED };
    stubRoutes(
      settingsStubs({
        "GET /storage/status": liveStatus(state),
        "POST /storage/google/disconnect": () => {
          state.current = UNAVAILABLE;
          return jsonResponse(HTTP_OK, { status: "disconnected" });
        },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Trennen" }));
    const dialog = await screen.findByRole("dialog", { name: "Google Drive trennen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Trennen" }));
    const heading = screen.getByRole("heading", { level: 2, name: "Allgemein" });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe("Speicherort: OAuth callback", () => {
  it("the callback parameters show one notice and are removed", async () => {
    liveNavigation.reset("tab=storage&success=google_connected");
    stubRoutes(settingsStubs({ "GET /storage/status": CONNECTED }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Google Drive ist verbunden.")).toBeVisible();
    expect(liveNavigation.replace).toHaveBeenCalledTimes(1);
    expect(liveNavigation.replace).toHaveBeenCalledWith("/settings", { scroll: false });
    // The outcome is read once: the notice stays after the parameters left the URL.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByText("Google Drive ist verbunden.")).toBeVisible();
  });

  it("a failed callback shows the error notice", async () => {
    liveNavigation.reset("error=google_auth_failed");
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    const text = await screen.findByText(
      "Google Drive konnte nicht verbunden werden. Versuche es erneut.",
    );
    expect(text.closest(".notice")).toHaveClass("notice-error");
    expect(liveNavigation.replace).toHaveBeenCalledWith("/settings", { scroll: false });
  });

  it("without callback parameters there is no notice and no replace", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await databaseRadio();
    expect(screen.queryByText("Google Drive ist verbunden.")).toBeNull();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });
});
