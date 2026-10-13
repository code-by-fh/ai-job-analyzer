import type { Page } from "@playwright/test";
import { CompaniesServer, companiesRoutes } from "./support/companiesServer";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const ALL = "Alle Firmen dieser Installation";
const MIN_HIT_TARGET_PX = 44;

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Firmen" });
const companyList = (page: Page) => page.getByRole("list", { name: "Firmen" });
const row = (page: Page, name: string) =>
  companyList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
const search = (page: Page) => page.getByRole("searchbox", { name: "Firmen durchsuchen" });

/** Every directory URL the page requested, query string included. */
function directoryUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/companies")) urls.push(request.url());
  });
  return urls;
}

async function openCompanies(page: Page, query = "") {
  await page.goto(`/companies${query}`);
  await expect(heading(page)).toBeVisible();
  await expect(companyList(page)).toBeVisible();
}

test("no foreign company: only the domains of the own jobs", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await openCompanies(page);
  await expect(companyList(page).getByRole("listitem")).toHaveCount(2);
  await expect(row(page, "ACME GmbH")).toContainText(
    "acme.de · Recherchiert am 07.10.2026 · 2 Stellen",
  );
  await expect(row(page, "Initech AG")).toContainText(
    "initech.de · Noch nicht recherchiert · 1 Stelle",
  );
  await expect(page.getByText("globex.de")).toHaveCount(0);
  await expect(page.getByText("seen.de")).toHaveCount(0);
  await expect(page.getByText("2 Firmen")).toBeVisible();
});

test("search narrows and the URL keeps it after reload", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await openCompanies(page);
  await search(page).fill("init");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?q=init`);
  await expect(companyList(page).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("1 Firma", { exact: true })).toBeVisible();

  await page.reload();
  await expect(search(page)).toHaveValue("init");
  await expect(row(page, "Initech AG")).toBeVisible();
  await expect(companyList(page).getByRole("listitem")).toHaveCount(1);

  await search(page).fill("globex");
  await expect(page.getByText("Keine Firma passt zu „globex“.")).toBeVisible();
  await expect(companyList(page)).toHaveCount(0);
});

test("an admin sees all companies of the installation", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await openCompanies(page);
  const requested = page.waitForRequest(/\/companies\?scope=all$/);
  await page.getByRole("checkbox", { name: ALL }).check();
  await requested;
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?alle=1`);
  await expect(row(page, "Globex Corporation")).toContainText(
    "globex.de · Recherchiert am 01.10.2026 · Keine eigenen Stellen",
  );
  await expect(companyList(page).getByRole("listitem")).toHaveCount(3);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: ALL })).toBeChecked();
  await expect(row(page, "Globex Corporation")).toBeVisible();
});

test("a member with ?alle=1 sends no scope=all and sees no check", async ({ page, mockApi }) => {
  const companies = new CompaniesServer();
  companies.setMember();
  await mockApi(companiesRoutes(companies));
  const urls = directoryUrls(page);
  await openCompanies(page, "?alle=1");
  await expect(row(page, "ACME GmbH")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: ALL })).toHaveCount(0);
  await expect(page.getByText("globex.de")).toHaveCount(0);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((url) => url.includes("scope=all"))).toEqual([]);
});

test("a row opens the company and 'Alle Firmen' leads back, focus on the titles", async ({
  page,
  mockApi,
}) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await openCompanies(page);
  await row(page, "ACME GmbH").getByRole("link").click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies?domain=acme.de`);
  const title = page.getByRole("heading", { level: 1, name: "ACME GmbH" });
  await expect(title).toBeFocused();
  await expect(
    page.getByText("Firmenprofile sind für alle Benutzer dieser Installation sichtbar."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Alle Firmen" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/companies`);
  await expect(heading(page)).toBeFocused();
});

test("Firmen: no horizontal scroll at 375 px", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  await page.setViewportSize(VIEWPORTS.narrow);
  await openCompanies(page, "?alle=1");
  expect(await horizontalOverflow(page)).toBe(0);
  // The link is stretched over its row, so the row is the touch target.
  const item = await row(page, "ACME GmbH").boundingBox();
  expect(item?.height ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

test("Firmen: screenshots in both themes", async ({ page, mockApi }) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openCompanies(page, "?alle=1");
      await expect(row(page, "Globex Corporation")).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `companies-${size}-${scheme}`);
    }
  }
});
