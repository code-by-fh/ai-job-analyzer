import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { FOUND_LINKS, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const SEARCH_URL = "https://www.get-in-it.de/jobsuche?query=kotlin";
const POSTINGS = FOUND_LINKS.length - 1;

test.beforeEach(async ({ page }) => fixNow(page));

const wizard = (page: Page) => page.getByRole("dialog", { name: "Quelle hinzufügen" });
const linkRows = (page: Page) =>
  wizard(page).getByRole("list", { name: "Stellenlinks wählen" }).getByRole("listitem");

/** The drawer slides and fades in; measure and shoot it once it has landed. */
async function settled(page: Page): Promise<void> {
  await wizard(page).evaluate((panel) =>
    Promise.all(panel.getAnimations().map((animation) => animation.finished)),
  );
}

async function checkPage(page: Page, url: string): Promise<void> {
  await wizard(page).getByLabel("Adresse einer Suchergebnisseite").fill(url);
  await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
}

async function linksMeetTargets(page: Page): Promise<boolean> {
  const boxes = await Promise.all((await linkRows(page).all()).map((row) => row.boundingBox()));
  return boxes.every((box) => box !== null && box.height >= MIN_HIT_TARGET_PX);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the wizard checks a page and lists its links at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/sources?add=1");
      await expect(wizard(page).locator('[aria-current="step"]')).toContainText("Seite prüfen");
      await settled(page);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-wizard-1-${size}-${scheme}`);
      await checkPage(page, SEARCH_URL);
      await expect(wizard(page).getByText(`${POSTINGS} ausgewählt`)).toBeVisible();
      await expect(linkRows(page)).toHaveCount(FOUND_LINKS.length);
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-wizard-2-${size}-${scheme}`);
    });
  }
}

for (const scheme of COLOR_SCHEMES) {
  test(`on a phone in ${scheme} mode the links are 44 px rows and the foot is reachable`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(sourcesRoutes());
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/sources?add=1");
    await checkPage(page, SEARCH_URL);
    await expect(linkRows(page)).toHaveCount(FOUND_LINKS.length);
    await settled(page);
    expect(await linksMeetTargets(page)).toBe(true);
    const next = wizard(page).getByRole("button", { name: "Weiter", exact: true });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
    await expect(wizard(page).getByRole("button", { name: "Zurück" })).toBeInViewport();
    await page.mouse.move(0, 0);
    await saveScreenshot(page, `sources-wizard-2-390-${scheme}-foot`);
  });
}

test.describe("a refused address", () => {
  test.use({ allowedConsoleErrors: [/status of 422/] });

  test("shows on the field", async ({ page, mockApi }) => {
    await mockApi(sourcesRoutes());
    await page.goto("/sources?add=1");
    await checkPage(page, "http://10.0.0.5/jobs");
    await expect(wizard(page).getByText("Diese Adresse kann nicht geprüft werden.")).toBeVisible();
    await expect(wizard(page).getByLabel("Adresse einer Suchergebnisseite")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

test("Zurück keeps the address", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto("/sources?add=1");
  await checkPage(page, SEARCH_URL);
  await expect(wizard(page).getByLabel("Links filtern")).toBeFocused();
  await wizard(page).getByRole("button", { name: "Zurück" }).click();
  const address = wizard(page).getByLabel("Adresse einer Suchergebnisseite");
  await expect(address).toHaveValue(SEARCH_URL);
  await expect(address).toBeFocused();
  await wizard(page).getByRole("button", { name: "Seite prüfen" }).click();
  await expect(wizard(page).getByText(`${POSTINGS} ausgewählt`)).toBeVisible();
});

test("Erweitert counts matches", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto("/sources?add=1");
  await checkPage(page, SEARCH_URL);
  await wizard(page).getByRole("button", { name: "Erweitert" }).click();
  const pattern = wizard(page).getByLabel("URL-Muster");
  await pattern.fill("/jobsuche/p/");
  await expect(
    wizard(page).getByText(
      `${POSTINGS} von ${FOUND_LINKS.length} gefundenen Links enthalten dieses Muster.`,
    ),
  ).toBeVisible();
  await pattern.fill("/nope/");
  await expect(wizard(page).getByText("Kein gefundener Link enthält dieses Muster.")).toBeVisible();
});
