import type { Page } from "@playwright/test";
import { profileDocumentFilePath } from "../../src/api/profilePaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");
const MIN_HIT_TARGET_PX = 44;
// Below the 768 px touch breakpoint, yet the profile column is at least 720 px wide.
const WIDE_COLUMN_TOUCH = { width: 760, height: 900 };
const UPLOAD = "Dokument hochladen";
const FIXTURE_PDF = "Arbeitszeugnis Nordlicht Software AG.pdf";
const FIXTURE_DRIVE = "AWS Developer.png";
// The first upload gets the id after the fixture documents (1 and 2).
const FIRST_UPLOAD_ID = 3;

const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });
const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Nachweise" });

async function screenshots(page: Page, name: string): Promise<void> {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `${name}-${size}-${scheme}`);
    }
  }
}

test("upload, view on the A4 sheet, download with the original name, delete", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=nachweise");
  await page.getByLabel(UPLOAD).setInputFiles(pdf("Arbeitszeugnis Łódź.pdf"));
  await expect(page.getByText("Arbeitszeugnis Łódź.pdf hochgeladen.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Arbeitszeugnis Łódź.pdf" });
  await expect(row).toContainText("Zertifikat");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf ansehen" }).click();
  const viewer = page.getByRole("dialog", { name: "Arbeitszeugnis Łódź.pdf" });
  await expect(viewer.locator(".paper-pdf, .a4-fallback").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf herunterladen" }).click();
  expect((await download).suggestedFilename()).toBe("Arbeitszeugnis Łódź.pdf");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf löschen" }).click();
  await page
    .getByRole("dialog", { name: "Datei löschen?" })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(row).toHaveCount(0);
  await expect(heading(page)).toBeFocused();
  expect(server.documents.map((document) => document.id)).not.toContain(FIRST_UPLOAD_ID);
  expect(log.requests).toContain(`GET ${profileDocumentFilePath(FIRST_UPLOAD_ID, "view")}`);
});

test.describe("a server refusal", () => {
  // The browser logs the refused upload's status; the spec provokes exactly that one.
  test.use({ allowedConsoleErrors: [/status of 415/] });

  test("a renamed HTML file is refused by the server and not listed", async ({ page, mockApi }) => {
    const server = new ProfileServer();
    await mockApi(profileRoutes(server));
    await page.goto("/profile?section=nachweise");
    await page.getByLabel(UPLOAD).setInputFiles({
      name: "bild.png",
      mimeType: "image/png",
      buffer: Buffer.from("<html></html>"),
    });
    await expect(
      page.getByText(
        "bild.png: Dieser Dateityp wird nicht unterstützt. Erlaubt sind PDF, Word, JPEG, PNG und WebP.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("bild.png: Dieser Dateityp wird nicht unterstützt.", { exact: true }),
    ).toHaveCount(0);
    expect(server.documents.map((document) => document.original_filename)).not.toContain(
      "bild.png",
    );
    await expect(page.getByRole("listitem").filter({ hasText: "bild.png" })).toHaveCount(0);
  });
});

test("several files upload one after the other with the chosen type", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=nachweise");
  await page.getByRole("button", { name: "Referenz" }).click();
  await page.getByLabel(UPLOAD).setInputFiles([pdf("AWS.pdf"), pdf("Scrum.pdf")]);
  await expect(page.getByText("Scrum.pdf hochgeladen.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Scrum.pdf" })).toContainText(
    "Referenz",
  );
  expect(server.documents.map((document) => document.original_filename)).toEqual([
    "Scrum.pdf",
    "AWS.pdf",
    FIXTURE_PDF,
    FIXTURE_DRIVE,
  ]);
});

test("a Drive document lists with view and download inactive", async ({ page, mockApi }) => {
  const log = await mockApi(profileRoutes(new ProfileServer()));
  await page.goto("/profile?section=nachweise");
  const view = page.getByRole("button", { name: `${FIXTURE_DRIVE} ansehen` });
  await expect(view).toHaveAttribute("aria-disabled", "true");
  await view.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(log.requests.filter((request) => request.includes("/profile/documents/2/"))).toEqual([]);
});

async function expectTouchTargets(page: Page): Promise<void> {
  const row = page.getByRole("listitem").filter({ hasText: FIXTURE_PDF });
  for (const button of await row.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
  }
  const label = page.locator(".proof-upload label");
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
}

test("the upload shows its keyboard focus; rows are touch targets on mobile", async ({
  page,
  mockApi,
}) => {
  await mockApi(profileRoutes(new ProfileServer()));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/profile?section=nachweise");
  await page.getByRole("button", { name: "Referenz" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(UPLOAD)).toBeFocused();
  await expect(page.locator(".proof-upload label")).toHaveCSS("outline-style", "solid");
  await expectTouchTargets(page);
  expect(await horizontalOverflow(page)).toBe(0);
  // Fix round M7: below 768 px the column can still have the wide layout (16 px page padding).
  await page.setViewportSize(WIDE_COLUMN_TOUCH);
  await expect(page.locator(".proof-list .file-row").first()).toHaveCSS("flex-direction", "row");
  await expectTouchTargets(page);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("Nachweise list and delete dialog: screenshots", async ({ page, mockApi }) => {
  await mockApi(profileRoutes(new ProfileServer()));
  await page.goto("/profile?section=nachweise");
  await expect(page.getByText(FIXTURE_PDF)).toBeVisible();
  await screenshots(page, "profile-proofs");
  await page.getByRole("button", { name: `${FIXTURE_PDF} löschen` }).click();
  await expect(page.getByRole("dialog", { name: "Datei löschen?" })).toBeVisible();
  // The dialog's scrim lies over the shell: the sidebar's corner hits the scrim.
  await page.setViewportSize(VIEWPORTS.desktop);
  const topmost = await page.evaluate(() => document.elementFromPoint(8, 8)?.className ?? "");
  expect(topmost).toContain("scrim");
  await screenshots(page, "profile-proofs-delete");
});
