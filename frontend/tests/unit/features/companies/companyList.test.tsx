import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUserBody } from "@/api/auth";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, pendingTaskId, startTask } from "@/domain/pendingTasks";
import { CompaniesPage } from "@/features/companies/CompaniesPage";
import { ADMIN, companiesStubs, MEMBER } from "../../support/companiesRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/companies"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const companyList = () => screen.getByRole("list", { name: "Firmen" });
const row = (name: string) =>
  within(companyList())
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("link", { name }) !== null);
const directoryCalls = (calls: RecordedCall[]) =>
  calls.filter((call) => new URL(call.url).pathname === "/companies");
const scopes = (calls: RecordedCall[]) =>
  directoryCalls(calls).map((call) => new URL(call.url).searchParams.get("scope"));

interface OpenOptions {
  me?: CurrentUserBody;
  routes?: RouteTable;
  queryClient?: ReturnType<typeof createTestQueryClient>;
}

async function openList({ me = MEMBER, routes = {}, queryClient }: OpenOptions = {}) {
  const calls = stubRoutes(companiesStubs(me, routes));
  renderWithProviders(<CompaniesPage />, queryClient);
  await screen.findByRole("list", { name: "Firmen" });
  return calls;
}

describe("CompaniesPage › list", () => {
  it("lists the user's companies with state and job count", async () => {
    await openList();
    expect(screen.getByRole("heading", { level: 1, name: "Firmen" })).toBeVisible();
    expect(screen.getByText("Firmen aus deinen Stellen und ihre Recherche.")).toBeVisible();
    expect(row("ACME GmbH")).toHaveTextContent("acme.de · Recherchiert am 07.10.2026 · 2 Stellen");
    expect(row("Initech AG")).toHaveTextContent("initech.de · Noch nicht recherchiert · 1 Stelle");
    expect(screen.getByText("2 Firmen")).toHaveAttribute("role", "status");
  });

  it("search filters on the client and writes ?q= with replace", async () => {
    const calls = await openList();
    await userEvent.type(screen.getByRole("searchbox", { name: "Firmen durchsuchen" }), "INIT");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenLastCalledWith("/companies?q=INIT", {
        scroll: false,
      }),
    );
    expect(within(companyList()).getAllByRole("listitem")).toHaveLength(1);
    expect(row("Initech AG")).toBeDefined();
    expect(screen.getByText("1 Firma")).toHaveAttribute("role", "status");
    expect(directoryCalls(calls)).toHaveLength(1);
  });

  it("a search without a match says so", async () => {
    liveNavigation.reset("q=globex");
    stubRoutes(companiesStubs());
    renderWithProviders(<CompaniesPage />);
    expect(await screen.findByText("Keine Firma passt zu „globex“.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Firmen" })).toBeNull();
  });

  it("a running research shows 'Recherche läuft …'", async () => {
    const queryClient = createTestQueryClient();
    const running = startTask(EMPTY_PENDING, pendingTaskId.research("acme.de"), Date.now());
    queryClient.setQueryData(queryKeys.pendingTasks, running);
    await openList({ queryClient });
    expect(row("ACME GmbH")).toHaveTextContent("acme.de · Recherche läuft … · 2 Stellen");
    expect(row("Initech AG")).toHaveTextContent("Noch nicht recherchiert");
  });

  it("no companies shows the empty state", async () => {
    stubRoutes(companiesStubs(MEMBER, { "GET /companies": { items: [] } }));
    renderWithProviders(<CompaniesPage />);
    expect(await screen.findByRole("heading", { name: "Noch keine Firmen" })).toBeVisible();
    expect(
      screen.getByText(
        "Eine Firma erscheint hier, sobald eine deiner Stellen eine Web-Adresse hat.",
      ),
    ).toBeVisible();
  });

  it("a failed directory shows a fixed sentence, never the server's text", async () => {
    const failed = () => jsonResponse(500, { detail: "psycopg2 OperationalError" });
    stubRoutes(companiesStubs(MEMBER, { "GET /companies": failed }));
    renderWithProviders(<CompaniesPage />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(screen.queryByText(/psycopg2/)).toBeNull();
  });

  it("rows are links to ?domain= with no nested controls", async () => {
    await openList();
    const acme = row("ACME GmbH")!;
    expect(within(acme).getByRole("link")).toHaveAttribute("href", "/companies?domain=acme.de");
    expect(within(acme).getAllByRole("link")).toHaveLength(1);
    expect(within(acme).queryByRole("button")).toBeNull();
    expect(within(acme).queryByRole("checkbox")).toBeNull();
  });
});

describe("CompaniesPage › scope", () => {
  it("a member has no 'Alle Firmen' check; an admin's check requests scope=all", async () => {
    await openList({ me: MEMBER });
    expect(screen.queryByRole("checkbox", { name: "Alle Firmen dieser Installation" })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();

    const calls = await openList({ me: ADMIN });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Alle Firmen dieser Installation" }),
    );
    expect(liveNavigation.replace).toHaveBeenLastCalledWith("/companies?alle=1", { scroll: false });
    expect(await screen.findByRole("link", { name: "Globex Corporation" })).toBeVisible();
    expect(row("Globex Corporation")).toHaveTextContent("Keine eigenen Stellen");
    expect(scopes(calls)).toEqual([null, "all"]);
  });

  it("a member with ?alle=1 requests the own scope", async () => {
    liveNavigation.reset("alle=1");
    const calls = await openList({ me: MEMBER });
    expect(row("ACME GmbH")).toBeDefined();
    expect(scopes(calls)).toEqual([null]);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("nothing is requested while /me loads with ?alle=1", async () => {
    liveNavigation.reset("alle=1");
    const never = () => new Promise<Response>(() => undefined);
    const calls = stubRoutes(companiesStubs(ADMIN, { "GET /me": never }));
    renderWithProviders(<CompaniesPage />);
    expect(await screen.findByRole("status", { busy: true })).toBeInTheDocument();
    expect(directoryCalls(calls)).toEqual([]);
  });
});

describe("CompaniesPage › detail", () => {
  it("?domain= shows the company with the way back and the shared note", async () => {
    liveNavigation.reset("domain=acme.de");
    stubRoutes(companiesStubs());
    renderWithProviders(<CompaniesPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "ACME GmbH" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Alle Firmen" })).toHaveAttribute("href", "/companies");
    expect(await screen.findByText("acme.de · 2 Stellen")).toBeVisible();
    expect(
      await screen.findByText("Firmenprofile sind für alle Benutzer dieser Installation sichtbar."),
    ).toBeVisible();
  });

  it("a domain outside the own directory is named by its domain", async () => {
    liveNavigation.reset("domain=globex.de");
    const calls = stubRoutes(companiesStubs());
    renderWithProviders(<CompaniesPage />);
    await waitFor(() => expect(directoryCalls(calls)).toHaveLength(1));
    expect(await screen.findByRole("heading", { level: 1, name: "globex.de" })).toBeVisible();
  });
});
