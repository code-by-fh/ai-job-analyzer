import type { Page } from "@playwright/test";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;

test.beforeEach(async ({ page }) => fixNow(page));

const strip = (page: Page) => page.getByRole("group", { name: "Phasen" });
const stripButton = (page: Page, phase: string) =>
  strip(page).getByRole("button", { name: new RegExp(`^${phase}`) });
const section = (page: Page, name: string) => page.getByRole("region", { name });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the strip filters to one phase at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await expect(stripButton(page, "Vorgemerkt")).toHaveAccessibleName(
        "Vorgemerkt: 3 Bewerbungen",
      );
      await expect(stripButton(page, "Abgeschlossen")).toHaveAccessibleName(
        "Abgeschlossen: 2 Bewerbungen",
      );
      await saveScreenshot(page, `applications-strip-${size}-${scheme}`);
      await stripButton(page, "Beworben").click();
      await expect(page).toHaveURL(/\?phase=beworben$/);
      await expect(stripButton(page, "Beworben")).toHaveAttribute("aria-pressed", "true");
      await expect(stripButton(page, "Beworben")).toBeFocused();
      await expect(section(page, "Vorgemerkt")).toHaveCount(0);
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(2);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-filter-${size}-${scheme}`);
    });
  }
}

test("pressing the pressed phase shows all phases again", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?phase=beworben");
  await expect(section(page, "Vorgemerkt")).toHaveCount(0);
  await stripButton(page, "Beworben").click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(section(page, "Vorgemerkt")).toBeVisible();
  await expect(stripButton(page, "Beworben")).toBeFocused();
});

test("an unknown phase in the URL shows all phases", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?phase=foo&abgeschlossen=yes&q=%20%20");
  await expect(section(page, "Vorgemerkt")).toBeVisible();
  await expect(strip(page).getByRole("button", { pressed: true })).toHaveCount(0);
});

test("an empty phase offers to show all and keeps focus on the strip", async ({
  page,
  mockApi,
}) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications");
  await stripButton(page, "Angebot").click();
  await expect(section(page, "Angebot")).toContainText(
    "In dieser Phase ist gerade keine Bewerbung.",
  );
  await section(page, "Angebot").getByRole("button", { name: "Alle Phasen zeigen" }).click();
  await expect(stripButton(page, "Angebot")).toBeFocused();
  await expect(section(page, "Angebot")).toHaveCount(0);
});

test("a hand-written phase on the first run shows the first run", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ active: [], closed: [] }));
  await page.goto("/applications?phase=angebot");
  await expect(page.getByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
});

test("the strip fits 375 px in two rows", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/applications");
  await expect(stripButton(page, "Abgeschlossen")).toBeVisible();
  const first = (await stripButton(page, "Vorgemerkt").boundingBox())!;
  const last = (await stripButton(page, "Abgeschlossen").boundingBox())!;
  expect(last.y).toBeGreaterThan(first.y);
  expect(last.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await horizontalOverflow(page)).toBe(0);
});
