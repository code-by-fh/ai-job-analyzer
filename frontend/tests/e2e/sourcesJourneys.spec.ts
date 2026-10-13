import type { Page } from "@playwright/test";
import { type InboxData, inboxRoutes, NEW_ITEMS } from "./support/inboxFixtures";
import { fixNow, pushEvent } from "./support/jobFixtures";
import type { ApiLog, MutableRoutes } from "./support/mockApi";
import { INDEED, PLATFORMS, STEPSTONE } from "./support/platformFixtures";
import { finishCrawl, SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

// Spec section 7: "add source" and "crawl progress", and the hand-offs between Quellen and
// Eingang. Per-feature assertions live in the sources*.spec.ts files; here one SourcesServer
// answers both screens, so every refetch after a click or an event sees the server's state.

const NEW_URL = "https://www.get-in-it.de/jobsuche?query=kotlin";
// The fake server names a source it creates without a name "<host> Jobs" (the AI name in reality).
const NEW_NAME = "www.get-in-it.de Jobs";
// The first source of an empty server gets id 1.
const NEW_ID = 1;
const EMPTY_INBOX: InboxData = { new: [], below: [], dismissed: [] };
// 08:00 UTC is 10:00 in Berlin, the fixed clock's day (NOW_ISO).
const FINISHED_AT = "2026-10-08T08:00:00+00:00";
const PRIVATE_URL = "http://10.0.0.5/jobs";
const KOTLIN_JOB = NEW_ITEMS[0]!;

test.beforeEach(async ({ page }) => fixNow(page));

/**
 * Inbox and sources on one server: the inbox routes are the base, the server answers platforms,
 * crawls and the setup status. mockApi must get this very object (a source the wizard creates
 * registers its routes on it).
 */
function routes(server: SourcesServer, inbox: InboxData = {}): MutableRoutes {
  return sourcesRoutes(server, {}, inboxRoutes(inbox));
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });
const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });
const drawer = (page: Page, name: string) => page.getByRole("dialog", { name: `Quelle ${name}` });
const section = (page: Page, source: string, heading: string) =>
  drawer(page, source)
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
const jobMeta = (page: Page, title: string) =>
  page.locator(".jrow").filter({ hasText: title }).locator(".jrow-sub");

async function socket(log: ApiLog): Promise<void> {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

/** The worker's steps of an Indeed crawl: 8 links collected, 2 read, the first one analysed. */
function pushCrawlProgress(log: ApiLog, crawlId: string): void {
  const events = [
    { type: "crawl_job_progress", platform: INDEED.url, total: 8, scraping_completed: 8 },
    { type: "crawl_job_extracting", extracting_count: 2, total: 8 },
    { type: "job_analysis_started", analysis_completed: 1 },
  ];
  events.forEach((event) => pushEvent(log, { job_id: crawlId, ...event }));
}

/** The wizard with the prototype's page, the six postings preselected and the default first run (seed). */
async function addSourceWithWizard(page: Page): Promise<void> {
  const wizard = page.getByRole("dialog", { name: "Quelle hinzufügen" });
  await wizard.getByLabel("Adresse einer Suchergebnisseite").fill(NEW_URL);
  await wizard.getByRole("button", { name: "Seite prüfen" }).click();
  await expect(wizard.getByText("6 ausgewählt")).toBeVisible();
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();
  await wizard.getByRole("button", { name: "Quelle anlegen" }).click();
  await expect(page.getByText(`Quelle „${NEW_NAME}“ angelegt.`, { exact: true })).toBeVisible();
}

test("add source: from the onboarding through the wizard and the first run to the inbox", async ({
  page,
  mockApi,
}) => {
  const server = new SourcesServer([], []);
  // A first run: no source and nothing found yet, so the inbox shows the onboarding.
  server.keptJobs.clear();
  const log = await mockApi(routes(server, EMPTY_INBOX));
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Erste Quelle hinzufügen" })).toBeVisible();
  await page.getByRole("link", { name: "Quelle hinzufügen" }).click();
  await expect(page).toHaveURL(/\/sources\?add=1$/);
  await addSourceWithWizard(page);
  await expect(row(page, NEW_NAME)).toContainText("Läuft");
  await socket(log);
  finishCrawl(log, server, {
    platformId: NEW_ID,
    type: "crawl_job_completed",
    lastRun: { finished_at: FINISHED_AT, found: 6, new: 6, matched: 0, seeded: true, error: null },
  });
  await expect(row(page, NEW_NAME)).toContainText("6 als bekannt gemerkt");
  await nav(page)
    .getByRole("link", { name: /Eingang/ })
    .click();
  // The setup status changed with the create: the inbox list view replaces the onboarding.
  await expect(page.locator(".runline")).toContainText(`Letzter Lauf: ${NEW_NAME}, heute 10:00.`);
  await expect(page.getByRole("heading", { name: "Erste Quelle hinzufügen" })).toHaveCount(0);
});

test("crawl progress: the live steps in the row, then the nav badge and the inbox run line", async ({
  page,
  mockApi,
}) => {
  const server = new SourcesServer();
  const log = await mockApi(routes(server));
  await page.goto("/sources");
  await socket(log);
  // Indeed's failed run is the one error before the crawl.
  await expect(nav(page).getByText("1 Fehler")).toBeVisible();
  await page.getByRole("button", { name: "Indeed jetzt durchsuchen" }).click();
  await expect(row(page, "Indeed")).toContainText("Startet …");
  await expect.poll(() => server.running.has(INDEED.id)).toBe(true);
  pushCrawlProgress(log, server.running.get(INDEED.id)!.id);
  await expect(row(page, "Indeed")).toContainText("Bewerten: 1 von 8");
  finishCrawl(log, server, {
    platformId: INDEED.id,
    type: "crawl_job_completed",
    lastRun: { finished_at: FINISHED_AT, found: 8, new: 2, matched: 1, error: null },
  });
  await expect(nav(page).getByText("1 Fehler")).toHaveCount(0);
  await nav(page)
    .getByRole("link", { name: /Eingang/ })
    .click();
  await expect(page.locator(".runline")).toContainText(
    "Letzter Lauf: Indeed, heute 10:00. 8 gefunden, 1 passend, 1 unter Schwellwert",
  );
});

test.describe("saved sections and a refused save", () => {
  test.use({ allowedConsoleErrors: [/status of 422/] });

  test("schedule and notifications survive a reload; a refused later save keeps its draft", async ({
    page,
    mockApi,
  }) => {
    const server = new SourcesServer();
    await mockApi(routes(server));
    await page.goto(`/sources?quelle=${INDEED.id}`);
    const schedule = section(page, "Indeed", "Zeitplan");
    await schedule.getByLabel("Automatisch durchsuchen").check();
    await schedule.getByLabel("Uhrzeit").fill("07:30");
    await schedule.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Gespeichert.")).toBeVisible();
    const notify = drawer(page, "Indeed").getByRole("form", { name: "Benachrichtigungen" });
    await notify.getByLabel("SMTP benachrichtigen").check();
    await notify.getByLabel("Empfänger").fill("ich@example.com");
    await notify.getByRole("button", { name: "Speichern" }).click();
    await expect.poll(() => server.get(INDEED.id).smtp_recipients).toEqual(["ich@example.com"]);
    await page.reload();
    await expect(schedule.getByLabel("Uhrzeit")).toHaveValue("07:30");
    await expect(notify.getByLabel("SMTP benachrichtigen")).toBeChecked();
    const source = section(page, "Indeed", "Quelle");
    await source.getByLabel("Adresse der Suchergebnisseite").fill(PRIVATE_URL);
    await source.getByRole("button", { name: "Speichern" }).click();
    await expect(source.getByText("Diese Adresse kann nicht geprüft werden.")).toBeVisible();
    await expect(source.getByLabel("Adresse der Suchergebnisseite")).toHaveValue(PRIVATE_URL);
    await expect(schedule.getByLabel("Uhrzeit")).toHaveValue("07:30");
    expect(server.get(INDEED.id)).toMatchObject({ url: INDEED.url, schedule_time: "07:30" });
  });
});

test("delete: the found jobs stay in the inbox, named by their host", async ({ page, mockApi }) => {
  // No crawl runs, so StepStone may be deleted. The inbox lists are static fixtures: this proves
  // the label hand-off (the row falls back to the host), not that the server keeps the jobs.
  const server = new SourcesServer(PLATFORMS, []);
  await mockApi(routes(server));
  await page.goto("/inbox");
  await expect(jobMeta(page, KOTLIN_JOB.title!)).toContainText("StepStone");
  await nav(page)
    .getByRole("link", { name: /Quellen/ })
    .click();
  await page.getByRole("link", { name: STEPSTONE.name, exact: true }).click();
  await drawer(page, STEPSTONE.name).getByRole("button", { name: "Quelle löschen" }).click();
  await page
    .getByRole("dialog", { name: `„${STEPSTONE.name}“ löschen?` })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(page.getByText(/4 gefundene Stellen bleiben erhalten\.$/)).toBeVisible();
  await expect(row(page, STEPSTONE.name)).toHaveCount(0);
  await nav(page)
    .getByRole("link", { name: /Eingang/ })
    .click();
  await expect(jobMeta(page, KOTLIN_JOB.title!)).toContainText("stepstone.de");
  await expect(jobMeta(page, KOTLIN_JOB.title!)).not.toContainText("StepStone");
});
