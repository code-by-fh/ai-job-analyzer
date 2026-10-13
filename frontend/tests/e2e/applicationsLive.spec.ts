import type { Page } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import { ACTIVE_ITEMS, applicationsRoutes, CLOSED_ITEMS } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow, pushEvent } from "./support/jobFixtures";
import { setRoutes, type ApiLog, type MockRoutes, type MutableRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const LIST = "#applications-list";
const section = (page: Page, name: string) => page.getByRole("region", { name });
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);
const job7 = ACTIVE_ITEMS.find((item) => item.id === "job-7")!;
const others = ACTIVE_ITEMS.filter((item) => item.id !== "job-7");
const CHANGED_AT = "2026-10-08T07:00:00+00:00";

/** The server after the job page set job-7 to Interview with a date (what a status write leaves). */
const invited: JobListItemBody = {
  ...job7,
  status: "INTERVIEW",
  next_follow_up_at: null,
  interview_at: "2026-10-15T08:00:00+00:00",
  status_changed_at: CHANGED_AT,
};
const rejected: JobListItemBody = { ...job7, status: "REJECTED", status_changed_at: CHANGED_AT };

type MockApi = (routes: MockRoutes) => Promise<ApiLog>;

/** Bewerbungen with the realtime socket up and keyboard focus on the Kotlin Developer row. */
async function openWithKotlinFocused(
  page: Page,
  mockApi: MockApi,
): Promise<{ routes: MutableRoutes; log: ApiLog }> {
  const routes = applicationsRoutes();
  const log = await mockApi(routes);
  await page.goto("/applications");
  await connected(log);
  const link = page.getByRole("link", { name: "Kotlin Developer" });
  await link.focus();
  await expect(link).toBeFocused();
  return { routes, log };
}

/** The server moves job-7 to Abgesagt and the socket reports the change. */
function rejectKotlin({ routes, log }: { routes: MutableRoutes; log: ApiLog }): void {
  setRoutes(routes, applicationsRoutes({ active: others, closed: [rejected, ...CLOSED_ITEMS] }));
  pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
}

/** Records every focusout the list sees, with whether it named a next target. */
async function recordFocusOuts(page: Page) {
  await page.locator(LIST).evaluate((list: HTMLElement) => {
    const seen: string[] = [];
    Object.assign(window, { focusOuts: seen });
    list.addEventListener("focusout", (event) => {
      seen.push(event.relatedTarget === null ? "no target" : "a target");
    });
  });
  return () => page.evaluate(() => (window as unknown as { focusOuts: string[] }).focusOuts);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`a status change elsewhere moves the row and its focus at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      const { routes, log } = await openWithKotlinFocused(page, mockApi);
      setRoutes(routes, applicationsRoutes({ active: [...others, invited] }));
      pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
      const moved = section(page, "Interview").getByRole("link", { name: "Kotlin Developer" });
      await expect(moved).toBeFocused();
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(1);
      await expect(page.getByText("6 aktiv · 1 fällig")).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-live-${size}-${scheme}`);
    });
  }
}

/*
  The plan's open assumption: Chrome fires focusout when React removes the focused row. It does,
  with no relatedTarget, so useListFocus must keep the mark on such a focusout (it does).
*/
test("Chrome reports the removed row as a focusout without a target and focus follows the job", async ({
  page,
  mockApi,
}) => {
  const { routes, log } = await openWithKotlinFocused(page, mockApi);
  const focusOuts = await recordFocusOuts(page);
  setRoutes(routes, applicationsRoutes({ active: [...others, invited] }));
  pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
  const moved = section(page, "Interview").getByRole("link", { name: "Kotlin Developer" });
  await expect(moved).toBeFocused();
  expect(await focusOuts()).toEqual(["no target"]);
});

test("a row that leaves the list hands focus to the list", async ({ page, mockApi }) => {
  const server = await openWithKotlinFocused(page, mockApi);
  rejectKotlin(server);
  await expect(page.getByRole("button", { name: "Abgeschlossen (3)" })).toBeVisible();
  await expect(page.locator(LIST)).toBeFocused();
});

test("a change elsewhere leaves focus alone when it is outside the list", async ({
  page,
  mockApi,
}) => {
  const server = await openWithKotlinFocused(page, mockApi);
  const searchField = page.getByRole("searchbox", { name: "Bewerbungen durchsuchen" });
  await searchField.focus();
  rejectKotlin(server);
  await expect(page.getByRole("button", { name: "Abgeschlossen (3)" })).toBeVisible();
  await expect(searchField).toBeFocused();
});

/*
  Focus that went from the list to a toast and then dropped to the body stays there. Dismissing
  the toast would return focus to where it came from (useToastFocusReturn), so blur() stands in
  for a toast button that goes away without a return.
*/
test("a change elsewhere does not pull focus back that left the list for a toast", async ({
  page,
  mockApi,
}) => {
  const server = await openWithKotlinFocused(page, mockApi);
  pushEvent(server.log, { type: "global_error" });
  const close = page.getByRole("button", { name: "Meldung schließen" });
  await close.focus();
  await close.blur();
  rejectKotlin(server);
  await expect(page.getByRole("button", { name: "Abgeschlossen (3)" })).toBeVisible();
  await expect(page.locator(LIST)).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
