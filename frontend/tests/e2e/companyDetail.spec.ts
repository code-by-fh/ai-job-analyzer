import type { Page } from "@playwright/test";
import { CompaniesServer, companiesRoutes } from "./support/companiesServer";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { COMPANY_PROFILE, jobBody, jobRoutes, jobUrl, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

// Initech has no profile yet: the API answers 404 and Chromium logs that response.
const MISSING_PROFILE = /status of 404/;
const RUNNING = /Firmenrecherche läuft/;
const DEEP_DIVE_RUNNING = /Die Tiefenrecherche läuft/;
const MIN_HIT_TARGET_PX = 44;

const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const jobsSection = (page: Page, name: string) =>
  page.getByRole("region", { name: `Deine Stellen bei ${name}` });
/** The realtime socket connects after the page has loaded; events need it. */
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);
const focusOnBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);

async function openDetail(page: Page, domain: string, name: string) {
  await page.goto(`/companies?domain=${domain}`);
  await expect(title(page, name)).toBeVisible();
}

test.describe("company research", () => {
  test.use({ allowedConsoleErrors: [MISSING_PROFILE] });

  test("research journey: start, progress, the profile on its event, the list's state", async ({
    page,
    mockApi,
  }) => {
    const companies = new CompaniesServer();
    const log = await mockApi(companiesRoutes(companies));
    await openDetail(page, "initech.de", "Initech AG");
    await expect(
      page.getByRole("heading", { level: 3, name: "Noch keine Recherche zu Initech AG" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByRole("status").filter({ hasText: RUNNING })).toBeVisible();
    expect(companies.researchStarts).toEqual([{ domain: "initech.de", force: false }]);
    expect(await focusOnBody(page)).toBe(false);

    companies.profiles["initech.de"] = {
      ...COMPANY_PROFILE,
      domain: "initech.de",
      name: "Initech AG",
      analyzed_at: "2026-10-09T08:00:00+00:00",
    };
    await connected(log);
    pushEvent(log, { type: "company_profile_ready", domain: "initech.de" });
    await expect(
      page.getByText("Solider Mittelständler mit wachsendem Plattform-Team."),
    ).toBeVisible();
    await expect(page.getByText(RUNNING)).toHaveCount(0);
    expect(await focusOnBody(page)).toBe(false);

    await page.getByRole("link", { name: "Alle Firmen" }).click();
    await expect(
      page
        .getByRole("list", { name: "Firmen" })
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Initech AG", exact: true }) }),
    ).toContainText("initech.de · Recherchiert am 09.10.2026 · 1 Stelle");
  });
});

test("a reload during a deep dive shows it running and its result on its end event", async ({
  page,
  mockApi,
}) => {
  const companies = new CompaniesServer();
  const run = {
    focus: "Gehalt Senior Backend",
    deep_dive_running: true,
    deep_dive_started_at: "2026-10-16T09:30:00+00:00",
    deep_dive_error: null,
    deep_dive_result: null as string | null,
  };
  companies.profiles["acme.de"]!.deep_dive_runs = [run];
  const log = await mockApi(companiesRoutes(companies));
  await openDetail(page, "acme.de", "ACME GmbH");
  await expect(page.getByText(DEEP_DIVE_RUNNING)).toBeVisible();
  await expect(page.getByRole("button", { name: "Jetzt recherchieren" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  // The server's request thread stores the result and ends the run; its end event reaches the page.
  Object.assign(run, { deep_dive_running: false, deep_dive_started_at: null });
  run.deep_dive_result = "Band 75-90 Tsd. laut Portalen.";
  await connected(log);
  pushEvent(log, { type: "deep_dive_ended", domain: "acme.de" });
  await expect(page.getByText("Band 75-90 Tsd. laut Portalen.")).toBeVisible();
  await expect(page.getByText(DEEP_DIVE_RUNNING)).toHaveCount(0);
});

test("the detail lists the own jobs, active first, the archived one marked", async ({
  page,
  mockApi,
}) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await openDetail(page, "acme.de", "ACME GmbH");
  await expect(page.getByText("acme.de · 2 Stellen")).toBeVisible();
  const links = jobsSection(page, "ACME GmbH").getByRole("link");
  await expect(links).toHaveText([
    /^Senior Backend Engineer\s*Treffer$/,
    /^Platform Engineer\s*Aussortiert$/,
  ]);
  await expect(links.first()).toHaveAttribute("href", "/jobs/acme-1");
});

test("the job page's 'Alle Firmen' link lands on this detail", async ({ page, mockApi }) => {
  const job = jobBody({ status: "DRAFTED", company_domain: "acme.de" });
  await mockApi(companiesRoutes(new CompaniesServer(), {}, jobRoutes(job)));
  await page.goto(jobUrl("firma"));
  await expect(page.getByRole("heading", { name: "Gesamtbewertung" })).toBeVisible();
  await page.getByRole("link", { name: "Alle Firmen" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?domain=acme.de`);
  await expect(title(page, "ACME GmbH")).toBeVisible();
  await expect(jobsSection(page, "ACME GmbH")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Firmenprofil" })).toBeVisible();
});

test("the way back keeps the list's search and scope", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await page.goto("/companies?q=acme&alle=1");
  await page.getByRole("link", { name: "ACME GmbH", exact: true }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?domain=acme.de&q=acme&alle=1`);
  await expect(title(page, "ACME GmbH")).toBeFocused();
  await page.getByRole("link", { name: "Alle Firmen" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?q=acme&alle=1`);
  await expect(page.getByRole("searchbox", { name: "Firmen durchsuchen" })).toHaveValue("acme");
  await expect(
    page.getByRole("checkbox", { name: "Alle Firmen dieser Installation" }),
  ).toBeChecked();
});

test("Firmen detail: no horizontal scroll at 375 px, 44 px targets", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await page.setViewportSize(VIEWPORTS.narrow);
  await openDetail(page, "acme.de", "ACME GmbH");
  await expect(page.getByRole("button", { name: "Neu recherchieren" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  const targets = [
    page.getByRole("link", { name: "Alle Firmen" }),
    page.getByRole("button", { name: "Gehalt" }),
    page.getByRole("button", { name: "Neu recherchieren" }),
    jobsSection(page, "ACME GmbH").getByRole("link").first(),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
});

/**
 * Every button of the refresh dialog (portalled outside the page) is a 44 px target, once it has
 * popped in (measured mid-animation a 44 px button reads 43.99).
 */
async function expectRefreshDialogTargets(page: Page) {
  await page.getByRole("button", { name: "Neu recherchieren" }).click();
  const dialog = page.getByRole("dialog", { name: "Profil neu recherchieren?" });
  const buttons = dialog.getByRole("button");
  await expect(buttons).toHaveCount(3);
  await dialog.evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
}

test("the refresh dialog has 44 px buttons on the detail and on the job's Firma tab", async ({
  page,
  mockApi,
}) => {
  const job = jobBody({ status: "DRAFTED", company_domain: "acme.de" });
  await mockApi(companiesRoutes(new CompaniesServer(), {}, jobRoutes(job)));
  await openDetail(page, "acme.de", "ACME GmbH");
  await expectRefreshDialogTargets(page);
  await page.goto(jobUrl("firma"));
  await expect(page.getByRole("heading", { name: "Gesamtbewertung" })).toBeVisible();
  await expectRefreshDialogTargets(page);
});

test.describe("Firmen detail: screenshots", () => {
  test.use({ allowedConsoleErrors: [MISSING_PROFILE] });

  test("with a profile and without, in both themes", async ({ page, mockApi }) => {
    await mockApi(companiesRoutes(new CompaniesServer()));
    for (const [size, viewport] of SCREENSHOT_SIZES) {
      for (const scheme of COLOR_SCHEMES) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await openDetail(page, "acme.de", "ACME GmbH");
        await expect(jobsSection(page, "ACME GmbH").getByRole("link")).toHaveCount(2);
        await page.mouse.move(0, 0);
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `company-detail-${size}-${scheme}`);

        await openDetail(page, "initech.de", "Initech AG");
        await expect(page.getByRole("button", { name: "Firma recherchieren" })).toBeVisible();
        await page.mouse.move(0, 0);
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `company-detail-empty-${size}-${scheme}`);
      }
    }
  });
});
