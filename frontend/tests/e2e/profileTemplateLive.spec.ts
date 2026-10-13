import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow, NOW_ISO, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

// Preflight ruling 23: every name here is unique, also case-insensitively, against the fixtures.
const UPLOADED = "lebenslauf_2026";
const TEMPLATE = {
  name: `${UPLOADED}.html`,
  mimeType: "text/html",
  buffer: Buffer.from("<html><body><h1>Jonas</h1></body></html>"),
};
const STALL_AGE_MS = 20 * 60_000;
const STALLED_AT = new Date(Date.parse(NOW_ISO) - STALL_AGE_MS).toISOString();

const cvGallery = (page: Page) => page.getByRole("region", { name: "Lebenslauf" });
const cardOf = (page: Page, name: string) =>
  cvGallery(page).getByRole("listitem").filter({ hasText: name });

async function socket(log: ApiLog) {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

function ownTemplate(id: number, name: string, status: string | null, at = NOW_ISO) {
  return {
    id,
    doc_type: "CV",
    name,
    is_admin: false,
    user_id: 1,
    status,
    created_at: at,
    updated_at: at,
  };
}

test("a rejected fill shows the warning after the event and the template can still be the default", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await socket(log);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  const card = cardOf(page, UPLOADED);
  await expect(card).toContainText("KI setzt Platzhalter ein …");
  await expect(card).toHaveAttribute("aria-busy", "true");
  await expect(card.getByRole("button", { name: "Als Standard" })).toHaveCount(0);
  const id = server.finishTemplate(UPLOADED, "annotation_rejected");
  pushEvent(log, { type: "template_ready", template_id: id });
  await expect(card).toContainText("Die KI-Platzhalter wurden verworfen.");
  await card.getByRole("button", { name: "Als Standard" }).click();
  await expect(card).toContainText("Standard für neue Bewerbungen");
  expect(server.profile.cv_template).toBe(String(id));
});

test("a fill that ends while the socket is down shows up after the reconnect", async ({
  page,
  mockApi,
}) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await socket(log);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  await expect(cardOf(page, UPLOADED)).toContainText("KI setzt Platzhalter ein …");
  await log.sockets[0]!.close();
  server.finishTemplate(UPLOADED, null);
  // setFixedTime fixes Date only; the 1 s backoff timer runs, so this is a ceiling.
  await expect.poll(() => log.sockets.length, { timeout: 40_000 }).toBeGreaterThan(1);
  await expect(cardOf(page, UPLOADED).getByRole("button", { name: "Als Standard" })).toBeVisible();
});

test("a stalled fill offers delete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.templates.push(ownTemplate(30, "haengt", "processing", STALLED_AT));
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  const card = cardOf(page, "haengt");
  await expect(card).toContainText("Das dauert ungewöhnlich lange.");
  await expect(card.getByRole("button", { name: "Als Standard" })).toHaveCount(0);
  await card.getByRole("button", { name: "haengt löschen" }).click();
  await page
    .getByRole("dialog", { name: "Vorlage löschen?" })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(card).toHaveCount(0);
  expect(server.templates.some((entry) => entry.id === 30)).toBe(false);
});

test("a file that is not HTML is refused before anything is sent", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles({
    name: "lebenslauf.docx",
    mimeType: "application/msword",
    buffer: Buffer.from("PK"),
  });
  await expect(page.getByText("Nur HTML-Vorlagen (.html) werden unterstützt.")).toBeVisible();
  expect(log.requests).not.toContain("POST /document-templates");
});

test("Vorlagen live states: screenshots", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.templates.push(
    ownTemplate(31, "in_arbeit", "processing"),
    ownTemplate(32, "ohne_ki", "annotation_failed"),
    ownTemplate(33, "haengt", "processing", STALLED_AT),
  );
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await expect(cardOf(page, "haengt")).toContainText("Das dauert ungewöhnlich lange.");
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `profile-templates-live-${size}-${scheme}`);
    }
  }
});
