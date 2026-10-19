import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_ERROR_CODES, type AiErrorCode } from "@/api/adminPaths";
import { queryKeys } from "@/api/queryKeys";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import { ADMIN, adminStubs } from "../../support/adminRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=system"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY = 429;
const HTTP_UNAVAILABLE = 503;
const PASSWORD = "admin-passwort-1";
const CALM = "Zurzeit kein KI-Fehler.";
const WIPE = "Datenbank leeren";
const PASSWORD_LABEL = "Zur Bestätigung dein Passwort";
const WRONG_PASSWORD = "Das Passwort stimmt nicht.";
const CRAWL_RUNNING_TEXT = "Gerade läuft eine Suche. Versuche es nach ihrem Ende erneut.";
// R12: the copy names what routers/admin.py wipe_database deletes, and what stays.
const OWN_TEXT =
  "Löscht deine Stellen mit Verlauf und Dokumenten, deine Quellen mit ihren Läufen, deine Profildaten (Einstellungen, Nachweise, eigene Vorlagen, Lebenslaufdaten) und jedes Firmenprofil, auf das keine verbleibende Stelle mehr verweist (bei nur einem Benutzer: alle).";
const ALL_TEXT =
  "Löscht die Stellen, Quellen, Profildaten (Einstellungen, Nachweise, eigene Vorlagen, Lebenslaufdaten) und Firmenprofile aller Benutzer, auch deine, mit Verlauf und Dokumenten.";
const KEEP_TEXT = "Benutzerkonten bleiben. Das lässt sich nicht rückgängig machen.";
const ALL_SCOPE = "Alle Benutzer (Stellen, Quellen, Profildaten, Firmenprofile)";
const WIPE_ALL = "Alle Daten löschen";

// Ruling 11: provider-neutral, one fixed sentence per code.
const SENTENCE: Readonly<Record<AiErrorCode, string>> = {
  auth: "Der KI-Anbieter hat die Anmeldung abgelehnt. Prüfe den Schlüssel.",
  rate_limit: "Der KI-Anbieter begrenzt gerade die Anfragen.",
  model_not_found: "Das eingestellte Modell wurde nicht gefunden.",
  connection: "Der KI-Anbieter war nicht erreichbar.",
  server: "Der KI-Anbieter meldete einen Serverfehler.",
  unknown: "Ein KI-Fehler wurde gemeldet.",
};

const isCall = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const callsTo = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter(isCall(method, path));
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const failWith = (status: number, body: unknown) => () => jsonResponse(status, body);

/** GET /admin/system-status answers the current code; DELETE clears it, as the server does. */
function statusRoutes(initial: AiErrorCode | null): RouteTable {
  let code = initial;
  return {
    "GET /admin/system-status": () => jsonResponse(200, { ai_error: code }),
    "DELETE /admin/clear-ai-error": () => {
      code = null;
      return jsonResponse(200, { status: "cleared" });
    },
  };
}

function renderSystem(routes: RouteTable = {}) {
  const queryClient = createTestQueryClient();
  const calls = stubRoutes(adminStubs(routes));
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  renderWithProviders(<SettingsPage />, queryClient);
  return { calls, invalidate, queryClient };
}

function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  return assign;
}

async function openWipe(scope?: string): Promise<HTMLElement> {
  const zone = await screen.findByRole("region", { name: WIPE });
  if (scope) await userEvent.click(within(zone).getByRole("radio", { name: scope }));
  await userEvent.click(within(zone).getByRole("button", { name: WIPE }));
  return screen.findByRole("dialog", { name: WIPE });
}

async function confirmWipe(password: string, scope?: string): Promise<HTMLElement> {
  const dialog = await openWipe(scope);
  await userEvent.type(within(dialog).getByLabelText(PASSWORD_LABEL), password);
  await userEvent.click(
    within(dialog).getByRole("button", { name: scope === ALL_SCOPE ? WIPE_ALL : WIPE }),
  );
  return dialog;
}

describe("Systemfehler › KI-Fehler", () => {
  it("no error shows the calm line", async () => {
    renderSystem();
    expect(await screen.findByText(CALM)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Fehler zurücksetzen" })).toBeNull();
  });

  it.each(AI_ERROR_CODES)("the code %s shows its sentence, never the code", async (code) => {
    renderSystem({ "GET /admin/system-status": { ai_error: code } });
    expect(await screen.findByText(SENTENCE[code])).toBeVisible();
    expect(screen.queryByText(code)).toBeNull();
    expect(screen.queryByText(CALM)).toBeNull();
    expect(screen.getByRole("link", { name: "Zu den KI-Einstellungen" })).toHaveAttribute(
      "href",
      "/settings?section=ai",
    );
  });

  it("an unavailable status (503) shows the fixed text, never the server's code", async () => {
    renderSystem({
      "GET /admin/system-status": failWith(HTTP_UNAVAILABLE, { detail: "status_unavailable" }),
    });
    expect(
      await screen.findByText(
        "Der KI-Status lässt sich gerade nicht abrufen. Versuche es gleich noch einmal.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("status_unavailable")).toBeNull();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });

  it("Fehler zurücksetzen calls the clear endpoint and the block turns calm after the refetch", async () => {
    const { calls } = renderSystem(statusRoutes("auth"));
    await userEvent.click(await screen.findByRole("button", { name: "Fehler zurücksetzen" }));
    expect(await screen.findByText(CALM)).toBeVisible();
    expect(screen.getByText("KI-Fehler zurückgesetzt.")).toBeVisible();
    expect(callsTo(calls, "DELETE", "/admin/clear-ai-error")).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: "KI-Fehler" })).toHaveFocus(),
    );
  });

  it("an ai_error event refreshes the block; its message text is never shown", async () => {
    const routes = statusRoutes(null);
    const { queryClient } = renderSystem(routes);
    await screen.findByText(CALM);
    stubRoutes(adminStubs({ "GET /admin/system-status": { ai_error: "rate_limit" } }));
    const message = { type: "ai_error", user_id: ADMIN.id, message: "OpenRouter 429 raw" };
    act(() =>
      handleRealtimeMessage(JSON.stringify(message), ADMIN.id, {
        queryClient,
        now: Date.now,
        onGlobalError: vi.fn(),
      }),
    );
    expect(await screen.findByText(SENTENCE.rate_limit)).toBeVisible();
    expect(screen.queryByText(/OpenRouter 429 raw/)).toBeNull();
  });
});

describe("Systemfehler › Wartung", () => {
  it.each([
    [0, "Keine hängenden Läufe gefunden."],
    [1, "1 hängender Lauf entfernt."],
    [3, "3 hängende Läufe entfernt."],
  ])("Aufräumen with %i removed toasts the count", async (removed, text) => {
    const { calls, invalidate } = renderSystem({ "POST /admin/redis/cleanup": { removed } });
    await userEvent.click(await screen.findByRole("button", { name: "Hängende Läufe aufräumen" }));
    expect(await screen.findByText(text)).toBeVisible();
    expect(callsTo(calls, "POST", "/admin/redis/cleanup")).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.activity });
  });

  it("a failed clean-up toasts the fixed error", async () => {
    renderSystem({ "POST /admin/redis/cleanup": failWith(500, { detail: "redis down" }) });
    await userEvent.click(await screen.findByRole("button", { name: "Hängende Läufe aufräumen" }));
    expect(
      await screen.findByText(
        "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("redis down")).toBeNull();
  });
});

describe("Systemfehler › Datenbank leeren", () => {
  it("sits in a danger zone with own data as the default", async () => {
    renderSystem();
    const zone = await screen.findByRole("region", { name: WIPE });
    expect(within(zone).getByRole("radio", { name: "Nur meine Daten" })).toBeChecked();
    expect(within(zone).getByRole("radio", { name: ALL_SCOPE })).not.toBeChecked();
    expect(within(zone).getByRole("button", { name: WIPE })).toHaveClass("btn-danger");
  });

  it("the question says what the chosen scope deletes and asks for the password", async () => {
    renderSystem();
    const own = await openWipe();
    expect(own).toHaveTextContent(OWN_TEXT);
    expect(own).toHaveTextContent(KEEP_TEXT);
    expect(own).not.toHaveTextContent(ALL_TEXT);
    expect(within(own).getByLabelText(PASSWORD_LABEL)).toHaveFocus();
    expect(within(own).getByRole("button", { name: WIPE })).toHaveClass("btn-danger");
    await userEvent.click(within(own).getByRole("button", { name: "Abbrechen" }));
    const all = await openWipe(ALL_SCOPE);
    expect(all).toHaveTextContent(ALL_TEXT);
    expect(all).toHaveTextContent(KEEP_TEXT);
    expect(all).not.toHaveTextContent(OWN_TEXT);
    expect(within(all).getByRole("button", { name: WIPE_ALL })).toHaveClass("btn-danger");
    expect(within(all).queryByRole("button", { name: WIPE })).toBeNull();
  });

  it("an empty password is refused without a call", async () => {
    const { calls } = renderSystem();
    const dialog = await openWipe();
    await userEvent.click(within(dialog).getByRole("button", { name: WIPE }));
    expect(within(dialog).getByLabelText(PASSWORD_LABEL)).toHaveAccessibleDescription(
      "Bitte ausfüllen.",
    );
    expect(callsTo(calls, "POST", "/admin/database/wipe")).toHaveLength(0);
  });

  it("400 wrong_password is a field error and the dialog stays", async () => {
    const assign = stubLocation();
    renderSystem({
      "POST /admin/database/wipe": failWith(HTTP_BAD_REQUEST, { detail: "wrong_password" }),
    });
    const dialog = await confirmWipe("falsch-falsch");
    const field = within(dialog).getByLabelText(PASSWORD_LABEL);
    await waitFor(() => expect(field).toHaveAccessibleDescription(WRONG_PASSWORD));
    expect(screen.queryByText("wrong_password")).toBeNull();
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveFocus());
    expect(assign).not.toHaveBeenCalled();
  });

  it("typing a new password clears the wrong-password error", async () => {
    renderSystem({
      "POST /admin/database/wipe": failWith(HTTP_BAD_REQUEST, { detail: "wrong_password" }),
    });
    const dialog = await confirmWipe("falsch-falsch");
    const field = within(dialog).getByLabelText(PASSWORD_LABEL);
    await waitFor(() => expect(field).toHaveAccessibleDescription(WRONG_PASSWORD));
    await userEvent.type(field, "x");
    expect(field).not.toHaveAccessibleDescription(WRONG_PASSWORD);
    expect(within(dialog).queryByText(WRONG_PASSWORD)).toBeNull();
    expect(field).toHaveValue("falsch-falschx");
  });

  it("a 429 shows the fixed rate-limit text in the dialog, which stays", async () => {
    const assign = stubLocation();
    renderSystem({
      "POST /admin/database/wipe": failWith(HTTP_TOO_MANY, { error: "Rate limit exceeded" }),
    });
    const dialog = await confirmWipe(PASSWORD);
    expect(await within(dialog).findByText("Zu viele Anfragen, bitte kurz warten.")).toBeVisible();
    expect(screen.queryByText(/Rate limit exceeded/)).toBeNull();
    expect(within(dialog).getByLabelText(PASSWORD_LABEL)).not.toHaveAccessibleDescription(
      WRONG_PASSWORD,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("a 409 (a search runs) shows the fixed text in the dialog, which stays", async () => {
    const assign = stubLocation();
    renderSystem({
      "POST /admin/database/wipe": failWith(HTTP_CONFLICT, { detail: "Crawl running" }),
    });
    const dialog = await confirmWipe(PASSWORD);
    expect(await within(dialog).findByText(CRAWL_RUNNING_TEXT)).toBeVisible();
    expect(screen.queryByText(/Crawl running/)).toBeNull();
    expect(within(dialog).getByLabelText(PASSWORD_LABEL)).toHaveValue(PASSWORD);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a refused password does not outlive the closed dialog in the mutation cache", async () => {
    const { queryClient } = renderSystem({
      "POST /admin/database/wipe": failWith(HTTP_BAD_REQUEST, { detail: "wrong_password" }),
    });
    const dialog = await confirmWipe(PASSWORD);
    expect(await within(dialog).findByText(WRONG_PASSWORD)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
  });

  it("closing the dialog drops the typed password", async () => {
    renderSystem();
    const dialog = await openWipe();
    await userEvent.type(within(dialog).getByLabelText(PASSWORD_LABEL), PASSWORD);
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    const reopened = await openWipe();
    expect(within(reopened).getByLabelText(PASSWORD_LABEL)).toHaveValue("");
  });

  it("a successful wipe sends the scope and navigates fully to /inbox", async () => {
    const assign = stubLocation();
    const { calls, invalidate } = renderSystem({
      "POST /admin/database/wipe": { status: "success" },
    });
    await confirmWipe(PASSWORD, ALL_SCOPE);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/inbox"));
    expect(bodyOf(calls.find(isCall("POST", "/admin/database/wipe")))).toEqual({
      password: PASSWORD,
      wipe_all_users: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ refetchType: "none" });
  });
});
