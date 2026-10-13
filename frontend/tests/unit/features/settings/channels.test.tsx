import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBody } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs, STORED_NOTIFICATION_SETTINGS } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=notifications"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const SAVE_PATH = "/notification-settings";
const SAVED = { status: "saved" };
const RESEND_TEST = "/notification-settings/test-resend";
const SMTP_TEST = "/notification-settings/test-smtp";
const SHAPE_TEXT = "Bitte eine E-Mail-Adresse wie name@beispiel.de eingeben.";

const isPostTo = (path: string) => (call: RecordedCall) =>
  call.method === "POST" && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const form = (name: string) => screen.getByRole("form", { name });
const saveIn = (name: string) => within(form(name)).getByRole("button", { name: "Speichern" });
const openChannel = async (name: string) =>
  userEvent.click(await screen.findByRole("button", { name }));
/** Opens an email channel's test dialog and returns its recipient field. */
async function openTestDialog(name: string): Promise<HTMLElement> {
  await openChannel(name);
  const dialog = await screen.findByRole("dialog", { name: "Test-E-Mail senden" });
  return within(dialog).getByLabelText("Empfänger");
}

/** Platforms with notifications for the per-source overview. */
const PLATFORMS: PlatformBody[] = [
  {
    id: 7,
    name: "StepStone",
    url: "https://www.stepstone.de",
    notification_adapters: ["PUSHOVER", "SMTP"],
  },
  { id: 8, name: "Indeed", url: "https://de.indeed.com", notification_adapters: [] },
];

describe("channels", () => {
  it("shows the state from the channel booleans and never a secret", async () => {
    stubRoutes(settingsStubs());
    const { container } = renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Eingerichtet · smtp.example.com")).toBeVisible();
    expect(screen.getByText("Nicht eingerichtet")).toBeVisible(); // Mailjet
    expect(container.innerHTML).not.toContain("__masked__");
  });

  it("shows no channel state before both the settings and the channel booleans are there", async () => {
    stubRoutes(
      settingsStubs({ "GET /notification-settings/channels": () => new Promise(() => undefined) }),
    );
    renderWithProviders(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: "Benachrichtigungen" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Nicht eingerichtet")).toBeNull();
    expect(screen.queryByRole("button", { name: "SMTP ändern" })).toBeNull();
    const channels = screen.getByRole("region", { name: "Kanäle" });
    expect(within(channels).getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("Speichern sends only the changed SMTP field", async () => {
    const calls = stubRoutes(settingsStubs({ "POST /notification-settings": SAVED }));
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    const host = screen.getByLabelText("Server");
    await userEvent.clear(host);
    await userEvent.type(host, "mail.example.org");
    await userEvent.click(saveIn("SMTP"));
    await screen.findByText("Gespeichert.");
    expect(bodyOf(calls.find(isPostTo(SAVE_PATH)))).toEqual({ smtp_host: "mail.example.org" });
    await waitFor(() => expect(screen.getByRole("button", { name: "SMTP ändern" })).toHaveFocus());
  });

  it("a save refreshes the notification settings and the channel booleans, nothing broader", async () => {
    stubRoutes(settingsStubs({ "POST /notification-settings": SAVED }));
    const { queryClient } = renderWithProviders(<SettingsPage />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await openChannel("SMTP ändern");
    await userEvent.type(screen.getByLabelText("Benutzer"), "x");
    await userEvent.click(saveIn("SMTP"));
    await screen.findByText("Gespeichert.");
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.notificationSettings,
      queryKeys.channelStatus,
    ]);
  });

  it("an untouched secret is never sent and its input starts empty", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("Pushover ändern");
    const token = screen.getByLabelText("API-Token");
    expect(token).toHaveValue("");
    expect(token).toHaveAttribute("type", "password");
    expect(token).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByText("Gespeichert. Leer lassen, um ihn zu behalten.")).toBeVisible();
    expect(saveIn("Pushover")).toHaveAttribute("aria-disabled", "true");
  });

  it("a new channel needs every field before it is sent", async () => {
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("Mailjet einrichten");
    expect(screen.getAllByText("Noch nicht gespeichert.")).toHaveLength(2);
    await userEvent.type(screen.getByLabelText("Absender"), "mj@example.com");
    await userEvent.click(saveIn("Mailjet"));
    expect(within(form("Mailjet")).getAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(calls.some(isPostTo(SAVE_PATH))).toBe(false);
  });

  it("clearing a required field of a configured channel is refused", async () => {
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    await userEvent.clear(screen.getByLabelText("Server"));
    await userEvent.click(saveIn("SMTP"));
    expect(within(form("SMTP")).getByText("Bitte ausfüllen.")).toBeVisible();
    expect(calls.some(isPostTo(SAVE_PATH))).toBe(false);
  });

  it("a server refusal shows on its field, without a toast and without the server text", async () => {
    stubRoutes(
      settingsStubs({
        "POST /notification-settings": () =>
          jsonResponse(HTTP_UNPROCESSABLE, {
            detail: [{ loc: ["body", "smtp_user"], msg: "server says no", type: "x" }],
          }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    await userEvent.type(screen.getByLabelText("Benutzer"), "x");
    await userEvent.click(saveIn("SMTP"));
    expect(await within(form("SMTP")).findByText("Zu lang.")).toBeVisible();
    expect(screen.queryByText(/server says no/)).toBeNull();
  });

  it("Testen waits while the form is dirty", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    await userEvent.type(screen.getByLabelText("Benutzer"), "x");
    expect(screen.getByRole("button", { name: "Test über SMTP senden" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Erst speichern.")).toBeVisible();
  });

  it("maps a 400 of a test to its sentence", async () => {
    stubRoutes(
      settingsStubs({
        "POST /notification-settings/test-pushover": () =>
          jsonResponse(HTTP_BAD_REQUEST, { detail: "Pushover credentials not configured" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await openChannel("Test über Pushover senden");
    expect(
      await screen.findByText("Für Pushover fehlen Zugangsdaten oder Empfänger."),
    ).toBeVisible();
    expect(screen.queryByText(/credentials not configured/)).toBeNull();
  });

  it("maps a 429 of a test to the wait sentence", async () => {
    stubRoutes(
      settingsStubs({
        "POST /notification-settings/test-pushover": () =>
          jsonResponse(HTTP_TOO_MANY, { error: "Rate limit exceeded: 5 per 1 minute" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await openChannel("Test über Pushover senden");
    expect(await screen.findByText("Zu viele Anfragen, bitte kurz warten.")).toBeVisible();
    expect(screen.queryByText(/Rate limit exceeded/)).toBeNull();
  });

  it("an email test asks for the recipient, prefilled with the default one", async () => {
    const calls = stubRoutes(settingsStubs({ [`POST ${RESEND_TEST}`]: { ok: true } }));
    renderWithProviders(<SettingsPage />);
    await openChannel("Test über Resend senden");
    const dialog = await screen.findByRole("dialog", { name: "Test-E-Mail senden" });
    const recipient = within(dialog).getByLabelText("Empfänger");
    expect(recipient).toHaveValue("me@example.com");
    expect(recipient).toHaveFocus();
    await userEvent.clear(recipient);
    await userEvent.type(recipient, "other@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Senden" }));
    expect(await screen.findByText("Test über Resend gesendet.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bodyOf(calls.find(isPostTo(RESEND_TEST)))).toEqual({ recipient: "other@example.com" });
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
  ])("an %s test recipient with a stored default sends the default marker", async (_, typed) => {
    const calls = stubRoutes(settingsStubs({ [`POST ${RESEND_TEST}`]: { ok: true } }));
    renderWithProviders(<SettingsPage />);
    const recipient = await openTestDialog("Test über Resend senden");
    await userEvent.clear(recipient);
    await userEvent.paste(typed);
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(await screen.findByText("Test über Resend gesendet.")).toBeVisible();
    expect(bodyOf(calls.find(isPostTo(RESEND_TEST)))).toEqual({ recipient: "" });
  });

  it("without a stored default the test recipient is required and has no fallback hint", async () => {
    const calls = stubRoutes(
      settingsStubs({
        "GET /settings": { ...STORED_NOTIFICATION_SETTINGS, email_global_recipient: null },
      }),
    );
    renderWithProviders(<SettingsPage />);
    const recipient = await openTestDialog("Test über Resend senden");
    expect(recipient).toHaveValue("");
    expect(screen.queryByText("Leer lassen für den Standard-Empfänger.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(screen.getByText("Bitte ausfüllen.")).toBeVisible();
    expect(calls.some(isPostTo(RESEND_TEST))).toBe(false);
  });

  it("an email test refuses an odd address before sending", async () => {
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    const recipient = await openTestDialog("Test über SMTP senden");
    await userEvent.clear(recipient);
    await userEvent.type(recipient, "a@b");
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(screen.getByText(SHAPE_TEXT)).toBeVisible();
    expect(calls.some(isPostTo(SMTP_TEST))).toBe(false);
  });

  it("an email test shows the server's 422 on the recipient field, without its text", async () => {
    const calls = stubRoutes(
      settingsStubs({
        [`POST ${SMTP_TEST}`]: () =>
          jsonResponse(HTTP_UNPROCESSABLE, {
            detail: [{ loc: ["body", "recipient"], msg: "bad", type: "x" }],
          }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await openTestDialog("Test über SMTP senden");
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(calls.some(isPostTo(SMTP_TEST))).toBe(true));
    const dialog = screen.getByRole("dialog", { name: "Test-E-Mail senden" });
    expect(await within(dialog).findByText(SHAPE_TEXT)).toBeVisible();
    expect(screen.queryByText("bad")).toBeNull();
  });

  it("Kanal entfernen asks, then sends null for every field of the channel", async () => {
    const calls = stubRoutes(settingsStubs({ "POST /notification-settings": SAVED }));
    renderWithProviders(<SettingsPage />);
    await openChannel("Resend ändern");
    await userEvent.click(screen.getByRole("button", { name: "Kanal entfernen" }));
    const dialog = await screen.findByRole("dialog", { name: "Zugangsdaten für Resend löschen?" });
    expect(calls.some(isPostTo(SAVE_PATH))).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kanal entfernen" }));
    await waitFor(() => expect(calls.some(isPostTo(SAVE_PATH))).toBe(true));
    expect(bodyOf(calls.find(isPostTo(SAVE_PATH)))).toEqual({
      resend_api_key: null,
      resend_from_email: null,
    });
    expect(await screen.findByText("Zugangsdaten für Resend gelöscht.")).toBeVisible();
    // The stub still reports Resend as set up, so its toggle is "ändern" again.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resend ändern" })).toHaveFocus(),
    );
  });

  it("switching from a dirty form asks first; staying keeps the draft", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    await userEvent.type(screen.getByLabelText("Benutzer"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Pushover ändern" }));
    const guard = await screen.findByRole("dialog");
    await userEvent.click(within(guard).getByRole("button", { name: "Weiter bearbeiten" }));
    expect(screen.getByLabelText("Benutzer")).toHaveValue("smtp-userx");
    expect(screen.queryByRole("form", { name: "Pushover" })).toBeNull();
  });

  it("switching from a clean form opens the other channel at once", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await openChannel("SMTP ändern");
    await userEvent.click(screen.getByRole("button", { name: "Pushover ändern" }));
    expect(await screen.findByRole("form", { name: "Pushover" })).toBeVisible();
    expect(screen.queryByRole("form", { name: "SMTP" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the default recipient saves the trimmed address, and empty as null", async () => {
    const calls = stubRoutes(settingsStubs({ "POST /notification-settings": SAVED }));
    renderWithProviders(<SettingsPage />);
    const field = within(
      await screen.findByRole("form", { name: "Standard-Empfänger" }),
    ).getByLabelText("E-Mail-Adresse");
    await userEvent.clear(field);
    await userEvent.type(field, "  neu@example.com ");
    await userEvent.click(saveIn("Standard-Empfänger"));
    await screen.findByText("Gespeichert.");
    await userEvent.clear(field);
    await userEvent.click(saveIn("Standard-Empfänger"));
    await waitFor(() => expect(calls.filter(isPostTo(SAVE_PATH))).toHaveLength(2));
    expect(calls.filter(isPostTo(SAVE_PATH)).map(bodyOf)).toEqual([
      { email_global_recipient: "neu@example.com" },
      { email_global_recipient: null },
    ]);
  });

  it("the per-source overview links every notifying source to its drawer", async () => {
    stubRoutes(settingsStubs({ "GET /platforms": PLATFORMS }));
    renderWithProviders(<SettingsPage />);
    const link = await screen.findByRole("link", { name: "StepStone: Pushover, SMTP" });
    expect(link).toHaveAttribute("href", "/sources?quelle=7");
    expect(screen.queryByRole("link", { name: /Indeed/ })).toBeNull();
  });

  it("the per-source overview says when no source notifies", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Keine Quelle benachrichtigt.")).toBeVisible();
  });
});
