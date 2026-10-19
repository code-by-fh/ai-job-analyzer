import type { Page } from "@playwright/test";
import { NOTIFICATION_TEMPLATES_PATH } from "../../src/api/platformPaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { MEMBER } from "./support/settingsFixtures";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, SANDBOX_PROBE, test } from "./support/test";

// Chromium logs one line per Playwright probe into the script-less preview frame.
test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

const NOTIFICATIONS_URL = "/settings?section=notifications";
const CREATE_KEY = `POST ${NOTIFICATION_TEMPLATES_PATH}`;
const WEEKLY = {
  name: "Wochenmail",
  content: "<h1>Hallo $userName</h1>{{#jobs}}<p>$title bei $company ($match_score %)</p>{{/jobs}}",
};
// The hostile render's relative image resolves against the app origin; the editor CSP blocks it.
const CSP_IMAGE_BLOCK =
  /^Loading the image 'http:\/\/localhost:\d+\/x' violates the following Content Security Policy directive: "img-src data: blob:"\. The action has been blocked\.$/;

const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Benachrichtigungen" });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const editor = (page: Page, name: string) => page.getByRole("form", { name });
const previewDialog = (page: Page) => page.getByRole("dialog", { name: "Vorschau" });
const previewFrame = (page: Page) => previewDialog(page).frameLocator("iframe[title='Vorschau']");

// Inside the hostile body's first shadow root, a 300 x 100 link would start below the first line.
const SHADOW_LINK_SPOT = { x: 40, y: 40 };

/** Every request to the hostile body's remote host; the frame must never make one. */
async function recordRemote(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route("https://evil.example/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  return requests;
}

async function openNotifications(page: Page): Promise<void> {
  await page.goto(NOTIFICATIONS_URL);
  await expect(heading(page)).toBeVisible();
  await expect(page.getByText("Kurz", { exact: true })).toBeVisible();
}

/** "Neue Vorlage" as E-Mail with the weekly text, still unsaved. */
async function draftWeekly(page: Page): Promise<void> {
  await button(page, "Neue Vorlage").click();
  const form = editor(page, "Neue Vorlage");
  await form.getByLabel("Name").fill(WEEKLY.name);
  await form.getByLabel("Text").fill(WEEKLY.content);
}

test("create an email template, preview it, pick it in a source drawer", async ({
  page,
  mockApi,
}) => {
  await fixNow(page);
  const settings = new SettingsServer();
  const log = await mockApi(sourcesRoutes(new SourcesServer(), settingsRoutes(settings, {}, {})));
  await openNotifications(page);
  await draftWeekly(page);
  const form = editor(page, "Neue Vorlage");
  await form.getByRole("button", { name: "Vorschau" }).click();
  await expect(
    previewFrame(page).getByText("Senior Software Engineer bei Acme Corp (87 %)"),
  ).toBeVisible();
  await expect(previewFrame(page).getByRole("heading", { name: "Hallo admin" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form.getByRole("button", { name: "Vorschau" })).toBeFocused();
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Vorlage gespeichert.")).toBeVisible();
  expect(log.calls.filter((call) => call.key === CREATE_KEY).map((call) => call.body)).toEqual([
    { ...WEEKLY, type: "RESEND" },
  ]);
  await expect(page.getByRole("list", { name: "E-Mail" }).getByText(WEEKLY.name)).toBeVisible();
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  const drawer = page.getByRole("dialog", { name: "Quelle StepStone" });
  await drawer.getByLabel("Bewerbungs-Mail benachrichtigen").check();
  const select = drawer.getByLabel("Vorlage für E-Mail (Resend)");
  await expect(select.locator("option", { hasText: WEEKLY.name })).toHaveCount(1);
});

test("edit a template, then delete it: focus lands on the section heading", async ({
  page,
  mockApi,
}) => {
  const settings = new SettingsServer();
  const log = await mockApi(settingsRoutes(settings));
  await openNotifications(page);
  await button(page, "Kurz bearbeiten").click();
  const form = editor(page, "Kurz");
  await expect(form.getByText("Pushover", { exact: true })).toBeVisible();
  await form.getByLabel("Text").fill("$title");
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Vorlage gespeichert.")).toBeVisible();
  await expect(button(page, "Kurz bearbeiten")).toBeFocused();
  const put = log.calls.find((call) => call.key === `PUT ${NOTIFICATION_TEMPLATES_PATH}/31`);
  expect(put?.body).toEqual({ name: "Kurz", content: "$title" });
  await button(page, "Kurz löschen").click();
  await page
    .getByRole("dialog", { name: "„Kurz“ löschen?" })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(page.getByText("Vorlage gelöscht.")).toBeVisible();
  await expect(heading(page)).toBeFocused();
  await expect(page.getByText("Kurz", { exact: true })).toHaveCount(0);
  expect(settings.templates.map((template) => template.id)).toEqual([32]);
});

test("a member sees global templates read-only", async ({ page, mockApi }) => {
  const settings = new SettingsServer();
  settings.isAdmin = false;
  await mockApi(settingsRoutes(settings, { "GET /me": { body: MEMBER } }));
  await openNotifications(page);
  const email = page.getByRole("list", { name: "E-Mail" });
  await expect(email.getByText("Digest")).toBeVisible();
  await expect(email.getByText("Für alle")).toBeVisible();
  await expect(page.getByRole("button", { name: "Digest bearbeiten" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Digest löschen" })).toHaveCount(0);
  await expect(button(page, "Kurz bearbeiten")).toBeVisible();
  await button(page, "Neue Vorlage").click();
  await expect(editor(page, "Neue Vorlage")).toBeVisible();
  await expect(page.getByLabel("Für alle Benutzer")).toHaveCount(0);
});

test.describe("a hostile preview", () => {
  // Tuple form: Playwright would read a bare [RegExp, RegExp] as [value, fixture options].
  test.use({ allowedConsoleErrors: [[SANDBOX_PROBE, CSP_IMAGE_BLOCK], { scope: "test" }] });

  test("a script in a template preview never runs and no link leaves the frame", async ({
    page,
    mockApi,
  }) => {
    const settings = new SettingsServer();
    settings.hostilePreview = true;
    await mockApi(settingsRoutes(settings));
    const remote = await recordRemote(page);
    await openNotifications(page);
    const before = { title: await page.title(), url: page.url() };
    await button(page, "Digest bearbeiten").click();
    await editor(page, "Digest").getByRole("button", { name: "Vorschau" }).click();
    await expect(previewDialog(page).locator("iframe")).toHaveAttribute("sandbox", "");
    await expect(previewFrame(page).locator("p")).toHaveText("x");
    // The one link left (its target removed), then where the shadow link and SMIL link would sit.
    await previewFrame(page).locator("a").click();
    await previewDialog(page).locator("iframe").click({ position: SHADOW_LINK_SPOT });
    await expect(previewFrame(page).locator("p")).toHaveText("x");
    expect(remote).toEqual([]);
    expect(page.frames().map((frame) => frame.url())).toContain("about:srcdoc");
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    expect({ title: await page.title(), url: page.url() }).toEqual(before);
  });
});

test("Vorlagen with an open editor and its preview: no horizontal scroll, screenshots", async ({
  page,
  mockApi,
}) => {
  await mockApi(settingsRoutes());
  await openNotifications(page);
  await draftWeekly(page);
  const form = editor(page, "Neue Vorlage");
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await form.getByLabel("Text").scrollIntoViewIfNeeded();
      // The resting state: no field or button keeps a focus ring in the shot.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-templates-editor-${size}-${scheme}`);
      await form.getByRole("button", { name: "Vorschau" }).click();
      await expect(previewFrame(page).getByText(/Senior Software Engineer/)).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-templates-preview-${size}-${scheme}`);
      await page.keyboard.press("Escape");
    }
  }
});
