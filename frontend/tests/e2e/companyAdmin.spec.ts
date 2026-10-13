import type { Locator, Page } from "@playwright/test";
import { CompaniesServer, companiesRoutes } from "./support/companiesServer";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { jobBody, jobRoutes, jobUrl } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

// After the delete the profile is gone: the API answers 404 and Chromium logs that response.
const MISSING_PROFILE = /status of 404/;
const MIN_HIT_TARGET_PX = 44;
const DELETE_TEXT =
  "Das Firmenprofil wird für alle Benutzer gelöscht. Stellen bleiben erhalten und können neu recherchiert werden.";

const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const renameDialog = (page: Page) => page.getByRole("dialog", { name: "Firmenprofil umbenennen" });
const deleteDialog = (page: Page) => page.getByRole("dialog", { name: "Firmenprofil löschen?" });

async function openAcme(page: Page) {
  await page.goto("/companies?domain=acme.de");
  await expect(title(page, "ACME GmbH")).toBeVisible();
  await expect(page.getByRole("button", { name: "Neu recherchieren" })).toBeVisible();
}

/** Every button of a dialog (portalled outside the page) is a 44 px target, once it has popped in. */
async function expectDialogTargets(dialog: Locator) {
  await dialog.evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  for (const button of await dialog.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
}

test("rename: the h1 takes the new name, focus returns, and a reload keeps it", async ({
  page,
  mockApi,
}) => {
  const companies = new CompaniesServer();
  await mockApi(companiesRoutes(companies));
  await openAcme(page);
  const opener = page.getByRole("button", { name: "Umbenennen" });
  await opener.click();
  const field = renameDialog(page).getByRole("textbox", { name: "Name" });
  await expect(field).toBeFocused();
  await expect(renameDialog(page).getByRole("button", { name: "Speichern" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await field.fill("  ACME Group ");
  await renameDialog(page).getByRole("button", { name: "Speichern" }).click();

  await expect(title(page, "ACME Group")).toBeVisible();
  await expect(page.getByText("Firmenprofil umbenannt.")).toBeVisible();
  await expect(renameDialog(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(companies.profiles["acme.de"]?.name).toBe("ACME Group");

  await page.reload();
  await expect(title(page, "ACME Group")).toBeVisible();
});

test("rename: a name of spaces is refused on the field before anything is sent", async ({
  page,
  mockApi,
}) => {
  const companies = new CompaniesServer();
  const log = await mockApi(companiesRoutes(companies));
  await openAcme(page);
  await page.getByRole("button", { name: "Umbenennen" }).click();
  await renameDialog(page).getByRole("textbox", { name: "Name" }).fill("   ");
  await renameDialog(page).getByRole("button", { name: "Speichern" }).click();
  await expect(renameDialog(page).getByText("Bitte ausfüllen.")).toBeVisible();
  expect(log.requests.filter((key) => key.startsWith("PATCH "))).toEqual([]);
});

test.describe("delete", () => {
  test.use({ allowedConsoleErrors: [MISSING_PROFILE] });

  test("delete: the detail offers research again, and so does the job page's Firma tab", async ({
    page,
    mockApi,
  }) => {
    const companies = new CompaniesServer();
    const job = jobBody({ status: "DRAFTED", company_domain: "acme.de" });
    await mockApi(companiesRoutes(companies, {}, jobRoutes(job)));
    await openAcme(page);
    await page.getByRole("button", { name: "Profil löschen" }).click();
    await expect(deleteDialog(page).getByText(DELETE_TEXT)).toBeVisible();
    await deleteDialog(page).getByRole("button", { name: "Profil löschen" }).click();

    await expect(
      page.getByRole("heading", { level: 3, name: "Noch keine Recherche zu ACME GmbH" }),
    ).toBeVisible();
    await expect(page.getByText("Firmenprofil gelöscht.")).toBeVisible();
    await expect(title(page, "ACME GmbH")).toBeFocused();
    expect(companies.profiles["acme.de"]).toBeUndefined();
    expect(companies.jobs.filter((row) => row.company_domain === "acme.de")).toHaveLength(2);

    await page.goto(jobUrl("firma"));
    await expect(page.getByRole("button", { name: "Firma recherchieren" })).toBeVisible();
  });
});

test("a member sees no admin buttons on the same detail", async ({ page, mockApi }) => {
  const companies = new CompaniesServer();
  companies.setMember();
  await mockApi(companiesRoutes(companies));
  await openAcme(page);
  await expect(page.getByRole("button", { name: "Umbenennen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Profil löschen" })).toHaveCount(0);
});

test("admin dialogs: 44 px targets, no horizontal scroll, screenshots in both themes", async ({
  page,
  mockApi,
}) => {
  await mockApi(companiesRoutes(new CompaniesServer()));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openAcme(page);
      await page.getByRole("button", { name: "Umbenennen" }).click();
      await expectDialogTargets(renameDialog(page));
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `company-rename-${size}-${scheme}`);
      await renameDialog(page).getByRole("button", { name: "Abbrechen" }).click();

      await page.getByRole("button", { name: "Profil löschen" }).click();
      await expectDialogTargets(deleteDialog(page));
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `company-delete-${size}-${scheme}`);
      await deleteDialog(page).getByRole("button", { name: "Abbrechen" }).click();
    }
  }
});
