import type { Page } from "@playwright/test";
import { CS_USERS, CompaniesServer, companiesRoutes } from "./support/companiesServer";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { JOB_ID, jobBody, jobRoutes } from "./support/jobFixtures";
import type { MockRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
// Below the 250 ms pause of SEARCH_LIMITS.debounceMs: every key lands inside the same pause.
const FAST_KEY_DELAY_MS = 40;
const JOB_PAGE = jobBody();

const dialog = (page: Page) => page.getByRole("dialog", { name: "Suche" });
const field = (page: Page) => dialog(page).getByRole("searchbox", { name: /durchsuchen/ });
const jobLink = (page: Page) =>
  dialog(page).getByRole("link", { name: /^Senior Backend Engineer \(Kotlin\)/ });
const searchCount = (requests: readonly string[]) =>
  requests.filter((key) => key === "GET /search").length;

/** The job page's fixture as the first own job of the server, so its hit opens a mocked page. */
function serverWithJobPage(): CompaniesServer {
  const server = new CompaniesServer();
  server.jobs.unshift({
    id: JOB_ID,
    user_id: CS_USERS.me,
    title: JOB_PAGE.title ?? "",
    company: JOB_PAGE.company ?? "",
    company_domain: "acme.de",
    status: JOB_PAGE.status,
    is_archived: false,
  });
  return server;
}

function searchRoutes(extra: MockRoutes = {}) {
  return companiesRoutes(serverWithJobPage(), extra, jobRoutes(JOB_PAGE));
}

async function openInbox(page: Page) {
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
}

async function searchFor(page: Page, text: string) {
  await page.keyboard.press("/");
  await expect(field(page)).toBeFocused();
  await field(page).fill(text);
}

test("search from the keyboard", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  await openInbox(page);
  await searchFor(page, "kotl");
  await expect(jobLink(page)).toBeVisible();
  await expect(dialog(page).getByRole("status")).toHaveText("2 Ergebnisse");
  await page.keyboard.press("ArrowDown");
  await expect(jobLink(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/jobs/${JOB_ID}`);
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: JOB_PAGE.title ?? "" })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("a company result opens the company detail", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  await openInbox(page);
  await searchFor(page, "acme");
  await dialog(page).getByRole("link", { name: "ACME GmbH acme.de" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?domain=acme.de`);
  await expect(page.getByRole("heading", { level: 1, name: "ACME GmbH" })).toBeVisible();
  await expect(dialog(page)).toBeHidden();
});

test("/ inside an input types a slash", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  await openInbox(page);
  await searchFor(page, "");
  await page.keyboard.type("a/b");
  await expect(field(page)).toHaveValue("a/b");
  await expect(dialog(page)).toHaveCount(1);
});

test("Escape after / with nothing focused leaves focus off the body", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  await openInbox(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await searchFor(page, "kotl");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
});

test("the sidebar button opens the search and Escape returns there", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await openInbox(page);
  const button = page.getByRole("complementary").getByRole("button", { name: "Suche" });
  await expect(button).toHaveAttribute("aria-keyshortcuts", "/");
  await button.click();
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test("mobile: Mehr › Suche opens the dialog, no horizontal scroll at 375", async ({
  page,
  mockApi,
}) => {
  await mockApi(searchRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await openInbox(page);
  await page.getByRole("button", { name: /^Mehr/ }).click();
  await page.getByRole("button", { name: "Suche" }).click();
  await expect(field(page)).toBeFocused();
  await field(page).fill("kotl");
  await expect(jobLink(page)).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  const box = await jobLink(page).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

test("typing fast sends one request per pause", async ({ page, mockApi }) => {
  const log = await mockApi(searchRoutes());
  await openInbox(page);
  await searchFor(page, "");
  await field(page).pressSequentially("kotlin", { delay: FAST_KEY_DELAY_MS });
  await expect(jobLink(page)).toBeVisible();
  expect(searchCount(log.requests)).toBe(1);
  await field(page).pressSequentially(" dev", { delay: FAST_KEY_DELAY_MS });
  await expect.poll(() => searchCount(log.requests)).toBe(2);
});

// The browser logs the provoked 429 as a console error; nothing else is allowed.
test.describe("refusals", () => {
  test.use({ allowedConsoleErrors: [/status of 429/] });

  test("a 429 shows the wait sentence in the dialog", async ({ page, mockApi }) => {
    await mockApi(
      searchRoutes({ "GET /search": { status: 429, body: { detail: "Rate limit exceeded" } } }),
    );
    await openInbox(page);
    await searchFor(page, "kotl");
    await expect(dialog(page).getByText("Zu viele Anfragen, bitte kurz warten.")).toBeVisible();
    await expect(page.getByText("Rate limit exceeded")).toHaveCount(0);
  });
});

test("Suche: screenshots in both themes", async ({ page, mockApi }) => {
  await mockApi(searchRoutes());
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openInbox(page);
      await searchFor(page, "ac");
      await expect(dialog(page).getByRole("heading", { level: 3, name: "Firmen" })).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `search-${size}-${scheme}`);
    }
  }
});
