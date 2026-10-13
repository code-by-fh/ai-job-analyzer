import type { Locator, Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow, JOB_ID, jobBody, jobRoutes } from "./support/jobFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const ACTIVE_KEY = `GET ${applicationsListPath({ group: "active", q: "" }, 0)}`;
const NOT_FOUND = 404;
const MIN_HIT_TARGET_PX = 44;
const FAILED_LIST = /Failed to load resource: the server responded with a status of 404/;

test.beforeEach(async ({ page }) => fixNow(page));

const section = (page: Page, name: string) => page.getByRole("region", { name });
const rowsOf = (region: Locator) => region.getByRole("listitem");

async function open(page: Page) {
  await page.goto("/applications");
  await expect(section(page, "Beworben")).toBeVisible();
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Bewerbungen shows the phase sections at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await expect(page.getByRole("heading", { level: 1, name: "Bewerbungen" })).toBeVisible();
      await expect(page.locator(".applications .mast-deck")).toHaveText("6 aktiv · 2 fällig");
      await expect(page.locator(".applications").getByRole("heading", { level: 2 })).toHaveText([
        "Vorgemerkt",
        "Beworben",
        "Interview",
      ]);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-${size}-${scheme}`);
    });
  }
}

test("rows show the next step, the date and the documents", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await open(page);
  const applied = rowsOf(section(page, "Beworben"));
  await expect(applied).toHaveCount(2);
  const overdue = applied.nth(0);
  await expect(overdue).toContainText("Kotlin Developer");
  await expect(overdue.locator(".next-cell")).toHaveText("Nachfassen");
  await expect(overdue.locator(".next-cell")).toHaveClass(/t-warn/);
  await expect(overdue.locator(".when-cell")).toHaveText("überfällig seit 06.10.2026");
  await expect(overdue).toContainText("Beide fertig");
  await expect(overdue.getByRole("link", { name: "Kotlin Developer" })).toHaveAttribute(
    "href",
    "/jobs/job-7",
  );
  const interview = rowsOf(section(page, "Interview")).first();
  await expect(interview.locator(".when-cell")).toHaveText("Termin in 1 Tag");
  await expect(interview.locator(".when-cell")).not.toHaveClass(/t-warn/);
  await expect(interview.locator(".next-cell")).not.toHaveClass(/t-warn/);
});

test("a regenerating application stays in Beworben", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await open(page);
  const regenerating = rowsOf(section(page, "Beworben")).nth(1);
  await expect(regenerating).toContainText("Backend Engineer");
  await expect(regenerating.locator(".next-cell")).toHaveText("Auf Antwort warten");
  await expect(regenerating).toContainText("Wird erstellt");
  await expect(rowsOf(section(page, "Vorgemerkt")).locator(".arow-link")).toHaveText([
    "Platform Engineer",
    "Senior Backend Engineer (Kotlin)",
    "Java Developer",
  ]);
  await expect(rowsOf(section(page, "Vorgemerkt")).nth(1)).toContainText("seit 2 Tagen");
  await expect(section(page, "Angebot")).toHaveCount(0);
});

test("the nav badge counts the same due applications as the header", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await open(page);
  const deck = page.locator(".applications .mast-deck");
  await expect(deck).toHaveText(/\d+ fällig$/);
  const due = /(\d+) fällig$/.exec((await deck.textContent()) ?? "")?.[1];
  expect(due).toBe("2");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  const badge = nav.getByRole("link", { name: /Bewerbungen/ }).locator(".count-badge-neutral");
  await expect(badge.locator(".sr-only")).toHaveText(`${due} fällig`);
});

test("a row opens the job page", async ({ page, mockApi }) => {
  // job-1 is the job page fixture (jobBody) as a row.
  await mockApi({ ...jobRoutes(jobBody()), ...applicationsRoutes() });
  await open(page);
  await page.getByRole("link", { name: "Senior Backend Engineer (Kotlin)" }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the first run points to the inbox", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ active: [], closed: [] }));
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
});

test.describe("a list that cannot be loaded", () => {
  test.use({ allowedConsoleErrors: [FAILED_LIST] });

  test("offers a retry", async ({ page, mockApi }) => {
    const failing = { [ACTIVE_KEY]: { status: NOT_FOUND, body: { detail: "boom" } } };
    const routes = applicationsRoutes({}, failing);
    await mockApi(routes);
    await page.goto("/applications");
    await expect(page.getByText("Das wurde nicht gefunden.")).toBeVisible();
    await expect(page.getByText("boom")).toHaveCount(0);
    setRoutes(routes, applicationsRoutes());
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(section(page, "Beworben")).toBeVisible();
  });
});

test("rows stack with visible labels at 375 px without horizontal scroll", async ({
  page,
  mockApi,
}) => {
  await mockApi(applicationsRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await open(page);
  const first = rowsOf(section(page, "Beworben")).first();
  await expect(first.getByText("Nächster Schritt:")).toBeVisible();
  const box = (await first.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await horizontalOverflow(page)).toBe(0);
});
