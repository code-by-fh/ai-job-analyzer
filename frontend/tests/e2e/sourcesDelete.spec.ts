import type { Page } from "@playwright/test";
import type { PlatformRunBody } from "../../src/api/platforms";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, isDimmedByScrim, saveScreenshot } from "./support/page";
import { INDEED, PLATFORMS, STEPSTONE } from "./support/platformFixtures";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const RUNS: PlatformRunBody[] = [
  {
    finished_at: "2026-10-07T06:00:00+00:00",
    found: 12,
    new: 5,
    matched: 3,
    seeded: false,
    error: null,
  },
  {
    finished_at: "2026-10-06T06:00:00+00:00",
    found: 0,
    new: 0,
    matched: 0,
    seeded: false,
    error: "unreachable",
  },
  { finished_at: "2026-10-05T06:00:00+00:00", found: 40, new: 40, matched: 0, seeded: true },
];
const FINISHED_RUN = { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3 };

test.beforeEach(async ({ page }) => fixNow(page));

const drawer = (page: Page, name = "StepStone") =>
  page.getByRole("dialog", { name: `Quelle ${name}` });
const deleteButton = (page: Page, name = "StepStone") =>
  drawer(page, name).getByRole("button", { name: "Quelle löschen" });
const confirmDialog = (page: Page, name = "StepStone") =>
  page.getByRole("dialog", { name: `„${name}“ löschen?` });

/** Waits until the overlay's entry animation has landed, so the shot is not see-through. */
async function landed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("dialog", { name })
    .evaluate((panel) => Promise.all(panel.getAnimations().map((animation) => animation.finished)));
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the run history and the delete question at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const server = new SourcesServer(PLATFORMS, []);
      server.addRuns(STEPSTONE.id, RUNS);
      await mockApi(sourcesRoutes(server));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/sources?quelle=${STEPSTONE.id}`);
      const runs = drawer(page).getByRole("list", { name: "Letzte Läufe" });
      await expect(runs.getByRole("listitem")).toHaveCount(RUNS.length);
      await deleteButton(page).scrollIntoViewIfNeeded();
      await landed(page, "Quelle StepStone");
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-runs-${size}-${scheme}`);
      // Opened from the keyboard: a click would leave the button in its hover state in the shot.
      await deleteButton(page).focus();
      await page.keyboard.press("Enter");
      await expect(confirmDialog(page)).toBeVisible();
      await landed(page, "„StepStone“ löschen?");
      expect(await isDimmedByScrim(drawer(page))).toBe(true);
      await saveScreenshot(page, `sources-delete-${size}-${scheme}`);
    });
  }
}

test("deleting keeps the found jobs", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  // The crawl of the fixtures ended before the page loads, so StepStone may be deleted.
  server.finish(STEPSTONE.id, FINISHED_RUN);
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await deleteButton(page).click();
  await confirmDialog(page).getByRole("button", { name: "Löschen" }).click();
  await expect(
    page.getByText("Quelle „StepStone“ gelöscht. 4 gefundene Stellen bleiben erhalten."),
  ).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/quelle=/);
  await expect(page.getByRole("link", { name: "StepStone" })).toHaveCount(0);
  await expect(page.locator(".sources .mast-deck")).toHaveText("1 Quelle mit Fehler.");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(server.list().map((platform) => platform.id)).toEqual([INDEED.id]);
});

test("deleting a source moves focus to the next row", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${INDEED.id}`);
  await deleteButton(page, "Indeed").click();
  await confirmDialog(page, "Indeed").getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("Quelle „Indeed“ gelöscht.")).toBeVisible();
  await expect(page.getByRole("link", { name: "StepStone" })).toBeFocused();
});

test("a running source cannot be deleted", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await expect(deleteButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(deleteButton(page)).toHaveAccessibleDescription("Erst das Durchsuchen abbrechen.");
  // Playwright refuses to click an aria-disabled button; the keyboard still reaches it.
  await deleteButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(server.list()).toHaveLength(PLATFORMS.length);
});
