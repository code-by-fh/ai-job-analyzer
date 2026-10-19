import type { Page } from "@playwright/test";
import { SETUP_DONE } from "./support/fixtures";
import { fixNow } from "./support/jobFixtures";
import { STEPSTONE } from "./support/platformFixtures";
import { sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";
import { chooseLinksAndConfirm } from "./support/wizardSteps";

const HTTP_CONFLICT = 409;
const SEARCH_URL = "https://www.get-in-it.de/jobsuche?query=kotlin";
const NO_PROFILE = { "GET /setup-status": { body: { ...SETUP_DONE, profile_complete: false } } };

test.beforeEach(async ({ page }) => fixNow(page));

const wizard = (page: Page) => page.getByRole("dialog", { name: "Quelle hinzufügen" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const weekdays = (dialog: ReturnType<typeof wizard>) =>
  dialog.getByRole("group", { name: "Wochentage" }).getByRole("button", { name: "Mo" });

test("without a profile adding and searching are inactive, with the reason and a link to the profile", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes(undefined, NO_PROFILE));
  await page.goto("/sources");
  await expect(page.getByText(/Quellen brauchen ein gepflegtes Profil/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Profil öffnen" })).toHaveAttribute(
    "href",
    "/profile",
  );
  await expect(page.getByRole("button", { name: "Quelle hinzufügen" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("button", { name: "StepStone jetzt durchsuchen" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("?add=1 without a profile opens no wizard, leaves the URL and shows the notice", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes(undefined, NO_PROFILE));
  await page.goto("/sources?add=1");
  await expect(page.getByText(/Quellen brauchen ein gepflegtes Profil/)).toBeVisible();
  await expect(page).toHaveURL(/\/sources$/);
  await expect(wizard(page)).toHaveCount(0);
});

test.describe("a refused setup", () => {
  // The browser logs the provoked 409 itself.
  test.use({ allowedConsoleErrors: [/status of 409/] });

  test("shows the fixed message for profile_required", async ({ page, mockApi }) => {
    await mockApi(
      sourcesRoutes(undefined, {
        "POST /platforms/setup": { status: HTTP_CONFLICT, body: { detail: "profile_required" } },
      }),
    );
    await page.goto("/sources?add=1");
    await wizard(page).getByLabel("Adresse einer Suchergebnisseite").fill(SEARCH_URL);
    await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
    await chooseLinksAndConfirm(wizard(page));
    await wizard(page).getByRole("button", { name: "Weiter", exact: true }).click();
    await wizard(page).getByRole("button", { name: "Quelle anlegen" }).click();
    await expect(page.getByText(/Pflege zuerst dein Profil/)).toBeVisible();
  });
});

test("the weekday chips have the same size in the drawer and in the wizard", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await drawer(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  const inDrawer = await weekdays(drawer(page)).boundingBox();
  await page.goto("/sources?add=1");
  await wizard(page).getByLabel("Adresse einer Suchergebnisseite").fill(SEARCH_URL);
  await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
  await chooseLinksAndConfirm(wizard(page));
  await wizard(page).getByRole("button", { name: "Weiter", exact: true }).click();
  await wizard(page).getByLabel("Automatisch durchsuchen").check();
  const inWizard = await weekdays(wizard(page)).boundingBox();
  expect([inWizard!.width, inWizard!.height]).toEqual([inDrawer!.width, inDrawer!.height]);
});
