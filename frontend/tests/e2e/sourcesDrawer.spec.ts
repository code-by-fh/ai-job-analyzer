import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, isDimmedByScrim, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;

test.beforeEach(async ({ page }) => fixNow(page));

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const section = (page: Page, name: string) =>
  drawer(page)
    .locator("form")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the drawer shows a source at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/sources");
      await page.getByRole("link", { name: "StepStone" }).click();
      await expect(drawer(page)).toBeVisible();
      await expect(drawer(page).getByLabel("Uhrzeit 1", { exact: true })).toHaveValue("14:00");
      await expect(
        drawer(page).getByText("Uhrzeiten in deiner Zeitzone (Europe/Berlin)."),
      ).toBeVisible();
      // The crawl of AUTHENTICATED_ROUTES runs for StepStone: the header repeats its progress.
      await expect(
        drawer(page).getByRole("progressbar", { name: "Fortschritt StepStone" }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      // The drawer slides and fades in; shoot it once it has landed, not see-through.
      await drawer(page).evaluate((panel) =>
        Promise.all(panel.getAnimations().map((animation) => animation.finished)),
      );
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-drawer-${size}-${scheme}`);
    });
  }
}

test("the pencil of a row opens that source's drawer", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto("/sources");
  await row(page, "StepStone").getByRole("button", { name: "StepStone bearbeiten" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`quelle=${STEPSTONE.id}$`));
});

test("weekday toggles are 44 px targets on a phone", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const monday = drawer(page)
    .getByRole("group", { name: "Wochentage" })
    .getByRole("button", { name: "Mo" });
  await expect(monday).toHaveAttribute("aria-pressed", "true");
  // Measured mid-slide, the translateX leaves a sub-pixel width (43.99 px): wait until it landed.
  await drawer(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
  const box = await monday.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(box!.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

test("turning the schedule off saves nulls and the row says manual", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Zeitplan").getByLabel("Automatisch durchsuchen").uncheck();
  await section(page, "Zeitplan").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect([server.get(STEPSTONE.id).schedule_times, server.get(STEPSTONE.id).schedule_days]).toEqual(
    [null, null],
  );
  await drawer(page).getByRole("button", { name: "Schließen" }).click();
  await expect(row(page, "StepStone")).toContainText("Nur manuell");
  await expect(page.getByRole("link", { name: "StepStone" })).toBeFocused();
});

test("a renamed source keeps its new name in the list", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Quelle").getByLabel("Name").fill("  StepStone Kotlin ");
  await section(page, "Quelle").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("dialog", { name: "Quelle StepStone Kotlin" })).toBeVisible();
  expect(server.get(STEPSTONE.id).name).toBe("StepStone Kotlin");
  await expect(row(page, "StepStone Kotlin")).toHaveCount(1);
});

test("closing with an unsaved schedule asks first", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Zeitplan").getByLabel("Uhrzeit 1", { exact: true }).fill("07:30");
  await drawer(page).getByRole("button", { name: "Schließen" }).click();
  await page.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(section(page, "Zeitplan").getByLabel("Uhrzeit 1", { exact: true })).toHaveValue(
    "07:30",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/sources$/);
  // Opened by a deep link: no trigger to return to, so focus goes to the row (never <body>).
  await expect(page.getByRole("link", { name: "StepStone" })).toBeFocused();
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the leave question dims the drawer at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/sources?quelle=${STEPSTONE.id}`);
      await section(page, "Zeitplan").getByLabel("Uhrzeit 1", { exact: true }).fill("07:30");
      await page.keyboard.press("Escape");
      const leave = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
      await expect(leave).toBeVisible();
      await leave.evaluate((panel) =>
        Promise.all(panel.getAnimations().map((animation) => animation.finished)),
      );
      // M6: the dialog's scrim lies over the drawer, not under it.
      expect(await isDimmedByScrim(drawer(page))).toBe(true);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-leave-${size}-${scheme}`);
    });
  }
}

test.describe("refused addresses", () => {
  // One pattern: an array of two would read as Playwright's [value, options] fixture tuple.
  test.use({ allowedConsoleErrors: [/status of (400|422)/] });

  test("a private address is refused on the field", async ({ page, mockApi }) => {
    const server = new SourcesServer();
    await mockApi(sourcesRoutes(server));
    await page.goto(`/sources?quelle=${STEPSTONE.id}`);
    await section(page, "Quelle")
      .getByLabel("Adresse der Suchergebnisseite")
      .fill("http://127.0.0.1/jobs");
    await section(page, "Quelle").getByRole("button", { name: "Speichern" }).click();
    await expect(
      section(page, "Quelle").getByText("Diese Adresse kann nicht geprüft werden."),
    ).toBeVisible();
    expect(server.get(STEPSTONE.id).url).toBe(STEPSTONE.url);
  });

  test("another website is refused on the field", async ({ page, mockApi }) => {
    await mockApi(sourcesRoutes());
    await page.goto(`/sources?quelle=${STEPSTONE.id}`);
    await section(page, "Quelle")
      .getByLabel("Adresse der Suchergebnisseite")
      .fill("https://de.indeed.com/jobs");
    await section(page, "Quelle").getByRole("button", { name: "Speichern" }).click();
    await expect(section(page, "Quelle").getByText(/Diese Adresse geht hier nicht/)).toBeVisible();
  });
});
