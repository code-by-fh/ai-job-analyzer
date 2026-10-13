import type { Page } from "@playwright/test";
import type { ProfileBody } from "../../src/api/profile";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes, SCANNED_MARKER } from "./support/profileServer";
import { expect, test } from "./support/test";

const pdf = (content: string) => ({
  name: "Lebenslauf.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n${content}`),
});
const EMPTY: ProfileBody = {
  role: "",
  skills: "",
  min_salary: "",
  location: "",
  preferences: "",
  spoken_languages: [],
  cv_data: { experience: [], projects: [], education: "" },
  cv_template: null,
  cover_letter_template: null,
};
const MIN_HIT_TARGET_PX = 44;
const DONE = "Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.";
const READING = "Der Lebenslauf wird gelesen. Das kann einige Minuten dauern.";

const fileInput = (page: Page) => page.locator("#pf-cv-import-file");
const confirmDialog = (page: Page) => page.getByRole("dialog", { name: "Lebenslauf übernehmen?" });

async function screenshots(page: Page, name: string): Promise<void> {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      // A typed field scrolls the page; the full-page shot would then draw the fixed sidebar lower.
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `${name}-${size}-${scheme}`);
    }
  }
}

test("an import into an empty profile fills Ziel and Lebenslauf", async ({ page, mockApi }) => {
  const server = new ProfileServer(EMPTY);
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await fileInput(page).setInputFiles(pdf("Jonas Weber"));
  await expect(page.getByText(DONE)).toBeVisible();
  await expect(page.getByText("Hanseatic Commerce GmbH").first()).toBeVisible();
  await expect(page.getByLabel("Ausbildung", { exact: true })).toHaveValue("B.Sc. Informatik");
  await page
    .getByRole("navigation", { name: "Profilbereiche" })
    .getByRole("link", { name: "Ziel" })
    .click();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Backend-Entwickler");
});

test.describe("a refused import", () => {
  test.use({ allowedConsoleErrors: [/status of (415|422)/] });

  test("a scanned PDF changes nothing", async ({ page, mockApi }) => {
    const server = new ProfileServer();
    const before = structuredClone(server.profile);
    await mockApi(profileRoutes(server));
    await page.goto("/profile?section=lebenslauf");
    await fileInput(page).setInputFiles(pdf(SCANNED_MARKER));
    await confirmDialog(page).getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.getByText(/kein lesbarer Text/)).toBeVisible();
    expect(server.profile).toEqual(before);
  });

  test("a renamed file that is no PDF is refused by the server", async ({ page, mockApi }) => {
    const server = new ProfileServer(EMPTY);
    await mockApi(profileRoutes(server));
    await page.goto("/profile?section=lebenslauf");
    await fileInput(page).setInputFiles({
      name: "lebenslauf.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("PK\u0003\u0004 word document"),
    });
    await expect(
      page.getByText("Das ist kein PDF. Bitte lade deinen Lebenslauf als PDF hoch."),
    ).toBeVisible();
    expect(server.profile.cv_data).toEqual(EMPTY.cv_data);
  });
});

test("the confirmation and the reading state: screenshots", async ({ page, mockApi }) => {
  await mockApi(profileRoutes(new ProfileServer()));
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Registered after the mock, so it runs first: the import stays in flight for the screenshots.
  await page.route("**/settings/upload-cv", async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("/profile?section=lebenslauf");
  await fileInput(page).setInputFiles(pdf("Jonas Weber"));
  await expect(confirmDialog(page)).toBeVisible();
  await screenshots(page, "profile-cv-import-confirm");
  await confirmDialog(page).getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.locator(".cv-import .notice")).toHaveText(READING);
  await expect(page.locator(".cv-import")).toHaveAttribute("aria-busy", "true");
  await screenshots(page, "profile-cv-import-reading");
  release();
  await expect(page.getByText(DONE)).toBeVisible();
  await expect(page.locator(".cv-import")).not.toHaveAttribute("aria-busy", "true");
});

test("edits typed during the import are kept: screenshots of the choice", async ({
  page,
  mockApi,
}) => {
  await mockApi(profileRoutes(new ProfileServer()));
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/settings/upload-cv", async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("/profile?section=lebenslauf");
  await fileInput(page).setInputFiles(pdf("Jonas Weber"));
  await confirmDialog(page).getByRole("button", { name: "Übernehmen" }).click();
  const education = page.getByLabel("Ausbildung", { exact: true });
  await education.fill("Abitur, Hamburg");
  release();
  const choice = page.getByRole("button", { name: "Änderungen verwerfen und Import anzeigen" });
  await expect(choice).toBeVisible();
  await expect(education).toHaveValue("Abitur, Hamburg");
  await screenshots(page, "profile-cv-import-draft-kept");
  expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  await choice.click();
  await expect(education).toHaveValue("B.Sc. Informatik");
});
