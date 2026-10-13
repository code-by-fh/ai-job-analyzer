import type { Page } from "@playwright/test";
import { fixNow, jobBody, jobRoutes, jobUrl, NOW_ISO, READY, UPDATED } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { pauseClockSoon } from "./support/page";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const PATCH = "PATCH /jobs/job-1";
const PAUSE_OFFSET_MS = 1000;
const NEW_TODO_ID = "7f1c2a4e-3b5d-4c6e-8f90-a1b2c3d4e5f6";
const EXISTING_TODO = { id: "t1", text: "Gehaltsband recherchieren", done: false };
const NEW_TODO = { id: NEW_TODO_ID, text: "Referenzen anfragen", done: false };
const NOTE = "Ansprechpartnerin ist Frau Weber";
const FAILED_SAVE = /status of 500/;

test.beforeEach(async ({ page }) => fixNow(page));

const patchBodies = (log: ApiLog) =>
  log.calls.filter((call) => call.key === PATCH).map((call) => call.body);

async function openHistory(page: Page) {
  await page.goto(jobUrl("verlauf"));
  await expect(page.getByRole("heading", { name: "Verlauf" }).first()).toBeVisible();
}

function todosOf(sent: unknown): unknown[] {
  const todos = (sent as { todos?: unknown } | null)?.todos;
  if (!Array.isArray(todos)) throw new Error("fake server: PATCH body without a todos list");
  return todos;
}

const applied = () => jobBody({ status: "APPLIED", ...READY });

test("saves a note after the autosave pause", async ({ page, mockApi }) => {
  const log = await mockApi(jobRoutes(applied(), { [PATCH]: UPDATED }));
  await openHistory(page);
  await page.getByLabel("Notizen").fill(NOTE);
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible();
  expect(patchBodies(log)).toEqual([{ notes: NOTE }]);
});

/** Stops the page clock, so the 800 ms autosave pause cannot elapse: only leaving can send the note. */
async function freezeTimers(page: Page) {
  await pauseClockSoon(page, PAUSE_OFFSET_MS);
}

async function expectSingleNoteSavedWithoutDialog(page: Page, log: ApiLog) {
  await expect.poll(() => patchBodies(log)).toEqual([{ notes: NOTE }]);
  // The poll stops at the first match; after the network settles there must still be one save.
  await page.waitForLoadState("networkidle");
  expect(patchBodies(log)).toEqual([{ notes: NOTE }]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("flushes a pending note on tab switch without asking", async ({ page, mockApi }) => {
  const log = await mockApi(jobRoutes(applied(), { [PATCH]: UPDATED }));
  await page.clock.install({ time: new Date(NOW_ISO) });
  await openHistory(page);
  await freezeTimers(page);
  await page.getByLabel("Notizen").fill(NOTE);
  expect(patchBodies(log)).toEqual([]);
  await page.getByRole("tab", { name: "Passung" }).click();
  await expectSingleNoteSavedWithoutDialog(page, log);
});

test("flushes a pending note when following a link to another page without asking", async ({
  page,
  mockApi,
}) => {
  // The link lands on Einstellungen, which loads its own data.
  const settings = settingsRoutes(new SettingsServer(), {}, {});
  const log = await mockApi(jobRoutes(applied(), { ...settings, [PATCH]: UPDATED }));
  await page.clock.install({ time: new Date(NOW_ISO) });
  await openHistory(page);
  await freezeTimers(page);
  await page.getByLabel("Notizen").fill(NOTE);
  expect(patchBodies(log)).toEqual([]);
  await page.getByRole("link", { name: "Einstellungen" }).first().click();
  await expect(page).toHaveURL(/\/settings/);
  await expectSingleNoteSavedWithoutDialog(page, log);
});

test("adds a to-do and ticks it, sending both changes in order", async ({ page, mockApi }) => {
  // crypto.randomUUID is random, so the test fixes it to see the sent id.
  await page.addInitScript((id) => {
    crypto.randomUUID = () => id as `${string}-${string}-${string}-${string}-${string}`;
  }, NEW_TODO_ID);
  // A small fake server: a write changes what the refetch after it returns.
  let stored: unknown[] = [EXISTING_TODO];
  const log = await mockApi(
    jobRoutes(applied(), {
      "GET /jobs/job-1": { body: null, respond: () => ({ ...applied(), todos: stored }) },
      [PATCH]: {
        body: null,
        respond: (sent) => {
          stored = todosOf(sent);
          return UPDATED.body;
        },
      },
    }),
  );
  await openHistory(page);
  await page.getByLabel("Neue Aufgabe").fill(NEW_TODO.text);
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.getByRole("checkbox", { name: NEW_TODO.text }).click();
  await expect(page.getByRole("checkbox", { name: NEW_TODO.text })).toBeChecked();
  await expect
    .poll(() => patchBodies(log))
    .toEqual([
      { todos: [EXISTING_TODO, NEW_TODO] },
      { todos: [EXISTING_TODO, { ...NEW_TODO, done: true }] },
    ]);
});

test.describe("a failing to-do save", () => {
  test.use({ allowedConsoleErrors: [FAILED_SAVE] });

  test("rolls the tick back and shows the error", async ({ page, mockApi }) => {
    const failing = { status: 500, body: { detail: "boom" } };
    const log = await mockApi(jobRoutes(applied(), { [PATCH]: failing }));
    await openHistory(page);
    // click, not check: the rollback may land before check() re-reads the state.
    await page.getByRole("checkbox", { name: EXISTING_TODO.text }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Der Server hat einen Fehler gemeldet" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: EXISTING_TODO.text })).not.toBeChecked();
    expect(patchBodies(log)).toEqual([{ todos: [{ ...EXISTING_TODO, done: true }] }]);
  });
});

test("lists the history newest first, ending with the day the job was found", async ({
  page,
  mockApi,
}) => {
  const entry = (id: number, to: string, day: string) => ({
    id,
    from_status: null,
    to_status: to,
    changed_at: `2026-10-${day}T08:00:00+00:00`,
    note: null,
  });
  // Deliberately not in date order: the page sorts.
  const history = [
    entry(2, "APPLIED", "06"),
    entry(3, "INTERVIEW", "07"),
    entry(1, "DRAFTED", "04"),
  ];
  await mockApi(jobRoutes(applied(), { "GET /jobs/job-1/history": { body: history } }));
  await openHistory(page);
  await expect(page.getByRole("list", { name: "Verlauf" }).getByRole("listitem")).toHaveText([
    /Phase: Interview/,
    /Phase: Beworben/,
    /Phase: Vorgemerkt/,
    /Gefunden/,
  ]);
});
