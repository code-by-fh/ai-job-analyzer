import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBody } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { SettingsPage } from "@/features/settings/SettingsPage";
import {
  CHANNEL_TYPES,
  CHANNELS,
  PUSHOVER_CHANNEL,
  SMTP_CHANNEL,
} from "../../../e2e/support/notificationFixtures";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=notifications"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_BAD_GATEWAY = 502;
const CHANNEL_LIMIT = 20;
const SMTP_PATH = `/notifications/channels/${SMTP_CHANNEL.id}`;
const PUSHOVER_PATH = `/notifications/channels/${PUSHOVER_CHANNEL.id}`;
const DEFAULT_RECIPIENTS_TEXT =
  "An diese Adresse gehen Benachrichtigungen dieses Kanals, wenn eine Quelle keinen eigenen Empfänger festlegt.";

const callsTo = (calls: readonly RecordedCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && new URL(call.url).pathname === path);
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const form = (name: string) => screen.getByRole("form", { name });
const saveIn = (name: string) => within(form(name)).getByRole("button", { name: "Speichern" });
const click = async (name: string) => userEvent.click(await screen.findByRole("button", { name }));
const listOf = (items: unknown[]) => ({ items, total: items.length });

/** A source that notifies through Pushover and SMTP, and one that does not notify. */
const PLATFORMS: PlatformBody[] = [
  {
    id: 7,
    name: "StepStone",
    url: "https://www.stepstone.de",
    notification_channel_ids: [PUSHOVER_CHANNEL.id, SMTP_CHANNEL.id],
  },
  { id: 8, name: "Indeed", url: "https://de.indeed.com", notification_channel_ids: [] },
];

describe("channel list", () => {
  it("names each channel and its type in the service's words, never a secret", async () => {
    stubRoutes(settingsStubs());
    const { container } = renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Firmen-SMTP")).toBeVisible();
    expect(screen.getByText("E-Mail (SMTP)")).toBeVisible();
    expect(screen.getByText("E-Mail (Resend)")).toBeVisible();
    expect(container.innerHTML).not.toMatch(/"set"|not set/);
  });

  it("shows no row before the channel types are there", async () => {
    stubRoutes(
      settingsStubs({ "GET /notifications/channel-types": () => new Promise(() => undefined) }),
    );
    renderWithProviders(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: "Benachrichtigungen" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Firmen-SMTP")).toBeNull();
    const channels = screen.getByRole("region", { name: "Kanäle" });
    expect(within(channels).getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("says when the notification service is down, without the server's text", async () => {
    stubRoutes(
      settingsStubs({
        "GET /notifications/channels": () =>
          jsonResponse(HTTP_BAD_GATEWAY, { detail: "notification_service_unavailable" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    const channels = await screen.findByRole("region", { name: "Kanäle" });
    expect(
      await within(channels).findByText(/Der Benachrichtigungsdienst ist gerade nicht erreichbar/),
    ).toBeVisible();
    expect(screen.queryByText(/notification_service_unavailable/)).toBeNull();
  });

  it("says when there is no channel yet", async () => {
    stubRoutes(settingsStubs({ "GET /notifications/channels": listOf([]) }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Noch kein Kanal eingerichtet.")).toBeVisible();
  });
});

describe("editing a channel", () => {
  it("Speichern sends only the changed field and refreshes only the channels", async () => {
    const calls = stubRoutes(settingsStubs({ [`PATCH ${SMTP_PATH}`]: SMTP_CHANNEL }));
    const { queryClient } = renderWithProviders(<SettingsPage />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await click("Firmen-SMTP bearbeiten");
    const host = screen.getByLabelText("SMTP-Server");
    await userEvent.clear(host);
    await userEvent.type(host, "mail.example.org");
    await userEvent.click(saveIn("Firmen-SMTP"));
    await screen.findByText("Gespeichert.");
    expect(bodyOf(callsTo(calls, "PATCH", SMTP_PATH)[0])).toEqual({
      fields: { host: "mail.example.org" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Firmen-SMTP bearbeiten" })).toHaveFocus(),
    );
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.channels,
    ]);
  });

  it("the recipients field says what the channel's default recipients are for", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    expect(screen.getByLabelText("Empfänger")).toHaveValue("me@example.com");
    expect(screen.getByLabelText("Empfänger")).toHaveAccessibleDescription(
      `${DEFAULT_RECIPIENTS_TEXT} Mehrere Adressen mit Komma trennen.`,
    );
  });

  it("a stored secret shows only 'gesetzt'; Ersetzen opens an empty password input", async () => {
    const calls = stubRoutes(settingsStubs({ [`PATCH ${SMTP_PATH}`]: SMTP_CHANNEL }));
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    const group = screen.getByRole("group", { name: "Passwort" });
    expect(within(group).getByText("gesetzt")).toBeVisible();
    expect(within(group).queryByRole("button", { name: "Passwort entfernen" })).toBeNull();
    await userEvent.click(within(group).getByRole("button", { name: "Passwort ersetzen" }));
    const input = screen.getByLabelText("Passwort");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(saveIn("Firmen-SMTP")).toHaveAttribute("aria-disabled", "true");
    await userEvent.type(input, "neu-geheim");
    await userEvent.click(saveIn("Firmen-SMTP"));
    await screen.findByText("Gespeichert.");
    expect(bodyOf(callsTo(calls, "PATCH", SMTP_PATH)[0])).toEqual({
      fields: { password: "neu-geheim" },
    });
  });

  it("Behalten after Ersetzen keeps the stored secret and sends nothing", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    await click("Passwort ersetzen");
    await userEvent.type(screen.getByLabelText("Passwort"), "x");
    await click("Passwort behalten");
    expect(screen.getByRole("group", { name: "Passwort" })).toHaveTextContent("gesetzt");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Passwort ersetzen" })).toHaveFocus(),
    );
    expect(saveIn("Firmen-SMTP")).toHaveAttribute("aria-disabled", "true");
  });

  it("an optional secret can be removed: it is sent as null", async () => {
    const [pushover] = CHANNEL_TYPES;
    const optional = { ...pushover!.fields[1]!, required: false };
    const types = [{ ...pushover!, fields: [pushover!.fields[0]!, optional] }];
    const calls = stubRoutes(
      settingsStubs({
        "GET /notifications/channel-types": { items: types },
        [`PATCH ${PUSHOVER_PATH}`]: PUSHOVER_CHANNEL,
      }),
    );
    renderWithProviders(<SettingsPage />);
    await click("Mein Handy bearbeiten");
    expect(screen.queryByRole("button", { name: "API-Token entfernen" })).toBeNull();
    await click("User- oder Gruppen-Key entfernen");
    expect(screen.getByText("wird beim Speichern entfernt")).toBeVisible();
    await userEvent.click(saveIn("Mein Handy"));
    await screen.findByText("Gespeichert.");
    expect(bodyOf(callsTo(calls, "PATCH", PUSHOVER_PATH)[0])).toEqual({
      fields: { user_key: null },
    });
  });

  it("checks the schema before sending: a required field cannot be cleared", async () => {
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    await userEvent.clear(screen.getByLabelText("Benutzername"));
    await userEvent.click(saveIn("Firmen-SMTP"));
    expect(await screen.findByText("Bitte ausfüllen.")).toBeVisible();
    expect(callsTo(calls, "PATCH", SMTP_PATH)).toEqual([]);
  });

  it("a refusal of the service shows on its field, without a toast and without its text", async () => {
    stubRoutes(
      settingsStubs({
        [`PATCH ${SMTP_PATH}`]: () =>
          jsonResponse(HTTP_UNPROCESSABLE, {
            detail: [
              { type: "value_error", loc: ["body", "fields", "host"], msg: "host not public" },
            ],
          }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    await userEvent.type(screen.getByLabelText("SMTP-Server"), "x");
    await userEvent.click(saveIn("Firmen-SMTP"));
    expect(
      await screen.findByText("Der Benachrichtigungsdienst hat diesen Wert nicht angenommen."),
    ).toBeVisible();
    expect(screen.getByLabelText("SMTP-Server")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/host not public/)).toBeNull();
  });

  it("switching from a dirty form asks first; staying keeps the draft", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    await userEvent.type(screen.getByLabelText("Benutzername"), "x");
    await click("Mein Handy bearbeiten");
    const guard = await screen.findByRole("dialog");
    await userEvent.click(within(guard).getByRole("button", { name: "Weiter bearbeiten" }));
    expect(screen.getByLabelText("Benutzername")).toHaveValue("smtp-userx");
    expect(screen.queryByRole("form", { name: "Mein Handy" })).toBeNull();
  });
});

describe("adding a channel", () => {
  it("offers the service's types and names the channel after the chosen one", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Kanal hinzufügen");
    const type = screen.getByLabelText("Art");
    expect(
      within(type)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Pushover", "E-Mail (Resend)", "E-Mail (Mailjet)", "E-Mail (SMTP)"]);
    await userEvent.selectOptions(type, "E-Mail (Mailjet)");
    expect(screen.getByLabelText("Name")).toHaveValue("E-Mail (Mailjet)");
    expect(screen.getByLabelText("Secret Key")).toHaveAttribute("type", "password");
  });

  it("needs every required field, then creates and focuses the new row", async () => {
    const created = {
      ...SMTP_CHANNEL,
      id: "6f1c2a10-0000-4000-8000-000000000004",
      type: "pushover",
      name: "Zweites Handy",
      fields: {},
      secrets: { api_token: "set", user_key: "set" },
    };
    const stored: unknown[] = [...CHANNELS];
    const calls = stubRoutes(
      settingsStubs({
        "GET /notifications/channels": () => jsonResponse(200, listOf(stored)),
        "POST /notifications/channels": () => {
          stored.push(created);
          return jsonResponse(HTTP_CREATED, created);
        },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await click("Kanal hinzufügen");
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Zweites Handy");
    await userEvent.click(saveIn("Neuer Kanal"));
    expect(await screen.findAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(callsTo(calls, "POST", "/notifications/channels")).toEqual([]);
    await userEvent.type(screen.getByLabelText("API-Token"), "tok");
    await userEvent.type(screen.getByLabelText("User- oder Gruppen-Key"), "usr");
    await userEvent.click(saveIn("Neuer Kanal"));
    await screen.findByText("Kanal angelegt.");
    expect(bodyOf(callsTo(calls, "POST", "/notifications/channels")[0])).toEqual({
      type: "pushover",
      name: "Zweites Handy",
      fields: { api_token: "tok", user_key: "usr" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Zweites Handy bearbeiten" })).toHaveFocus(),
    );
  });

  it("the channel limit of the service is one fixed sentence", async () => {
    stubRoutes(
      settingsStubs({
        "POST /notifications/channels": () =>
          jsonResponse(HTTP_CONFLICT, { detail: "channel_limit_reached" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await click("Kanal hinzufügen");
    await userEvent.type(screen.getByLabelText("API-Token"), "tok");
    await userEvent.type(screen.getByLabelText("User- oder Gruppen-Key"), "usr");
    await userEvent.click(saveIn("Neuer Kanal"));
    expect(
      await screen.findByText("Du hast schon 20 Kanäle. Lösche einen, um einen neuen anzulegen."),
    ).toBeVisible();
  });

  it("at 20 channels Kanal hinzufügen is inactive and says why", async () => {
    const full = Array.from({ length: CHANNEL_LIMIT }, (_, index) => ({
      ...PUSHOVER_CHANNEL,
      id: `6f1c2a10-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
      name: `Handy ${index}`,
    }));
    stubRoutes(settingsStubs({ "GET /notifications/channels": listOf(full) }));
    renderWithProviders(<SettingsPage />);
    const add = await screen.findByRole("button", { name: "Kanal hinzufügen" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toHaveAccessibleDescription(
      "Höchstens 20 Kanäle. Lösche einen, um einen neuen anzulegen.",
    );
  });
});

describe("deleting and testing", () => {
  it("Kanal löschen asks, deletes, refreshes the sources and focuses Kanal hinzufügen", async () => {
    const calls = stubRoutes(
      settingsStubs({
        [`DELETE ${SMTP_PATH}`]: () => new Response(null, { status: HTTP_NO_CONTENT }),
      }),
    );
    const { queryClient } = renderWithProviders(<SettingsPage />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await click("Firmen-SMTP bearbeiten");
    await userEvent.click(
      within(form("Firmen-SMTP")).getByRole("button", { name: "Kanal löschen" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Kanal „Firmen-SMTP“ löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Kanal löschen" }));
    await screen.findByText("Kanal gelöscht.");
    expect(callsTo(calls, "DELETE", SMTP_PATH)).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Kanal hinzufügen" })).toHaveFocus(),
    );
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
      expect.arrayContaining([queryKeys.channels, queryKeys.platforms]),
    );
  });

  it("Test senden waits while the form is dirty", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await click("Firmen-SMTP bearbeiten");
    await userEvent.type(screen.getByLabelText("Benutzername"), "x");
    const test = screen.getByRole("button", { name: "Test über Firmen-SMTP senden" });
    expect(test).toHaveAttribute("aria-disabled", "true");
    expect(test).toHaveAccessibleDescription("Erst speichern.");
  });

  it("each test outcome is a fixed sentence", async () => {
    const outcomes = [
      { delivered: true, reason: null },
      { delivered: false, reason: "tls_failed" },
    ];
    stubRoutes(
      settingsStubs({
        [`POST ${SMTP_PATH}/test`]: () =>
          jsonResponse(200, { channel_id: SMTP_CHANNEL.id, ...outcomes.shift() }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await click("Test über Firmen-SMTP senden");
    expect(await screen.findByText("Test über Firmen-SMTP gesendet.")).toBeVisible();
    await click("Test über Firmen-SMTP senden");
    expect(
      await screen.findByText(
        "Mit dem Server von Firmen-SMTP kam keine sichere Verbindung zustande.",
      ),
    ).toBeVisible();
  });
});

describe("per source", () => {
  it("links every notifying source to its drawer, with its channels' names", async () => {
    stubRoutes(settingsStubs({ "GET /platforms": PLATFORMS }));
    renderWithProviders(<SettingsPage />);
    const link = await screen.findByRole("link", { name: "StepStone: Mein Handy, Firmen-SMTP" });
    expect(link).toHaveAttribute("href", "/sources?quelle=7");
    expect(screen.queryByRole("link", { name: /Indeed/ })).toBeNull();
  });

  it("says when no source notifies", async () => {
    stubRoutes(settingsStubs({ "GET /notifications/channels": listOf(CHANNELS) }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Keine Quelle benachrichtigt.")).toBeVisible();
  });
});
