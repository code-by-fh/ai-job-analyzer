import type { Page } from "@playwright/test";
import { PROFILE_LIMITS } from "../../src/api/profilePaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STORED_PROFILE } from "./support/profileFixtures";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
// Below the 768 px touch breakpoint, yet the profile column is at least 720 px wide.
const WIDE_COLUMN_TOUCH = { width: 760, height: 900 };
const STORED_PROJECT = STORED_PROFILE.cv_data!.projects![0]!;

const education = (page: Page) => page.getByLabel("Ausbildung", { exact: true });
const saveButton = (page: Page) => page.getByRole("button", { name: "Speichern" });

test("an edited entry and the education survive a reload; only cv_data is sent", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await page.getByRole("button", { name: "Senior Backend Engineer bearbeiten" }).click();
  await page
    .getByLabel("Beschreibung")
    .fill("Checkout für 2 Mio. Kund:innen, Ausfallzeit um 70 % gesenkt.");
  await page.getByRole("button", { name: "Fertig" }).click();
  await education(page).fill("M.Sc. Informatik, TU Hamburg, 2017");
  await saveButton(page).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(page.getByText("Ausfallzeit um 70 % gesenkt.")).toBeVisible();
  await expect(education(page)).toHaveValue("M.Sc. Informatik, TU Hamburg, 2017");
  expect(server.saved.map((body) => Object.keys(body))).toEqual([["cv_data"]]);
});

test("the hint disappears once the stored CV is complete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.profile.cv_data = { ...server.profile.cv_data!, education: "" };
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await expect(page.getByText(/Noch unvollständig: Ausbildung/)).toBeVisible();
  await education(page).fill("B.Sc. Informatik");
  await saveButton(page).click();
  await expect(page.getByText(/Noch unvollständig/)).toHaveCount(0);
});

test.describe("a refused save", () => {
  test.use({ allowedConsoleErrors: [/status of 422/] });

  test("a legacy entry over the limit is marked on its field and saves once shortened", async ({
    page,
    mockApi,
  }) => {
    const legacy = { ...STORED_PROJECT, tech_stack: "x".repeat(PROFILE_LIMITS.entryTitle + 1) };
    const server = new ProfileServer();
    server.profile.cv_data = { ...server.profile.cv_data!, projects: [legacy] };
    await mockApi(profileRoutes(server));
    await page.goto("/profile?section=lebenslauf");
    await education(page).fill("M.Sc. Informatik");
    await saveButton(page).click();
    await expect(page.getByText(/Nicht gespeichert/)).toBeVisible();
    await page.getByRole("button", { name: "kotlin-outbox bearbeiten" }).click();
    const tech = page.getByLabel("Technologien");
    await expect(tech).toHaveAttribute("aria-invalid", "true");
    await tech.fill("Kotlin, Spring");
    await saveButton(page).click();
    await expect(page.getByText("Gespeichert.").first()).toBeVisible();
    expect(server.profile.cv_data!.projects![0]!.tech_stack).toBe("Kotlin, Spring");
  });
});

test("entry buttons are 44 px on mobile and nothing scrolls sideways", async ({
  page,
  mockApi,
}) => {
  await mockApi(profileRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/profile?section=lebenslauf");
  const edit = page.getByRole("button", { name: "Senior Backend Engineer bearbeiten" });
  const add = page.getByRole("button", { name: "Erfahrung hinzufügen" });
  for (const button of [edit, add]) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
  // Ruling R14 (h): the section's Speichern and the import are touch targets too (height).
  for (const name of ["Speichern", "Lebenslauf importieren (PDF)"]) {
    const box = (await page.getByRole("button", { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
  expect(await horizontalOverflow(page)).toBe(0);
  // Fix round M7: below 768 px the column can still have the wide layout (16 px page padding).
  await page.setViewportSize(WIDE_COLUMN_TOUCH);
  for (const button of [edit, add]) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
});

test("Lebenslauf with the hint and an open entry: screenshots", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.profile.cv_data = { ...server.profile.cv_data!, education: "" };
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await page.getByRole("button", { name: "kotlin-outbox bearbeiten" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      // Ruling R16 (c): the focused field scrolled the page; the full-page shot starts at the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `profile-cv-${size}-${scheme}`);
    }
  }
});
