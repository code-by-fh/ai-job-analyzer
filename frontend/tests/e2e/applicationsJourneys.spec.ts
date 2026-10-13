import type { Locator, Page } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { ACTIVE_ITEMS, CLOSED_ITEMS } from "./support/applicationsFixtures";
import { FakeServer, jobRoutesOf, listRoutesOf } from "./support/applicationsServer";
import { BELOW_ITEMS, DISMISSED_ITEMS, inboxRoutes, NEW_ITEMS } from "./support/inboxFixtures";
import {
  changePhase,
  expectCurrentPhase,
  fixNow,
  jobRoutes,
  pushEvent,
  READY,
} from "./support/jobFixtures";
import type { ApiLog, MockRoutes } from "./support/mockApi";
import { expect, test } from "./support/test";

// The journeys of spec section 7 that cross Eingang, Bewerbungen and the job page. Per-feature
// assertions live in applications*.spec.ts; here one fake server keeps the rows, so every refetch
// after a click sees what the real server would answer (its rules: support/applicationsServer.ts).

// job-1 is an application (ACTIVE_ITEMS) here; the inbox fixtures use the same id for a new match,
// so that match is left out and the inbox shows the other two.
const INBOX_ROWS = [
  ...NEW_ITEMS.filter((item) => item.id !== "job-1"),
  ...BELOW_ITEMS,
  ...DISMISSED_ITEMS,
];
const SEARCH = "Engineer";
const JOB_PAGE_IDS = ["job-1", "job-2"];
const FOLLOW_UP_ISO = "2026-10-18T08:00:00.000Z";
const INTERVIEW_LATER = "2026-10-15T08:00:00+00:00";
const APPLIED_WITH_DOCS: Partial<JobListItemBody> = { status: "APPLIED", ...READY };

test.beforeEach(async ({ page }) => fixNow(page));

function newServer(changes: Partial<JobListItemBody> = {}): FakeServer {
  const server = new FakeServer([...INBOX_ROWS, ...ACTIVE_ITEMS, ...CLOSED_ITEMS]);
  server.update("job-1", changes);
  return server;
}

function journeyRoutes(server: FakeServer, searches: readonly string[] = []): MockRoutes {
  return {
    ...jobRoutes(server.detail("job-1")),
    ...inboxRoutes(),
    ...listRoutesOf(server, searches),
    ...Object.assign({}, ...JOB_PAGE_IDS.map((id) => jobRoutesOf(server, id))),
  };
}

const section = (page: Page, name: string) => page.getByRole("region", { name });
const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });
const navLink = (page: Page) => nav(page).getByRole("link", { name: /Bewerbungen/ });
const deck = (page: Page) => page.locator(".applications .mast-deck");
const strip = (page: Page) => page.getByRole("group", { name: "Phasen" });
const stripButton = (page: Page, phase: string) =>
  strip(page).getByRole("button", { name: new RegExp(`^${phase}:`) });
const rowTitles = (region: Locator) => region.getByRole("listitem").locator(".arow-link");
const field = (page: Page) => page.getByRole("searchbox", { name: "Bewerbungen durchsuchen" });
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);

const sentTo = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

const queryOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

async function backToApplications(page: Page) {
  await page.locator(".crumbs").getByRole("link", { name: "Bewerbungen" }).click();
  await expect(page).toHaveURL(/\/applications$/);
}

test("a match shortlisted in Eingang shows up under Vorgemerkt", async ({ page, mockApi }) => {
  const server = newServer();
  const log = await mockApi(journeyRoutes(server));
  await page.goto("/inbox");
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Vormerken: Backend Engineer (Java)" })
    .click();
  await expect(page.getByRole("tabpanel").getByRole("link", { name: /Java\)/ })).toHaveCount(0);
  await navLink(page).click();
  const drafted = section(page, "Vorgemerkt");
  // Longest waiting first: the shortlisted job was moved today, so it is the last row.
  await expect(rowTitles(drafted)).toHaveText([
    "Platform Engineer",
    "Senior Backend Engineer (Kotlin)",
    "Java Developer",
    "Backend Engineer (Java)",
  ]);
  const row = drafted.getByRole("listitem").last();
  await expect(row.locator(".when-cell")).toHaveText("seit heute");
  await expect(row).toContainText("Noch keine");
  await expect(deck(page)).toHaveText("7 aktiv · 2 fällig");
  expect(sentTo(log, "POST /jobs/job-2/status")).toEqual([{ to: "DRAFTED" }]);
  expect(server.refused).toEqual([]);
});

test("applying from the job page moves the row to Beworben", async ({ page, mockApi }) => {
  const server = newServer();
  const log = await mockApi(journeyRoutes(server));
  await page.goto("/applications");
  await section(page, "Vorgemerkt")
    .getByRole("link", { name: "Senior Backend Engineer (Kotlin)" })
    .click();
  await expect(page).toHaveURL(/\/jobs\/job-1$/);
  await changePhase(page, "Beworben");
  await page
    .getByRole("dialog", { name: "Ohne fertige Unterlagen?" })
    .getByRole("button", { name: "Trotzdem auf Beworben setzen" })
    .click();
  await expectCurrentPhase(page, "Beworben");
  await backToApplications(page);
  const applied = section(page, "Beworben");
  await expect(rowTitles(applied)).toHaveText([
    "Kotlin Developer",
    "Backend Engineer",
    "Senior Backend Engineer (Kotlin)",
  ]);
  const row = applied.getByRole("listitem").last();
  await expect(row.locator(".next-cell")).toHaveText("Auf Antwort warten");
  await expect(row.locator(".when-cell")).toHaveText("seit heute");
  await expect(rowTitles(section(page, "Vorgemerkt"))).toHaveCount(2);
  await expect(stripButton(page, "Beworben")).toHaveAccessibleName("Beworben: 3 Bewerbungen");
  expect(sentTo(log, "POST /jobs/job-1/status")).toEqual([{ to: "APPLIED" }]);
  expect(server.refused).toEqual([]);
});

test("Nachgefasst on the job page lowers the due count in the header and the nav", async ({
  page,
  mockApi,
}) => {
  const overdue = { ...APPLIED_WITH_DOCS, next_follow_up_at: "2026-10-06T07:00:00+00:00" };
  const server = newServer(overdue);
  const log = await mockApi(journeyRoutes(server));
  await page.goto("/applications");
  await expect(deck(page)).toHaveText("6 aktiv · 3 fällig");
  await expect(navLink(page).locator(".count-badge")).toContainText("3");
  await section(page, "Beworben")
    .getByRole("link", { name: "Senior Backend Engineer (Kotlin)" })
    .click();
  await page
    .getByRole("complementary", { name: "Nächster Schritt" })
    .getByRole("button", { name: "Nachgefasst" })
    .click();
  await expect(page.getByText(/Nachfassen festgehalten/)).toBeVisible();
  await backToApplications(page);
  await expect(deck(page)).toHaveText("6 aktiv · 2 fällig");
  await expect(navLink(page).locator(".count-badge")).toContainText("2");
  const row = section(page, "Beworben").getByRole("listitem").filter({ hasText: "ACME GmbH" });
  await expect(row.locator(".when-cell")).not.toHaveClass(/t-warn/);
  expect(sentTo(log, "PATCH /jobs/job-1")).toEqual([{ next_follow_up_at: FOLLOW_UP_ISO }]);
});

test("closing as rejected moves the row to Abgeschlossen", async ({ page, mockApi }) => {
  const server = newServer(APPLIED_WITH_DOCS);
  const log = await mockApi(journeyRoutes(server));
  await page.goto("/jobs/job-1");
  await changePhase(page, "Abgeschlossen");
  await page
    .getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" })
    .getByRole("button", { name: "Absage erhalten" })
    .click();
  await expectCurrentPhase(page, "Abgesagt");
  await backToApplications(page);
  await expect(deck(page)).toHaveText("5 aktiv · 2 fällig");
  await expect(stripButton(page, "Abgeschlossen")).toHaveAccessibleName(
    "Abgeschlossen: 3 Bewerbungen",
  );
  await page.getByRole("button", { name: "Abgeschlossen (3)" }).click();
  const first = section(page, "Abgeschlossen").getByRole("listitem").first();
  await expect(first).toContainText("Senior Backend Engineer (Kotlin)");
  await expect(first).toContainText("Abgesagt");
  expect(sentTo(log, "POST /jobs/job-1/status")).toEqual([{ to: "REJECTED" }]);
  expect(server.refused).toEqual([]);
});

test("a search, a phase and the closed list survive a visit to the job page", async ({
  page,
  mockApi,
}) => {
  const log = await mockApi(journeyRoutes(newServer(), [SEARCH]));
  await page.goto("/applications");
  await field(page).fill(SEARCH);
  await expect.poll(() => queryOf(page)).toEqual({ q: SEARCH });
  // The search narrows the list and the strip, whatever the header says about all applications.
  await expect(stripButton(page, "Vorgemerkt")).toHaveAccessibleName("Vorgemerkt: 2 Bewerbungen");
  await expect(stripButton(page, "Beworben")).toHaveAccessibleName("Beworben: 1 Bewerbung");
  await expect(stripButton(page, "Interview")).toHaveAccessibleName("Interview: 1 Bewerbung");
  await expect(stripButton(page, "Abgeschlossen")).toHaveAccessibleName(
    "Abgeschlossen: 1 Bewerbung",
  );
  await expect(deck(page)).toHaveText("6 aktiv · 2 fällig");
  await stripButton(page, "Vorgemerkt").click();
  await expect.poll(() => queryOf(page)).toEqual({ q: SEARCH, phase: "vorgemerkt" });
  await expect(rowTitles(section(page, "Vorgemerkt"))).toHaveText([
    "Platform Engineer",
    "Senior Backend Engineer (Kotlin)",
  ]);
  await expect(section(page, "Beworben")).toHaveCount(0);
  await rowTitles(section(page, "Vorgemerkt")).last().click();
  await expect(page).toHaveURL(/\/jobs\/job-1$/);
  await page.goBack();
  await expect.poll(() => queryOf(page)).toEqual({ q: SEARCH, phase: "vorgemerkt" });
  await expect(field(page)).toHaveValue(SEARCH);
  await expect(stripButton(page, "Vorgemerkt")).toHaveAttribute("aria-pressed", "true");
  await expect(rowTitles(section(page, "Vorgemerkt"))).toHaveCount(2);
  await stripButton(page, "Vorgemerkt").click();
  await page.getByRole("button", { name: "Abgeschlossen (1)" }).click();
  await expect.poll(() => queryOf(page)).toEqual({ q: SEARCH, abgeschlossen: "1" });
  await expect(rowTitles(section(page, "Abgeschlossen"))).toHaveText(["Engineering Manager"]);
  await expect(rowTitles(section(page, "Interview"))).toHaveText(["Staff Engineer"]);
  // Every list question named its filter: none fell through to the unkeyed guard.
  expect(log.requests).not.toContain("GET /jobs");
  expect(log.requests).toContain(`GET ${applicationsListPath({ group: "closed", q: SEARCH }, 0)}`);
});

test("live updates move rows while the header, the strip and the nav badge keep agreeing", async ({
  page,
  mockApi,
}) => {
  const server = newServer();
  const log = await mockApi(journeyRoutes(server));
  await page.goto("/applications");
  await connected(log);
  await expect(deck(page)).toHaveText("6 aktiv · 2 fällig");
  await expect(navLink(page).locator(".count-badge")).toContainText("2");
  // The overdue follow-up becomes an interview next week: it moves, and it is no longer due.
  server.changeStatus("job-7", "INTERVIEW");
  server.update("job-7", { next_follow_up_at: null, interview_at: INTERVIEW_LATER });
  pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
  await expect(rowTitles(section(page, "Interview"))).toHaveCount(2);
  await expect(rowTitles(section(page, "Beworben"))).toHaveText(["Backend Engineer"]);
  await expect(stripButton(page, "Interview")).toHaveAccessibleName("Interview: 2 Bewerbungen");
  await expect(deck(page)).toHaveText("6 aktiv · 1 fällig");
  await expect(navLink(page).locator(".count-badge")).toContainText("1");
  // Tomorrow's interview ends with a rejection: the row leaves for Abgeschlossen and nothing is due.
  server.changeStatus("job-9", "REJECTED");
  pushEvent(log, { type: "job_updated", job: { id: "job-9" } });
  await expect(page.getByRole("button", { name: "Abgeschlossen (3)" })).toBeVisible();
  await expect(deck(page)).toHaveText("5 aktiv · 0 fällig");
  await expect(navLink(page).locator(".count-badge")).toHaveCount(0);
  await expect(rowTitles(section(page, "Interview"))).toHaveText(["Kotlin Developer"]);
  expect(server.refused).toEqual([]);
});
