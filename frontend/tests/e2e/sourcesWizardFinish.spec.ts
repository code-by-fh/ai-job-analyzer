import type { Locator, Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const SEARCH_URL = "https://www.get-in-it.de/jobsuche?query=kotlin";
// The id the server gives the first source after the two fixture sources.
const CREATED_ID = 3;

test.beforeEach(async ({ page }) => fixNow(page));

const wizard = (page: Page) => page.getByRole("dialog", { name: "Quelle hinzufügen" });
const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });

/** The drawer slides and fades in; measure and shoot it once it has landed. */
async function settled(page: Page): Promise<void> {
  await wizard(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
}

/** Steps 1 and 2 with the prototype's page: the six postings stay preselected. */
async function toStep3(page: Page): Promise<void> {
  await page.goto("/sources?add=1");
  await wizard(page).getByLabel("Adresse einer Suchergebnisseite").fill(SEARCH_URL);
  await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
  await wizard(page).getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(wizard(page).getByLabel("Name", { exact: true })).toBeFocused();
}

async function meetsTargets(items: Locator, minWidth: number): Promise<boolean> {
  const boxes = await Promise.all((await items.all()).map((item) => item.boundingBox()));
  return boxes.every(
    (box) => box !== null && box.height >= MIN_HIT_TARGET_PX && box.width >= minWidth,
  );
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`step 3 asks for name, schedule and first run at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await toStep3(page);
      await expect(wizard(page).locator('[aria-current="step"]')).toContainText(
        "Name und Zeitplan",
      );
      await settled(page);
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-wizard-3-${size}-${scheme}`);
    });
  }
}

test("on a phone the weekday chips are 44 x 44 px, the first-run rows 44 px high and the foot reachable", async ({
  page,
  mockApi,
}) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await toStep3(page);
  await settled(page);
  const days = wizard(page).getByRole("group", { name: "Wochentage" }).getByRole("button");
  await expect(days).toHaveCount(7);
  expect(await meetsTargets(days, MIN_HIT_TARGET_PX)).toBe(true);
  const runs = wizard(page).locator(".run-choice label");
  await expect(runs).toHaveCount(3);
  expect(await meetsTargets(runs, 0)).toBe(true);
  const create = wizard(page).getByRole("button", { name: "Quelle anlegen" });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport();
  await expect(wizard(page).getByRole("button", { name: "Zurück" })).toBeInViewport();
});

test("a new source with a first analysis appears running and focused", async ({
  page,
  mockApi,
}) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await toStep3(page);
  await wizard(page).getByLabel("Name", { exact: true }).fill("get-in-it Kotlin");
  await wizard(page).getByLabel("Uhrzeit").fill("07:30");
  const days = wizard(page).getByRole("group", { name: "Wochentage" });
  await days.getByRole("button", { name: "Di" }).click();
  await days.getByRole("button", { name: "Do" }).click();
  await days.getByRole("button", { name: "Fr" }).click();
  await wizard(page).getByLabel("Jetzt durchsuchen und alles bewerten").check();
  await wizard(page).getByRole("button", { name: "Quelle anlegen" }).click();
  await expect(
    page.getByText("Quelle „get-in-it Kotlin“ angelegt. Das Durchsuchen läuft."),
  ).toBeVisible();
  await expect(wizard(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/sources$/);
  await expect(row(page, "get-in-it Kotlin")).toContainText("Mo, Mi 07:30");
  await expect(row(page, "get-in-it Kotlin")).toContainText("Läuft");
  await expect(page.getByRole("link", { name: "get-in-it Kotlin" })).toBeFocused();
  expect(server.get(CREATED_ID)).toMatchObject({
    url_pattern: "/jobsuche/p/",
    schedule_time: "07:30",
    schedule_days: [0, 2],
  });
  // The new source answers its own calls (its drawer loads its run history).
  await page.getByRole("link", { name: "get-in-it Kotlin" }).click();
  const drawer = page.getByRole("dialog", { name: "Quelle get-in-it Kotlin" });
  await expect(drawer.getByText("Noch kein Lauf.", { exact: true })).toBeVisible();
});

test("an address that already is a source links to its drawer", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  const listed = page.waitForResponse((response) => response.url().endsWith("/platforms"));
  await page.goto("/sources?add=1");
  await listed;
  await wizard(page).getByLabel("Adresse einer Suchergebnisseite").fill(STEPSTONE.url);
  await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
  await expect(wizard(page).getByText("Diese Quelle gibt es schon.")).toBeVisible();
  await wizard(page).getByRole("button", { name: "„StepStone“ ansehen" }).click();
  await expect(page.getByRole("dialog", { name: "Quelle StepStone" })).toBeVisible();
});
