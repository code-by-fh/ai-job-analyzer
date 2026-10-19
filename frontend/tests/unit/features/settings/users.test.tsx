import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usernameProblem } from "@/domain/settings";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ADMIN, adminStubs, MEMBER } from "../../support/adminRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import type { RouteTable } from "../../support/stubRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=users"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const USERS_PAGE = 200;
const CREATE = "Benutzer anlegen";
const OTHER_ADMIN = { id: 3, username: "lena", is_admin: true };
const USERS = [ADMIN, MEMBER, OTHER_ADMIN];
const NEW_PASSWORD = "sehr-geheim-123";
const SHARE_HINT = "Teile das Passwort auf einem sicheren Weg.";
const DELETE_TEXT =
  "Das Konto wird mit allem gelöscht, was ihm gehört: Stellen und Bewerbungen mit Verlauf und Dokumenten, Quellen mit ihren Läufen, das Profil, Nachweise und eigene Vorlagen, dazu die Zugangsdaten der Benachrichtigungen, Sprache und Zeitzone. Das lässt sich nicht rückgängig machen.";

const isCall = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const userList = () => screen.getByRole("list", { name: "Benutzer" });
const row = (name: string) =>
  within(userList())
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { exact: true }) !== null);
const createForm = () => within(screen.getByRole("form", { name: CREATE }));
const listCalls = (calls: RecordedCall[]) => calls.filter(isCall("GET", "/users"));

async function openUsers(routes: RouteTable = {}) {
  const calls = stubRoutes(adminStubs({ "GET /users": USERS, ...routes }));
  const view = renderWithProviders(<SettingsPage />);
  await screen.findByRole("list", { name: "Benutzer" });
  return { calls, ...view };
}

const members = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 10,
    username: `user${index}`,
    is_admin: false,
  }));

async function askToDelete(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `${name} löschen` }));
  return screen.findByRole("dialog", { name: `${name} löschen?` });
}

async function fillCreate(username: string, password = NEW_PASSWORD) {
  await userEvent.type(createForm().getByLabelText("Benutzername"), username);
  await userEvent.type(createForm().getByLabelText("Passwort"), password);
  await userEvent.click(createForm().getByRole("button", { name: "Speichern" }));
}

describe("usernameProblem", () => {
  it("mirrors routers/auth.py UserCreate after the trim", () => {
    expect(usernameProblem("  jo  ")).toBe("tooShort");
    expect(usernameProblem("jon")).toBeNull();
    expect(usernameProblem("a".repeat(50))).toBeNull();
    expect(usernameProblem("a".repeat(51))).toBe("tooLong");
    expect(usernameProblem("jo nas")).toBe("chars");
    expect(usernameProblem("jönas")).toBe("chars");
    expect(usernameProblem("j.o_n@a-s")).toBeNull();
  });
});

describe("Benutzer › list", () => {
  it("lists users with role tags and marks oneself", async () => {
    const { calls } = await openUsers();
    expect(new URL(listCalls(calls)[0]?.url ?? "").searchParams.get("limit")).toBe("200");
    expect(within(row("admin")!).getByText("Admin")).toBeVisible();
    expect(within(row("admin")!).getByText("(du)")).toBeVisible();
    expect(within(row("jonas")!).getByText("Mitglied")).toBeVisible();
    expect(within(row("jonas")!).queryByText("(du)")).toBeNull();
    expect(within(row("lena")!).getByText("Admin")).toBeVisible();
    expect(screen.queryByText(/Liste gekürzt/)).toBeNull();
  });

  it("no Löschen for oneself or an admin", async () => {
    await openUsers();
    expect(within(row("admin")!).queryByRole("button")).toBeNull();
    expect(within(row("lena")!).queryByRole("button")).toBeNull();
    const remove = within(row("jonas")!).getByRole("button", { name: "jonas löschen" });
    expect(remove).toHaveClass("btn-ghost", "btn-icon");
  });

  it("says when there is nobody else yet", async () => {
    await openUsers({ "GET /users": [ADMIN] });
    expect(screen.getByText("Noch keine weiteren Benutzer.")).toBeVisible();
  });

  it("a full page of 200 says the list is cut", async () => {
    await openUsers({ "GET /users": [ADMIN, ...members(USERS_PAGE - 1)] });
    expect(
      screen.getByText("Liste gekürzt: Es werden die ersten 200 Benutzer gezeigt."),
    ).toBeVisible();
  });

  it("199 rows are the whole list, without the hint", async () => {
    await openUsers({ "GET /users": [ADMIN, ...members(USERS_PAGE - 2)] });
    expect(within(userList()).getAllByRole("listitem")).toHaveLength(USERS_PAGE - 1);
    expect(screen.queryByText(/Liste gekürzt/)).toBeNull();
  });
});

describe("Benutzer › delete", () => {
  it("Löschen asks, deletes and toasts", async () => {
    const { calls } = await openUsers({ "DELETE /users/2": { status: "deleted" } });
    const dialog = await askToDelete("jonas");
    expect(within(dialog).getByText(DELETE_TEXT)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Benutzer löschen" }));
    expect(await screen.findByText("Benutzer gelöscht.")).toBeVisible();
    expect(calls.filter(isCall("DELETE", "/users/2"))).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(listCalls(calls)).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Benutzer" })).toHaveFocus(),
    );
  });

  it("a second confirm while the delete runs sends nothing", async () => {
    const { calls } = await openUsers({ "DELETE /users/2": () => new Promise(() => undefined) });
    const dialog = await askToDelete("jonas");
    const confirm = within(dialog).getByRole("button", { name: "Benutzer löschen" });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    expect(calls.filter(isCall("DELETE", "/users/2"))).toHaveLength(1);
  });

  it("a running crawl refuses with the fixed sentence, never the server text", async () => {
    await openUsers({
      "DELETE /users/2": jsonResponse(HTTP_CONFLICT, { detail: "Crawl running" }),
    });
    const dialog = await askToDelete("jonas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Benutzer löschen" }));
    expect(
      await screen.findByText("Gerade läuft eine Suche. Versuche es nach ihrem Ende erneut."),
    ).toBeVisible();
    expect(screen.queryByText("Crawl running")).toBeNull();
    expect(screen.queryByText("Benutzer gelöscht.")).toBeNull();
  });

  it("a self or admin refusal shows its fixed sentence", async () => {
    await openUsers({
      "DELETE /users/2": jsonResponse(HTTP_CONFLICT, { detail: "cannot_delete_admin" }),
    });
    const dialog = await askToDelete("jonas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Benutzer löschen" }));
    expect(await screen.findByText("Admins lassen sich hier nicht löschen.")).toBeVisible();
    expect(screen.queryByText("cannot_delete_admin")).toBeNull();
  });

  it("a user already gone (404) says so and refetches the list", async () => {
    const { calls } = await openUsers({
      "DELETE /users/2": jsonResponse(HTTP_NOT_FOUND, { detail: "User not found" }),
    });
    const dialog = await askToDelete("jonas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Benutzer löschen" }));
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeVisible();
    expect(screen.queryByText("User not found")).toBeNull();
    await waitFor(() => expect(listCalls(calls)).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Benutzer" })).toHaveFocus(),
    );
  });
});

describe("Benutzer › create", () => {
  it("a taken name is a field error with the fixed sentence, never the server text", async () => {
    const { calls } = await openUsers({
      "POST /users": jsonResponse(HTTP_CONFLICT, { detail: "username_taken" }),
    });
    await fillCreate("Jonas");
    expect(await createForm().findByText("Diesen Benutzernamen gibt es schon.")).toBeVisible();
    expect(createForm().getByLabelText("Benutzername")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("username_taken")).toBeNull();
    expect(calls.filter(isCall("POST", "/users"))).toHaveLength(1);
  });

  it("a name with a space is refused before sending", async () => {
    const { calls } = await openUsers();
    await fillCreate("jo nas");
    expect(createForm().getByText("Nur Buchstaben, Ziffern und . _ @ -")).toBeVisible();
    expect(calls.filter(isCall("POST", "/users"))).toEqual([]);
  });

  it("a short or too long password is refused before sending", async () => {
    const { calls } = await openUsers();
    await fillCreate("neu.user", "kurz");
    expect(
      createForm().getByText("8 bis 72 Zeichen; Umlaute und Sonderzeichen zählen mehrfach."),
    ).toBeVisible();
    expect(createForm().getByText(SHARE_HINT)).toBeVisible();
    await userEvent.type(createForm().getByLabelText("Passwort"), "ä".repeat(40));
    await userEvent.click(createForm().getByRole("button", { name: "Speichern" }));
    expect(
      createForm().getByText(
        "Zu lang. Erlaubt sind höchstens 72 Zeichen, Umlaute und Sonderzeichen zählen mehrfach.",
      ),
    ).toBeVisible();
    expect(calls.filter(isCall("POST", "/users"))).toEqual([]);
  });

  it("a 422 on a field shows that field's fixed sentence", async () => {
    await openUsers({
      "POST /users": jsonResponse(422, {
        detail: [{ loc: ["body", "password"], msg: "Value error, password_too_many_bytes" }],
      }),
    });
    await fillCreate("neu.user");
    expect(
      await createForm().findByText("8 bis 72 Zeichen; Umlaute und Sonderzeichen zählen mehrfach."),
    ).toBeVisible();
    expect(createForm().getByLabelText("Passwort")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/password_too_many_bytes/)).toBeNull();
  });

  it("after creating, the form is empty and the list refetches", async () => {
    const { calls, queryClient } = await openUsers({
      "POST /users": { id: 7, username: "neu.user", is_admin: false },
    });
    const username = createForm().getByLabelText("Benutzername");
    const password = createForm().getByLabelText("Passwort");
    expect(username).toHaveAttribute("autocomplete", "off");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    await fillCreate("  neu.user ");
    expect(await screen.findByText("Benutzer angelegt.")).toBeVisible();
    expect(bodyOf(calls.find(isCall("POST", "/users")))).toEqual({
      username: "neu.user",
      password: NEW_PASSWORD,
    });
    expect(username).toHaveValue("");
    expect(password).toHaveValue("");
    await waitFor(() => expect(listCalls(calls)).toHaveLength(2));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
    expect(document.body.innerHTML).not.toContain(NEW_PASSWORD);
  });
});
