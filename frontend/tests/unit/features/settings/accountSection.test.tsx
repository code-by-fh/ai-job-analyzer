import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=account"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const CURRENT = "altes-passwort-1";
const NEXT = "neues-passwort-2";
const SERVER_TEXT = "Incorrect current password";
const RATE_LIMITED = "Zu viele Anfragen, bitte kurz warten.";
const NEXT_HINT = "8 bis 72 Zeichen; Umlaute und Sonderzeichen zählen mehrfach.";
const TOO_LONG =
  "Zu lang. Erlaubt sind höchstens 72 Zeichen, Umlaute und Sonderzeichen zählen mehrfach.";
const WRONG_CURRENT = "Das aktuelle Passwort stimmt nicht.";
const UNEXPECTED = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
const FACTORY_TEXT =
  "Löscht deine Stellen, Bewerbungen, Quellen, dein Profil, Nachweise und eigene Vorlagen, dazu die Zugangsdaten der Benachrichtigungen, Sprache und Zeitzone. Das Konto selbst bleibt. Das lässt sich nicht rückgängig machen.";
// 37 umlauts: 37 characters, 74 UTF-8 bytes (over the 72-byte bcrypt bound).
const TOO_MANY_BYTES = "ä".repeat(37);

const isCallTo = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const callsTo = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter(isCallTo(method, path));
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const passwordForm = () => screen.findByRole("form", { name: "Passwort ändern" });
const dialog = (name: string) => screen.findByRole("dialog", { name });
const failWith = (status: number, body: unknown) => () => jsonResponse(status, body);

function renderAccount(overrides: RouteTable = {}) {
  const queryClient = createTestQueryClient();
  const calls = stubRoutes(settingsStubs(overrides));
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  renderWithProviders(<SettingsPage />, queryClient);
  return { calls, invalidate, queryClient };
}

interface PasswordEntry {
  current?: string;
  next?: string;
  repeat?: string;
}

/** Types into the three fields (empty values are skipped) and presses its Speichern. */
async function submitPassword({ current = CURRENT, next = NEXT, repeat = next }: PasswordEntry) {
  const form = await passwordForm();
  const fill = async (label: string, value: string) => {
    if (value) await userEvent.type(within(form).getByLabelText(label), value);
  };
  await fill("Aktuelles Passwort", current);
  await fill("Neues Passwort", next);
  await fill("Neues Passwort wiederholen", repeat);
  await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
  return form;
}

function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  return assign;
}

describe("Passwort ändern", () => {
  it("checks length and repeat before sending", async () => {
    const { calls } = renderAccount();
    const form = await submitPassword({ next: "kurz" });
    const next = within(form).getByLabelText("Neues Passwort");
    expect(next).toHaveAccessibleDescription(NEXT_HINT);
    expect(next).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(next);
    await userEvent.type(next, TOO_MANY_BYTES);
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(next).toHaveAccessibleDescription(TOO_LONG);
    await userEvent.clear(next);
    await userEvent.type(next, NEXT);
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(within(form).getByLabelText("Neues Passwort wiederholen")).toHaveAccessibleDescription(
      "Die beiden Eingaben unterscheiden sich.",
    );
    expect(callsTo(calls, "POST", "/auth/change-password")).toHaveLength(0);
  });

  it("asks for the current password before sending", async () => {
    const { calls } = renderAccount();
    const form = await submitPassword({ current: "" });
    expect(within(form).getByLabelText("Aktuelles Passwort")).toHaveAccessibleDescription(
      "Bitte ausfüllen.",
    );
    expect(callsTo(calls, "POST", "/auth/change-password")).toHaveLength(0);
  });

  it("a 400 marks the current password, the server text is never shown", async () => {
    renderAccount({
      "POST /auth/change-password": failWith(HTTP_BAD_REQUEST, { detail: SERVER_TEXT }),
    });
    const form = await submitPassword({});
    const current = within(form).getByLabelText("Aktuelles Passwort");
    await waitFor(() => expect(current).toHaveAccessibleDescription(WRONG_CURRENT));
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
    expect(within(form).getByLabelText("Neues Passwort")).toHaveValue(NEXT);
  });

  it("a 422 on the new password shows the rule on that field", async () => {
    const refusal = { detail: [{ loc: ["body", "new_password"], msg: "too short" }] };
    renderAccount({ "POST /auth/change-password": failWith(HTTP_UNPROCESSABLE, refusal) });
    const form = await submitPassword({});
    const next = within(form).getByLabelText("Neues Passwort");
    await waitFor(() => expect(next).toHaveAttribute("aria-invalid", "true"));
    expect(next).toHaveAccessibleDescription(NEXT_HINT);
    expect(screen.queryByText("too short")).not.toBeInTheDocument();
  });

  it("a 429 toasts the rate limit", async () => {
    renderAccount({
      "POST /auth/change-password": failWith(HTTP_TOO_MANY, { error: "Rate limit exceeded" }),
    });
    await submitPassword({});
    expect(await screen.findByText(RATE_LIMITED)).toBeVisible();
  });

  // Review M4: an unmapped status (408) shares the BAD_REQUEST code but is no wrong password.
  it("a 408 toasts the generic error and marks no field", async () => {
    renderAccount({ "POST /auth/change-password": failWith(HTTP_REQUEST_TIMEOUT, {}) });
    const form = await submitPassword({});
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
    const current = within(form).getByLabelText("Aktuelles Passwort");
    expect(current).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(WRONG_CURRENT)).not.toBeInTheDocument();
  });

  it("success sends both passwords, clears the three fields and toasts", async () => {
    const { calls } = renderAccount({
      "POST /auth/change-password": { status: "password updated" },
    });
    const form = await submitPassword({});
    expect(await screen.findByText("Passwort geändert.")).toBeVisible();
    expect(bodyOf(calls.find(isCallTo("POST", "/auth/change-password")))).toEqual({
      current_password: CURRENT,
      new_password: NEXT,
    });
    for (const label of ["Aktuelles Passwort", "Neues Passwort", "Neues Passwort wiederholen"])
      expect(within(form).getByLabelText(label)).toHaveValue("");
  });

  it("the sent passwords do not stay in the mutation cache once settled", async () => {
    const { queryClient } = renderAccount({
      "POST /auth/change-password": failWith(HTTP_BAD_REQUEST, { detail: SERVER_TEXT }),
    });
    const form = await submitPassword({});
    const current = within(form).getByLabelText("Aktuelles Passwort");
    await waitFor(() => expect(current).toHaveAccessibleDescription(WRONG_CURRENT));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
  });
});

describe("Profil zurücksetzen", () => {
  it("asks, deletes the profile, refreshes its readers and toasts", async () => {
    const { calls, invalidate } = renderAccount({ "DELETE /settings": { status: "reset" } });
    await userEvent.click(await screen.findByRole("button", { name: "Profil zurücksetzen" }));
    const confirm = await dialog("Profil zurücksetzen");
    expect(confirm).toHaveTextContent(
      "Ziel und Lebenslauf werden geleert. Benachrichtigungen, Vorlagen und Nachweise bleiben.",
    );
    const reset = within(confirm).getByRole("button", { name: "Profil zurücksetzen" });
    expect(reset).toHaveClass("btn-danger");
    await userEvent.click(reset);
    expect(await screen.findByText("Profil zurückgesetzt.")).toBeVisible();
    expect(callsTo(calls, "DELETE", "/settings")).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.profile });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.setupStatus });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.templatePreviewRoot });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Profil zurücksetzen" })).toHaveFocus(),
    );
  });
});

async function openFactoryReset(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "Alles zurücksetzen" }));
  return dialog("Alles zurücksetzen");
}

async function confirmFactoryReset(password: string): Promise<HTMLElement> {
  const confirm = await openFactoryReset();
  await userEvent.type(within(confirm).getByLabelText("Zur Bestätigung dein Passwort"), password);
  await userEvent.click(within(confirm).getByRole("button", { name: "Alles zurücksetzen" }));
  return confirm;
}

describe("Profil zurücksetzen without a profile", () => {
  // Review M9: the 404 is the fixed sentence, never the server's detail; the question stays.
  it("a 404 toasts the fixed text and keeps the question", async () => {
    renderAccount({
      "DELETE /settings": failWith(HTTP_NOT_FOUND, { detail: "Profil nicht gefunden" }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Profil zurücksetzen" }));
    const confirm = await dialog("Profil zurücksetzen");
    await userEvent.click(within(confirm).getByRole("button", { name: "Profil zurücksetzen" }));
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeVisible();
    expect(screen.queryByText("Profil nicht gefunden")).not.toBeInTheDocument();
    expect(confirm).toBeInTheDocument();
  });
});

describe("Alles zurücksetzen", () => {
  it("sits in the Gefahrenzone and names everything it deletes", async () => {
    renderAccount();
    const zone = await screen.findByRole("region", { name: "Gefahrenzone" });
    const open = within(zone).getByRole("button", { name: "Alles zurücksetzen" });
    expect(open).toHaveClass("btn-danger");
    const confirm = await openFactoryReset();
    expect(confirm).toHaveTextContent(FACTORY_TEXT);
    expect(within(confirm).getByLabelText("Zur Bestätigung dein Passwort")).toHaveFocus();
  });

  it("with a wrong password keeps the dialog with a field error", async () => {
    const assign = stubLocation();
    renderAccount({ "DELETE /user/reset": failWith(HTTP_BAD_REQUEST, { detail: "Incorrect" }) });
    const confirm = await confirmFactoryReset("falsch-falsch");
    const field = within(confirm).getByLabelText("Zur Bestätigung dein Passwort");
    await waitFor(() => expect(field).toHaveAccessibleDescription(WRONG_CURRENT));
    expect(screen.queryByText("Incorrect")).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("says that a running search blocks the reset", async () => {
    const assign = stubLocation();
    renderAccount({ "DELETE /user/reset": failWith(HTTP_CONFLICT, { detail: "Crawl running" }) });
    const confirm = await confirmFactoryReset(CURRENT);
    expect(
      await screen.findByText("Gerade läuft eine Suche. Versuche es nach ihrem Ende erneut."),
    ).toBeVisible();
    expect(confirm).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("a 429 toasts the rate limit and keeps the dialog", async () => {
    stubLocation();
    renderAccount({ "DELETE /user/reset": failWith(HTTP_TOO_MANY, { error: "Rate limit" }) });
    const confirm = await confirmFactoryReset(CURRENT);
    expect(await screen.findByText(RATE_LIMITED)).toBeVisible();
    expect(confirm).toBeInTheDocument();
  });

  it("a 408 toasts the generic error, marks no field and keeps the dialog", async () => {
    stubLocation();
    renderAccount({ "DELETE /user/reset": failWith(HTTP_REQUEST_TIMEOUT, {}) });
    const confirm = await confirmFactoryReset(CURRENT);
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
    expect(screen.queryByText(WRONG_CURRENT)).not.toBeInTheDocument();
    expect(confirm).toBeInTheDocument();
  });

  it("an empty password is refused without a call", async () => {
    const { calls } = renderAccount();
    const confirm = await openFactoryReset();
    await userEvent.click(within(confirm).getByRole("button", { name: "Alles zurücksetzen" }));
    expect(
      within(confirm).getByLabelText("Zur Bestätigung dein Passwort"),
    ).toHaveAccessibleDescription("Bitte ausfüllen.");
    expect(callsTo(calls, "DELETE", "/user/reset")).toHaveLength(0);
  });

  it("a refused password does not outlive the closed dialog in the mutation cache", async () => {
    const { queryClient } = renderAccount({
      "DELETE /user/reset": failWith(HTTP_BAD_REQUEST, { detail: "Incorrect" }),
    });
    const confirm = await confirmFactoryReset("falsch-falsch");
    const field = within(confirm).getByLabelText("Zur Bestätigung dein Passwort");
    await waitFor(() => expect(field).toHaveAccessibleDescription(WRONG_CURRENT));
    await userEvent.click(within(confirm).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
  });

  it("closing the dialog drops the typed password", async () => {
    renderAccount();
    const confirm = await openFactoryReset();
    await userEvent.type(within(confirm).getByLabelText("Zur Bestätigung dein Passwort"), CURRENT);
    await userEvent.click(within(confirm).getByRole("button", { name: "Abbrechen" }));
    const reopened = await openFactoryReset();
    expect(within(reopened).getByLabelText("Zur Bestätigung dein Passwort")).toHaveValue("");
  });

  it("sends the password, drops every cached answer and navigates fully to /inbox", async () => {
    const assign = stubLocation();
    const { calls, invalidate } = renderAccount({
      "DELETE /user/reset": { status: "reset complete" },
    });
    await confirmFactoryReset(CURRENT);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/inbox"));
    expect(bodyOf(calls.find(isCallTo("DELETE", "/user/reset")))).toEqual({ password: CURRENT });
    // Review M1: every answer is marked stale; nothing refetches into the navigation.
    expect(invalidate).toHaveBeenCalledWith({ refetchType: "none" });
  });

  // Review M2: a typed password elsewhere must not hold the navigation with "Leave site?".
  it("releases the unsaved-changes guard before navigating", async () => {
    const prevented: boolean[] = [];
    const assign = vi.fn(() => {
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      prevented.push(unload.defaultPrevented);
    });
    vi.stubGlobal("location", { ...window.location, assign });
    renderAccount({ "DELETE /user/reset": { status: "reset complete" } });
    await userEvent.type(
      within(await passwordForm()).getByLabelText("Aktuelles Passwort"),
      CURRENT,
    );
    await confirmFactoryReset(CURRENT);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/inbox"));
    expect(prevented).toEqual([false]);
  });

  // Review M3: the page is unloading; the dialog stays busy, a second Enter sends nothing.
  it("stays busy after success, so a second submit sends nothing", async () => {
    const assign = stubLocation();
    const { calls } = renderAccount({ "DELETE /user/reset": { status: "reset complete" } });
    const confirm = await confirmFactoryReset(CURRENT);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const button = within(confirm).getByRole("button", { name: "Alles zurücksetzen" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.type(
      within(confirm).getByLabelText("Zur Bestätigung dein Passwort"),
      "{Enter}",
    );
    expect(callsTo(calls, "DELETE", "/user/reset")).toHaveLength(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
