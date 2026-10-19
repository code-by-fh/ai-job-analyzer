import type { Page } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import { dueListPath, INBOX_TABS, inboxListPath, type InboxTab } from "../../src/api/jobListPaths";
import type { SetupStatusBody } from "../../src/api/setup";
import { VIEWPORTS } from "./support/constants";
import { SETUP_DONE } from "./support/fixtures";
import {
  BELOW_ITEMS,
  DISMISSED_ITEMS,
  inboxRoutes,
  listItem,
  NEW_ITEMS,
  page as pageOf,
} from "./support/inboxFixtures";
import { fixNow, pushEvent, UPDATED } from "./support/jobFixtures";
import type { ApiLog, MockResponse, MockRoutes } from "./support/mockApi";
import { live, setRoutes } from "./support/mockApi";
import { horizontalOverflow } from "./support/page";
import { expect, test } from "./support/test";

// The journeys in spec section 7 that cross features. Per-feature assertions live in the
// inbox*.spec.ts files; here a small fake server keeps the lists, so every refetch after a click
// sees what the real server would answer.

const [KOTLIN, JAVA, HHLA] = NEW_ITEMS as [JobListItemBody, JobListItemBody, JobListItemBody];
const SAVED_THRESHOLD = 60;
const THRESHOLD_BELOW = { is_archived: true, archive_reason: "THRESHOLD" };
const IMPORTED = listItem("job-31", {
  title: "Data Engineer",
  company: "Zalando",
  match_score: 41,
  ...THRESHOLD_BELOW,
});
const FIELD_NAME = "Schwellwert für automatisches Aussortieren";
const KEYED_IDS = [...NEW_ITEMS, ...BELOW_ITEMS, ...DISMISSED_ITEMS, IMPORTED].map((job) => job.id);

type Lists = Record<InboxTab, JobListItemBody[]>;

/** The server's view of the inbox: three lists and the saved threshold. */
class FakeServer {
  readonly lists: Lists = {
    new: [...NEW_ITEMS],
    below: [...BELOW_ITEMS],
    dismissed: [...DISMISSED_ITEMS],
  };
  threshold = SAVED_THRESHOLD;
  /** Jobs the user restored (restore_job sets kept_by_user): a threshold never hides them again. */
  readonly kept = new Set<string>();
  /** Favourites are protected the same way (_jobs_to_archive); the list body carries no flag. */
  readonly favourites = new Set<string>();
  /** Shortlisted jobs: out of every inbox list, until a status change back to OPEN. */
  private readonly away = new Map<string, JobListItemBody>();
  private readonly order = new Map(
    [...NEW_ITEMS, ...BELOW_ITEMS, ...DISMISSED_ITEMS, IMPORTED].map((job, index) => [
      job.id,
      index,
    ]),
  );

  /** Moves a job to another list, as a PATCH, a status change or an import would. */
  move(id: string, to: InboxTab | null, flags: Partial<JobListItemBody> = {}): void {
    const job =
      this.away.get(id) ??
      Object.values(this.lists)
        .flat()
        .find((candidate) => candidate.id === id);
    for (const tab of INBOX_TABS) this.lists[tab] = this.lists[tab].filter((j) => j.id !== id);
    this.away.delete(id);
    if (!job) return;
    if (!to) {
      this.away.set(id, job);
      return;
    }
    const moved = { ...job, is_archived: to !== "new", archive_reason: null, ...flags };
    this.lists[to] = [...this.lists[to], moved].sort(
      (a, b) => this.order.get(a.id)! - this.order.get(b.id)!,
    );
  }

  /** Jobs the threshold would hide (new, scored below it, not kept or favourite) or bring back. */
  affected(threshold: number): { hide: string[]; restore: string[] } {
    const score = (job: JobListItemBody) => job.match_score ?? 0;
    const protectedJob = (job: JobListItemBody) =>
      this.kept.has(job.id) || this.favourites.has(job.id);
    return {
      hide: this.lists.new
        .filter((job) => score(job) < threshold && !protectedJob(job))
        .map((job) => job.id),
      restore: this.lists.below.filter((job) => score(job) >= threshold).map((job) => job.id),
    };
  }

  apply(threshold: number): { archived: number; restored: number } {
    const { hide, restore } = this.affected(threshold);
    for (const id of hide) this.move(id, "below", { archive_reason: "THRESHOLD" });
    for (const id of restore) this.move(id, "new");
    this.threshold = threshold;
    return { archived: hide.length, restored: restore.length };
  }
}

function listResponses(server: FakeServer): MockRoutes {
  const entries = INBOX_TABS.flatMap((tab): [string, MockResponse][] => [
    [`GET ${inboxListPath(tab, 0)}`, live(() => pageOf(server.lists[tab]))],
    [
      `GET ${inboxListPath(tab, 0, 1)}`,
      live(() => pageOf(server.lists[tab].slice(0, 1), server.lists[tab].length)),
    ],
  ]);
  return Object.fromEntries(entries);
}

/** PATCH (archive or restore) and the status change of every known job. */
function triageResponses(server: FakeServer): MockRoutes {
  const entries = KEYED_IDS.flatMap((id): [string, MockResponse][] => [
    [
      `PATCH /jobs/${id}`,
      {
        body: null,
        respond: (sent) => {
          const archived = (sent as { is_archived: boolean }).is_archived;
          if (!archived) server.kept.add(id);
          server.move(id, archived ? "dismissed" : "new", {
            archive_reason: archived ? "USER" : null,
          });
          return UPDATED.body;
        },
      },
    ],
    [
      `POST /jobs/${id}/status`,
      {
        body: null,
        respond: (sent) => {
          const to = (sent as { to: string }).to;
          server.move(id, to === "OPEN" ? "new" : null);
          return { id, status: to };
        },
      },
    ],
  ]);
  return Object.fromEntries(entries);
}

function thresholdResponses(server: FakeServer): MockRoutes {
  const previews = [70, 90].map((value): [string, MockResponse] => [
    `GET /matching-preference/preview?threshold=${value}`,
    live(() => {
      const { hide, restore } = server.affected(value);
      return { threshold: value, would_archive: hide.length, would_restore: restore.length };
    }),
  ]);
  return {
    ...Object.fromEntries(previews),
    "GET /settings": live(() => ({ language: "de", match_threshold: server.threshold })),
    "GET /jobs/counts": live(() => ({ status_counts: { OPEN: server.lists.new.length } })),
    "POST /matching-preference": {
      body: null,
      respond: (sent) => {
        const result = server.apply((sent as { match_threshold: number }).match_threshold);
        return { status: "saved", match_threshold: server.threshold, ...result };
      },
    },
  };
}

function serverRoutes(server: FakeServer, due: readonly JobListItemBody[] = []): MockRoutes {
  return {
    ...listResponses(server),
    ...triageResponses(server),
    ...thresholdResponses(server),
    [`GET ${dueListPath()}`]: { body: pageOf(due) },
  };
}

const STARTED: MockRoutes = {
  "POST /scraper/import-job": { body: { status: "Started", job_id: "crawl-9" } },
};

async function open(
  page: Page,
  mockApi: (routes: MockRoutes) => Promise<ApiLog>,
  path: string,
  prepare: (server: FakeServer) => void = () => undefined,
) {
  const server = new FakeServer();
  prepare(server);
  const log = await mockApi(inboxRoutes({}, { ...serverRoutes(server), ...STARTED }));
  await page.goto(path);
  return { server, log };
}

const sentTo = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

const tabCount = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(`^${name}`) });

async function expectCounts(page: Page, counts: [number, number, number]) {
  const names = ["Neu", "Unter Schwellwert", "Von dir aussortiert"];
  for (const [index, name] of names.entries()) {
    await expect(tabCount(page, name)).toContainText(String(counts[index]));
  }
}

const preview = (page: Page) => page.getByRole("complementary", { name: "Vorschau" });
const link = (page: Page, name: string) => page.getByRole("link", { name });
const toasts = (page: Page) => page.locator(".toasts");
const toastWith = (page: Page, text: string) =>
  toasts(page).locator(".toast").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

test("a morning session: shortlist and sort out from the pane and rows, each with its undo", async ({
  page,
  mockApi,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  const server = new FakeServer();
  const due = [
    listItem("job-40", { status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00+00:00" }),
  ];
  const log = await mockApi(inboxRoutes({ due }, serverRoutes(server, due)));
  await page.goto("/inbox");
  await expectCounts(page, [3, 2, 1]);
  await expect(page.getByRole("region", { name: "Anstehend" })).toBeVisible();
  await expect(preview(page).getByRole("heading", { level: 2 })).toHaveText(KOTLIN.title!);

  await preview(page)
    .getByRole("button", { name: `Vormerken: ${KOTLIN.title}` })
    .click();
  await expect(page.getByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen.")).toBeVisible();
  await expect(preview(page).getByRole("heading", { level: 2 })).toHaveText(JAVA.title!);
  await expectCounts(page, [2, 2, 1]);
  await toastWith(page, "Vorgemerkt: N26").getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht: N26 ist wieder unter Neu.")).toBeVisible();
  await expect(link(page, KOTLIN.title!)).toBeVisible();
  await expectCounts(page, [3, 2, 1]);

  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: `Aussortieren: ${JAVA.title}` })
    .click();
  await expect(link(page, JAVA.title!)).toHaveCount(0);
  await expectCounts(page, [2, 2, 2]);
  await toastWith(page, "Aussortiert: Personio")
    .getByRole("button", { name: "Rückgängig" })
    .click();
  await expect(page.getByText("Rückgängig gemacht: Personio ist wieder unter Neu.")).toBeVisible();
  await expect(link(page, JAVA.title!)).toBeVisible();
  await expectCounts(page, [3, 2, 1]);
  await expect(page.getByRole("region", { name: "Anstehend" })).toBeVisible();

  expect(sentTo(log, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }, { to: "OPEN" }]);
  expect(sentTo(log, "PATCH /jobs/job-2")).toEqual([{ is_archived: true }, { is_archived: false }]);
});

test("a restored match and a favourite stay in Neu when a higher threshold would hide them", async ({
  page,
  mockApi,
}) => {
  const { log } = await open(page, mockApi, "/inbox", (server) => server.favourites.add(HHLA.id));
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: `Aussortieren: ${JAVA.title}` })
    .click();
  await expectCounts(page, [2, 2, 2]);
  await page.getByRole("tab", { name: /^Von dir aussortiert/ }).click();
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: `Wiederherstellen: ${JAVA.title}` })
    .click();
  await expect(page.getByText("Personio ist wieder im Eingang.")).toBeVisible();
  await expectCounts(page, [3, 2, 1]);

  // 90 is above all three scores (86, 72, 64): only the unprotected Kotlin match is hidden.
  await page.getByRole("tab", { name: /^Unter Schwellwert/ }).click();
  await page.getByRole("spinbutton", { name: FIELD_NAME }).fill("90");
  await expect(
    page.getByText("Bei 90: 1 Treffer würden ausgeblendet, 0 kämen zurück."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(
    page.getByText("Schwellwert 90 übernommen: 1 ausgeblendet, 0 zurückgeholt."),
  ).toBeVisible();
  await expectCounts(page, [2, 3, 1]);
  await page.getByRole("tab", { name: /^Neu/ }).click();
  await expect(link(page, JAVA.title!)).toBeVisible();
  await expect(link(page, HHLA.title!)).toBeVisible();
  await expect(link(page, KOTLIN.title!)).toHaveCount(0);
  expect(sentTo(log, "POST /matching-preference")).toEqual([
    { match_threshold: 90, apply_to_existing: true },
  ]);
});

test("triage and threshold: a sorted-out match stays out when the threshold moves", async ({
  page,
  mockApi,
}) => {
  const { log } = await open(page, mockApi, "/inbox");
  await page.getByRole("button", { name: `Aussortieren: ${JAVA.title}` }).click();
  await expectCounts(page, [2, 2, 2]);
  await page.getByRole("tab", { name: /^Unter Schwellwert/ }).click();
  await page.getByRole("spinbutton", { name: FIELD_NAME }).fill("70");
  await expect(
    page.getByText("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(
    page.getByText("Schwellwert 70 übernommen: 1 ausgeblendet, 0 zurückgeholt."),
  ).toBeVisible();
  await expect(link(page, HHLA.title!)).toBeVisible();
  await expectCounts(page, [1, 3, 2]);

  await toastWith(page, "Schwellwert 70 übernommen")
    .getByRole("button", { name: "Rückgängig" })
    .click();
  await expect(page.getByText("Rückgängig gemacht: Schwellwert wieder 60.")).toBeVisible();
  await expect(link(page, HHLA.title!)).toHaveCount(0);
  await expectCounts(page, [2, 2, 2]);
  await page.getByRole("tab", { name: /^Neu/ }).click();
  await expect(link(page, HHLA.title!)).toBeVisible();
  await expect(link(page, JAVA.title!)).toHaveCount(0);

  expect(sentTo(log, "PATCH /jobs/job-2")).toEqual([{ is_archived: true }]);
  expect(sentTo(log, "POST /matching-preference")).toEqual([
    { match_threshold: 70, apply_to_existing: true },
    { match_threshold: 60, apply_to_existing: true },
  ]);
});

test("import: a weak posting lands below the threshold and can be taken into the inbox", async ({
  page,
  mockApi,
}) => {
  const { server, log } = await open(page, mockApi, "/inbox");
  await page.getByRole("button", { name: "Per URL importieren: eine einzelne Stelle" }).click();
  await page.getByLabel("Link zur Stellenanzeige").fill("https://karriere.example.de/jobs/1");
  await page.getByRole("button", { name: "Importieren und bewerten" }).click();
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  server.lists.below.push(IMPORTED);
  pushEvent(log, {
    type: "new_job",
    crawl_job_id: "crawl-9",
    job: { id: IMPORTED.id, match_score: 41, is_archived: true },
  });
  pushEvent(log, { type: "crawl_job_completed", job_id: "crawl-9" });
  await expect(
    toasts(page).getByText(
      "Importiert: 41 · Schwach, unter deinem Schwellwert. Du findest die Stelle unter „Unter Schwellwert“.",
    ),
  ).toBeVisible();
  await expectCounts(page, [3, 3, 1]);

  await page.getByRole("tab", { name: /^Unter Schwellwert/ }).click();
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: `Wiederherstellen: ${IMPORTED.title}` })
    .click();
  await expect(page.getByText("Zalando ist wieder im Eingang.")).toBeVisible();
  await page.getByRole("tab", { name: /^Neu/ }).click();
  await expect(link(page, IMPORTED.title!)).toBeVisible();
  expect(sentTo(log, "POST /scraper/import-job")).toEqual([
    { url: "https://karriere.example.de/jobs/1" },
  ]);
  expect(sentTo(log, "PATCH /jobs/job-31")).toEqual([{ is_archived: false }]);
});

// AI present, no source and no job yet (unlike the onboarding spec's FIRST_RUN, which has no AI and no profile): the inbox shows
// once the first job exists.
const AI_NO_SOURCE: SetupStatusBody = {
  has_source: false,
  ai_configured: true,
  profile_complete: true,
  has_jobs: false,
};

test("first run: the first found job turns the onboarding into the inbox", async ({
  page,
  mockApi,
}) => {
  const server = new FakeServer();
  server.lists.new = [];
  const routes = inboxRoutes(
    { new: [] },
    {
      ...serverRoutes(server),
      ...STARTED,
      "GET /platforms": { body: [] },
      "GET /setup-status": { body: AI_NO_SOURCE },
    },
  );
  const log = await mockApi(routes);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();

  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  server.lists.new = [KOTLIN];
  // The server now knows a job, but still no source: the setup view gives way to the inbox.
  setRoutes(routes, { "GET /setup-status": { body: { ...SETUP_DONE, has_source: false } } });
  pushEvent(log, {
    type: "new_job",
    crawl_job_id: "crawl-9",
    job: { id: KOTLIN.id, match_score: 86, is_archived: false },
  });
  pushEvent(log, { type: "crawl_job_completed", job_id: "crawl-9" });
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
  // Focus lands on the inbox title once the onboarding gives way.
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeFocused();
  await expect(link(page, KOTLIN.title!)).toBeVisible();
});

test("no horizontal scroll at 375px with due card, threshold and setup view", async ({
  page,
  mockApi,
}) => {
  const due = [
    listItem("job-40", { status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00+00:00" }),
  ];
  await mockApi(inboxRoutes({ due }));
  await page.setViewportSize(VIEWPORTS.narrow);
  for (const path of ["/inbox", "/inbox?tab=unter", "/inbox?view=setup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  }
});
