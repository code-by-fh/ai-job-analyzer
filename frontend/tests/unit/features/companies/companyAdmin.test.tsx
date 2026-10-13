import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUserBody } from "@/api/auth";
import { queryKeys } from "@/api/queryKeys";
import { CompaniesPage } from "@/features/companies/CompaniesPage";
import { GlobalSearch } from "@/features/shell/GlobalSearch";
import { ADMIN, companiesStubs, MEMBER, PROFILE } from "../../support/companiesRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/companies"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const ADMIN_PATH = "/admin/companies/acme.de";
const SERVER_TEXT = "psycopg2 OperationalError";
const TOO_LONG_NAME = "x".repeat(201);
// 200 code points but 396 UTF-16 units: an astral character counts once, as in Python's len().
const LONGEST_NAME = `ACME${"😀".repeat(196)}`;
const notFound = () => jsonResponse(404, { detail: "Company profile not found" });
const sent = (calls: RecordedCall[], method: string) =>
  calls.filter((call) => call.method === method && new URL(call.url).pathname === ADMIN_PATH);
const reads = (calls: RecordedCall[], path: string) =>
  calls.filter((call) => call.method === "GET" && new URL(call.url).pathname === path);
const title = (name: string) => screen.findByRole("heading", { level: 1, name });

function openAcme(me: CurrentUserBody = ADMIN, routes: RouteTable = {}) {
  liveNavigation.reset("domain=acme.de");
  const calls = stubRoutes(companiesStubs(me, routes));
  renderWithProviders(<CompaniesPage />);
  return calls;
}

async function openRename() {
  await userEvent.click(await screen.findByRole("button", { name: "Umbenennen" }));
  const dialog = screen.getByRole("dialog", { name: "Firmenprofil umbenennen" });
  return { dialog, field: within(dialog).getByRole("textbox", { name: "Name" }) };
}

async function confirmDelete() {
  await userEvent.click(await screen.findByRole("button", { name: "Profil löschen" }));
  const dialog = screen.getByRole("dialog", { name: "Firmenprofil löschen?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Profil löschen" }));
}

/**
 * Review M1: the actions also render nothing while /me loads, so the absence checks start from an
 * answered /me; had the page rendered the actions, they would be there with the first paint.
 */
function renderWithMe(me: CurrentUserBody, domain: string) {
  liveNavigation.reset(`domain=${domain}`);
  stubRoutes(companiesStubs(me));
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.me, me);
  renderWithProviders(<CompaniesPage />, queryClient);
}

describe("CompanyAdminActions › visibility", () => {
  it("members see no admin actions", async () => {
    renderWithMe(MEMBER, "acme.de");
    expect(await screen.findByText("Solider Mittelständler.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Umbenennen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Profil löschen" })).toBeNull();
  });

  it("admins see none without a profile", async () => {
    renderWithMe(ADMIN, "initech.de");
    expect(await screen.findByRole("button", { name: "Firma recherchieren" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Umbenennen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Profil löschen" })).toBeNull();
  });
});

describe("CompanyAdminActions › rename", () => {
  it("rename refuses spaces and 201 characters before sending, then sends the trimmed name and shows it", async () => {
    const calls = openAcme(ADMIN, {
      [`PATCH ${ADMIN_PATH}`]: { domain: "acme.de", name: "ACME Group" },
    });
    const { dialog, field } = await openRename();
    expect(field).toHaveValue("ACME GmbH");
    expect(field).toHaveFocus();
    const save = within(dialog).getByRole("button", { name: "Speichern" });
    expect(save).toHaveAttribute("aria-disabled", "true");

    await userEvent.clear(field);
    await userEvent.type(field, "   ");
    await userEvent.click(save);
    expect(await within(dialog).findByText("Bitte ausfüllen.")).toBeVisible();
    await userEvent.clear(field);
    await userEvent.paste(TOO_LONG_NAME);
    await userEvent.click(save);
    expect(await within(dialog).findByText("Zu lang.")).toBeVisible();
    expect(sent(calls, "PATCH")).toEqual([]);

    const directoryReads = reads(calls, "/companies").length;
    await userEvent.clear(field);
    await userEvent.type(field, "  ACME Group ");
    await userEvent.click(save);
    expect(await title("ACME Group")).toBeVisible();
    expect(sent(calls, "PATCH").map((call) => JSON.parse(call.body ?? "null"))).toEqual([
      { name: "ACME Group" },
    ]);
    expect(await screen.findByText("Firmenprofil umbenannt.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(reads(calls, "/companies").length).toBeGreaterThan(directoryReads));
    expect(screen.getByRole("button", { name: "Umbenennen" })).toHaveFocus();
  });

  it("a 422 on the name shows the fixed field text, never the server's", async () => {
    const refused = () =>
      jsonResponse(422, { detail: [{ loc: ["body", "name"], msg: SERVER_TEXT, type: "x" }] });
    openAcme(ADMIN, { [`PATCH ${ADMIN_PATH}`]: refused });
    const { dialog, field } = await openRename();
    await userEvent.type(field, " Holding");
    await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect(await within(dialog).findByText("Zu lang.")).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(new RegExp(SERVER_TEXT))).toBeNull();
  });

  it("exactly 200 code points are sent, counted as Python does, not in UTF-16 units", async () => {
    const calls = openAcme(ADMIN, {
      [`PATCH ${ADMIN_PATH}`]: { domain: "acme.de", name: LONGEST_NAME },
    });
    const { dialog, field } = await openRename();
    await userEvent.clear(field);
    await userEvent.paste(LONGEST_NAME);
    await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Firmenprofil umbenannt.")).toBeVisible();
    expect(sent(calls, "PATCH").map((call) => JSON.parse(call.body ?? "null"))).toEqual([
      { name: LONGEST_NAME },
    ]);
  });

  it("a 404 after another admin deleted it says so and shows the research start", async () => {
    let gone = false;
    openAcme(ADMIN, {
      "GET /companies/acme.de": () => (gone ? notFound() : jsonResponse(200, PROFILE)),
      [`PATCH ${ADMIN_PATH}`]: () => {
        gone = true;
        return notFound();
      },
    });
    const { dialog, field } = await openRename();
    await userEvent.type(field, " Holding");
    await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeVisible();
    expect(
      await screen.findByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  });

  it("a 403 says the rights are missing", async () => {
    const forbidden = () => jsonResponse(403, { detail: SERVER_TEXT });
    openAcme(ADMIN, { [`PATCH ${ADMIN_PATH}`]: forbidden });
    const { dialog, field } = await openRename();
    await userEvent.type(field, " Holding");
    await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Dafür fehlen dir die Rechte.")).toBeVisible();
    expect(screen.queryByText(new RegExp(SERVER_TEXT))).toBeNull();
  });
});

describe("CompanyAdminActions › delete", () => {
  it("delete asks with the 'für alle Benutzer' text, then the detail shows 'Noch keine Recherche' and the directory refetches", async () => {
    const calls = openAcme(ADMIN, { [`DELETE ${ADMIN_PATH}`]: { status: "deleted" } });
    await userEvent.click(await screen.findByRole("button", { name: "Profil löschen" }));
    const dialog = screen.getByRole("dialog", { name: "Firmenprofil löschen?" });
    expect(
      within(dialog).getByText(
        "Das Firmenprofil wird für alle Benutzer gelöscht. Stellen bleiben erhalten und können neu recherchiert werden.",
      ),
    ).toBeVisible();
    expect(sent(calls, "DELETE")).toEqual([]);
    const directoryReads = reads(calls, "/companies").length;

    await userEvent.click(within(dialog).getByRole("button", { name: "Profil löschen" }));
    expect(
      await screen.findByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
    ).toBeVisible();
    expect(sent(calls, "DELETE")).toHaveLength(1);
    expect(await screen.findByText("Firmenprofil gelöscht.")).toBeVisible();
    await waitFor(() => expect(reads(calls, "/companies").length).toBeGreaterThan(directoryReads));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  });

  it("after the delete focus goes straight to the h1, never through the profile h2 (7b M5)", async () => {
    openAcme(ADMIN, { [`DELETE ${ADMIN_PATH}`]: { status: "deleted" } });
    await userEvent.click(await screen.findByRole("button", { name: "Profil löschen" }));
    const profileHeading = document.getElementById("company-profile-h");
    expect(profileHeading).toBeInstanceOf(HTMLHeadingElement);
    const focused = vi.fn();
    profileHeading?.addEventListener("focus", focused);
    const dialog = screen.getByRole("dialog", { name: "Firmenprofil löschen?" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Profil löschen" }));
    expect(
      await screen.findByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })),
    );
    expect(focused).not.toHaveBeenCalled();
  });

  it("a 404 after another admin deleted it shows the generic not-found sentence and refreshes", async () => {
    let gone = false;
    const calls = openAcme(ADMIN, {
      "GET /companies/acme.de": () => (gone ? notFound() : jsonResponse(200, PROFILE)),
      [`DELETE ${ADMIN_PATH}`]: () => {
        gone = true;
        return notFound();
      },
    });
    await confirmDelete();
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeVisible();
    expect(
      await screen.findByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
    ).toBeVisible();
    expect(reads(calls, "/companies/acme.de")).toHaveLength(2);
    expect(screen.queryByText(/Company profile not found/)).toBeNull();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  });
});

describe("CompanyAdminActions › delete failure", () => {
  it("a 5xx keeps the profile, closes the dialog and shows the fixed server sentence", async () => {
    openAcme(ADMIN, { [`DELETE ${ADMIN_PATH}`]: () => jsonResponse(500, { detail: SERVER_TEXT }) });
    await confirmDelete();
    expect(
      await screen.findByText(
        "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Solider Mittelständler.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Profil löschen" })).toHaveFocus();
    expect(screen.queryByText(new RegExp(SERVER_TEXT))).toBeNull();
  });
});

describe("CompanyAdminActions › global search", () => {
  /**
   * GET /search answers the company under its current name, as company_summaries does. The first
   * search answers at once; every later one waits for release(), so a test sees what shows while
   * the refetch is pending.
   */
  function heldSearch(admin: { name: string }) {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const respond = async () => {
      calls += 1;
      if (calls > 1) await held;
      return jsonResponse(200, { jobs: [], companies: [{ domain: "acme.de", name: admin.name }] });
    };
    return { respond, release: () => release(), calls: () => calls };
  }

  function openAcmeWithSearch(search: ReturnType<typeof heldSearch>, routes: RouteTable) {
    liveNavigation.reset("domain=acme.de");
    stubRoutes(companiesStubs(ADMIN, { "GET /search": search.respond, ...routes }));
    renderWithProviders(
      <>
        <CompaniesPage />
        <GlobalSearch />
      </>,
    );
  }

  async function typeSearch() {
    await userEvent.keyboard("/");
    const dialog = screen.getByRole("dialog", { name: "Suche" });
    await userEvent.type(within(dialog).getByRole("searchbox"), "acme");
    return dialog;
  }

  async function searchedName(name: string) {
    const dialog = await typeSearch();
    expect(await within(dialog).findByRole("link", { name: new RegExp(name) })).toBeVisible();
    await userEvent.keyboard("{Escape}");
  }

  /** The old name never shows, not even while the new search is still pending. */
  async function searchedAfterChange(search: ReturnType<typeof heldSearch>, name: string) {
    const dialog = await typeSearch();
    await waitFor(() => expect(search.calls()).toBe(2));
    expect(within(dialog).queryByRole("link", { name: /ACME GmbH/ })).toBeNull();
    search.release();
    expect(await within(dialog).findByRole("link", { name: new RegExp(name) })).toBeVisible();
  }

  it("after a rename the search shows the new name, never the cached one", async () => {
    const admin = { name: "ACME GmbH" };
    const search = heldSearch(admin);
    openAcmeWithSearch(search, {
      [`PATCH ${ADMIN_PATH}`]: () => {
        admin.name = "ACME Group";
        return jsonResponse(200, { domain: "acme.de", name: admin.name });
      },
    });
    expect(await title("ACME GmbH")).toBeVisible();
    await searchedName("ACME GmbH");
    const { dialog, field } = await openRename();
    await userEvent.clear(field);
    await userEvent.type(field, "ACME Group");
    await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect(await title("ACME Group")).toBeVisible();
    await searchedAfterChange(search, "ACME Group");
  });

  it("after a delete the search shows the name from the jobs, never the profile's", async () => {
    const admin = { name: "ACME GmbH" };
    const search = heldSearch(admin);
    openAcmeWithSearch(search, {
      [`DELETE ${ADMIN_PATH}`]: () => {
        admin.name = "Acme";
        return jsonResponse(200, { status: "deleted" });
      },
    });
    expect(await title("ACME GmbH")).toBeVisible();
    await searchedName("ACME GmbH");
    await confirmDelete();
    expect(await screen.findByText("Firmenprofil gelöscht.")).toBeVisible();
    await searchedAfterChange(search, "^Acme ");
  });
});
