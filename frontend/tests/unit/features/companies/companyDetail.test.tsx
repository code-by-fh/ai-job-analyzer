import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyProfileBody } from "@/api/companies";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, pendingTaskId, startTask } from "@/domain/pendingTasks";
import { CompaniesPage } from "@/features/companies/CompaniesPage";
import { applyEvent } from "@/realtime/applyEvent";
import {
  ADMIN,
  COMPANY_ARCHIVED_JOBS,
  COMPANY_JOBS,
  companiesStubs,
  MEMBER,
  PROFILE,
} from "../../support/companiesRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/companies"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const RUNNING = /Firmenrecherche läuft/;
const notFound = () => jsonResponse(404, { detail: "Company profile not found" });
const analyzeBodies = (calls: RecordedCall[], domain: string) =>
  calls
    .filter((call) => call.method === "POST" && call.url.endsWith(`/companies/${domain}/analyze`))
    .map((call) => JSON.parse(call.body ?? "null"));
const profileReads = (calls: RecordedCall[], domain: string) =>
  calls.filter((call) => call.method === "GET" && call.url.endsWith(`/companies/${domain}`));
const jobsSection = () => screen.getByRole("region", { name: /^Deine Stellen bei/ });

function openDetail(query: string, routes: RouteTable = {}, queryClient = createTestQueryClient()) {
  liveNavigation.reset(query);
  const calls = stubRoutes(companiesStubs(MEMBER, routes));
  renderWithProviders(<CompaniesPage />, queryClient);
  return { calls, queryClient };
}

describe("CompanyDetail › research", () => {
  it("shows the shared profile with deep dives and the refresh confirmation", async () => {
    const { calls } = openDetail("domain=acme.de", {
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de" },
    });
    expect(await screen.findByText("Solider Mittelständler.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Firmenprofil" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Tiefenrecherche" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Gehalt" })).toBeVisible();
    expect(screen.getByText(/^Recherchiert am 07\.10\.2026.* · acme\.de$/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Neu recherchieren" }));
    const dialog = screen.getByRole("dialog", { name: "Profil neu recherchieren?" });
    expect(analyzeBodies(calls, "acme.de")).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Aktualisieren" }));
    await waitFor(() => expect(analyzeBodies(calls, "acme.de")).toEqual([{ force_refresh: true }]));
    expect(await screen.findByText(RUNNING)).toBeVisible();
  });

  it("without a profile offers 'Firma recherchieren', which starts the research once and shows its progress", async () => {
    const { calls } = openDetail("domain=initech.de", {
      "POST /companies/initech.de/analyze": { status: "queued", domain: "initech.de" },
    });
    expect(
      await screen.findByRole("heading", { level: 3, name: "Noch keine Recherche zu Initech AG" }),
    ).toBeVisible();
    const start = screen.getByRole("button", { name: "Firma recherchieren" });
    await userEvent.dblClick(start);
    expect(await screen.findByText(RUNNING)).toBeVisible();
    expect(analyzeBodies(calls, "initech.de")).toEqual([{ force_refresh: false }]);
    expect(screen.queryByRole("button", { name: "Firma recherchieren" })).toBeNull();
  });

  it("a start answered with 'exists' shows the profile that appeared meanwhile", async () => {
    let created = false;
    openDetail("domain=initech.de", {
      "GET /companies/initech.de": () =>
        created ? jsonResponse(200, { ...PROFILE, domain: "initech.de" }) : notFound(),
      "POST /companies/initech.de/analyze": () => {
        created = true;
        return jsonResponse(200, { status: "exists", domain: "initech.de" });
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Firma recherchieren" }));
    expect(await screen.findByText("Solider Mittelständler.")).toBeVisible();
    expect(screen.queryByText(RUNNING)).toBeNull();
  });

  it("a company_profile_ready event replaces the progress with the profile", async () => {
    const queryClient = createTestQueryClient();
    const running = startTask(EMPTY_PENDING, pendingTaskId.research("initech.de"), Date.now());
    queryClient.setQueryData(queryKeys.pendingTasks, running);
    let ready = false;
    openDetail(
      "domain=initech.de",
      {
        "GET /companies/initech.de": () =>
          ready ? jsonResponse(200, { ...PROFILE, domain: "initech.de" }) : notFound(),
      },
      queryClient,
    );
    expect(await screen.findByText(RUNNING)).toBeVisible();
    ready = true;
    const deps = { queryClient, now: Date.now, onGlobalError: vi.fn() };
    applyEvent({ type: "company_profile_ready", domain: "initech.de", user_id: ADMIN.id }, deps);
    expect(await screen.findByText("Solider Mittelständler.")).toBeVisible();
    expect(screen.queryByText(RUNNING)).toBeNull();
  });

  it("AI text with markup renders as text, never as an element", async () => {
    const hostile: CompanyProfileBody = {
      ...PROFILE,
      executive_summary: {
        assessment: "<img src=x onerror=alert(1)>",
        confidence: null,
        suitable_for: [],
        not_suitable_for: [],
      },
    };
    openDetail("domain=acme.de", { "GET /companies/acme.de": hostile });
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.body.querySelector("img")).toBeNull();
  });

  it("a failed profile request shows a fixed sentence, never the server's text", async () => {
    const failed = () => jsonResponse(500, { detail: "psycopg2 OperationalError" });
    openDetail("domain=acme.de", { "GET /companies/acme.de": failed });
    const section = await screen.findByRole("region", { name: "Firmenprofil" });
    expect(await within(section).findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(screen.queryByText(/psycopg2/)).toBeNull();
  });
});

describe("CompanyDetail › header and jobs", () => {
  it("lists the user's jobs at the company with their phase and links", async () => {
    openDetail("domain=acme.de");
    await screen.findByRole("heading", { level: 2, name: "Deine Stellen bei ACME GmbH" });
    const links = await within(jobsSection()).findAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Senior Backend EngineerTreffer",
      "Platform EngineerAussortiert",
    ]);
    expect(links[0]).toHaveAttribute("href", "/jobs/job-1");
    expect(links[1]).toHaveAttribute("href", "/jobs/job-2");
    expect(await screen.findByText("acme.de · 2 Stellen")).toBeVisible();
  });

  it("Erneut versuchen after a failed job list reloads both lists", async () => {
    let failing = true;
    const jobs = (call: RecordedCall) => {
      const archived = new URL(call.url).searchParams.get("is_archived") === "true";
      if (archived && failing) return jsonResponse(500, { detail: "psycopg2 OperationalError" });
      return jsonResponse(200, archived ? COMPANY_ARCHIVED_JOBS : COMPANY_JOBS);
    };
    const { calls } = openDetail("domain=acme.de", { "GET /jobs": jobs });
    const retry = await within(jobsSection()).findByRole("button", { name: "Erneut versuchen" });
    expect(screen.queryByText(/psycopg2/)).toBeNull();
    failing = false;
    await userEvent.click(retry);
    expect(await within(jobsSection()).findAllByRole("link")).toHaveLength(2);
    const reads = (archived: string | null) =>
      calls.filter(
        (call) =>
          new URL(call.url).pathname === "/jobs" &&
          new URL(call.url).searchParams.get("is_archived") === archived,
      );
    expect(reads("true")).toHaveLength(2);
    expect(reads(null)).toHaveLength(2);
  });

  it("no own jobs at the company says so", async () => {
    openDetail("domain=initech.de");
    expect(await screen.findByText("Keine eigenen Stellen bei dieser Firma.")).toBeVisible();
    expect(within(jobsSection()).queryByRole("link")).toBeNull();
  });

  it("the title takes the profile's name, also for a domain outside the own directory", async () => {
    const globex = { ...PROFILE, domain: "globex.de", name: "Globex Corporation" };
    const { calls } = openDetail("domain=globex.de", { "GET /companies/globex.de": globex });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Globex Corporation" }),
    ).toBeVisible();
    expect(profileReads(calls, "globex.de")).toHaveLength(1);
  });

  it("an invalid domain parameter shows the list", async () => {
    const { calls } = openDetail("domain=http%3A%2F%2Fevil");
    expect(await screen.findByRole("heading", { level: 1, name: "Firmen" })).toBeVisible();
    expect(await screen.findByRole("list", { name: "Firmen" })).toBeVisible();
    expect(calls.filter((call) => call.url.includes("evil"))).toEqual([]);
  });
});

describe("CompanyDetail › way back", () => {
  it("a row keeps the list's search and scope, and 'Alle Firmen' returns to them", async () => {
    liveNavigation.reset("q=ac&alle=1");
    stubRoutes(companiesStubs(ADMIN));
    renderWithProviders(<CompaniesPage />);
    const link = await screen.findByRole("link", { name: "ACME GmbH" });
    expect(link).toHaveAttribute("href", "/companies?domain=acme.de&q=ac&alle=1");

    liveNavigation.reset("domain=acme.de&q=ac&alle=1");
    expect(await screen.findByRole("link", { name: "Alle Firmen" })).toHaveAttribute(
      "href",
      "/companies?q=ac&alle=1",
    );
  });
});
