import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { STORED_PROFILE } from "./support/profileFixtures";
import { expect, test } from "./support/test";

const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
const MIN_HIT_TARGET_PX = 44;
const LEGACY_PREFERENCES_LENGTH = 5001;

const location = (page: Page) => page.getByLabel("Ort", { exact: true });
const sectionLink = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Profilbereiche" }).getByRole("link", { name });

test("Ziel saves, survives a reload and sends only its fields", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile");
  await page.getByLabel("Wunschrolle").fill("Staff Engineer");
  await page
    .getByLabel("Gesprochene Sprachen", { exact: true })
    .fill("Französisch (Grundkenntnisse)");
  await page.getByLabel("Gesprochene Sprachen", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Staff Engineer");
  await expect(page.getByRole("list", { name: "Gesprochene Sprachen: Einträge" })).toContainText(
    "Französisch (Grundkenntnisse)",
  );
  expect(server.saved.map((body) => Object.keys(body).sort())).toEqual([GOAL_KEYS]);
});

test("leaving Ziel with unsaved edits asks first", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  await location(page).fill("Berlin");
  await sectionLink(page, "Lebenslauf").click();
  const dialog = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(location(page)).toHaveValue("Berlin");
  await sectionLink(page, "Lebenslauf").click();
  await page
    .getByRole("dialog", { name: "Änderungen verwerfen?" })
    .getByRole("button", { name: "Änderungen verwerfen" })
    .click();
  await expect(page).toHaveURL(/section=lebenslauf$/);
});

test.describe("a refused save", () => {
  test.use({ allowedConsoleErrors: [/status of 422/] });

  test("a legacy value over the limit shows on its field", async ({ page, mockApi }) => {
    const server = new ProfileServer({
      ...STORED_PROFILE,
      preferences: "x".repeat(LEGACY_PREFERENCES_LENGTH),
    });
    await mockApi(profileRoutes(server));
    await page.goto("/profile");
    await page.getByLabel("Wunschrolle").fill("Lead");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dieser Text ist zu lang. Bitte kürzen.")).toBeVisible();
    expect(server.profile.role).toBe(STORED_PROFILE.role);
  });
});

test("chip remove buttons are 44 px on mobile and nothing scrolls sideways", async ({
  page,
  mockApi,
}) => {
  await mockApi(profileRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/profile");
  const remove = page.getByRole("button", { name: "Kotlin entfernen" });
  const box = (await remove.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("Ziel with a field error: screenshots", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  await page.getByLabel("Kenntnisse", { exact: true }).fill("kotlin");
  await page.getByLabel("Kenntnisse", { exact: true }).press("Enter");
  await expect(page.getByText("Schon in der Liste.")).toBeVisible();
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `profile-goal-${size}-${scheme}`);
    }
  }
});
