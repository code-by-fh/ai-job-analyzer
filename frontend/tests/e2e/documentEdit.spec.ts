import type { Page, Request } from "@playwright/test";
import { jobBody, jobRoutes, JOB_ID, READY } from "./support/jobFixtures";
import type { MockRoutes } from "./support/mockApi";
import { clickInZoomedFrame } from "./support/page";
import { expect, SANDBOX_PROBE, test } from "./support/test";

// The script and the handlers must never run; the page title and a global are the witnesses.
const HOSTILE_CV =
  "<html><head><script>window.top.document.title = 'pwned'; window.__pwned = 1;</script></head>" +
  "<body><p onclick=\"window.top.document.title = 'pwned'\">Erfahrung</p>" +
  "<a href=\"javascript:window.top.document.title = 'pwned'\">Link</a></body></html>";
const FRAME_TITLE = "Lebenslauf bearbeiten";
const EDITOR_FRAME = `iframe[title="${FRAME_TITLE}"]`;
const PREVIEW_FRAME = 'iframe[title="Lebenslauf"]';
const TYPED = "Neue Zeile";

test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

const ROUTES: MockRoutes = jobRoutes(jobBody({ status: "DRAFTED", ...READY }), {
  [`GET /jobs/${JOB_ID}/documents/html`]: { body: { html: HOSTILE_CV } },
  [`PUT /jobs/${JOB_ID}/documents/html`]: { body: { ok: true } },
});

async function openEditor(page: Page) {
  await page.goto("/jobs/job-1");
  await page
    .getByRole("group", { name: "Lebenslauf" })
    .getByRole("button", { name: "Bearbeiten" })
    .click();
  const frame = page.frameLocator(EDITOR_FRAME);
  await expect(frame.locator("body")).toContainText("Erfahrung");
  return frame;
}

async function typeIntoFrame(page: Page, frame: ReturnType<Page["frameLocator"]>) {
  await clickInZoomedFrame(page, EDITOR_FRAME, frame.locator("body"));
  await page.keyboard.type(TYPED);
}

const isHtmlPut = (request: Request) =>
  request.method() === "PUT" && request.url().includes("/documents/html");

test("scripts, handlers and javascript: links in the stored HTML do not run", async ({
  page,
  mockApi,
}) => {
  await mockApi(ROUTES);
  const frame = await openEditor(page);
  await expect(frame.locator("script")).toHaveCount(0);
  await clickInZoomedFrame(page, EDITOR_FRAME, frame.locator("p"));
  await expect(frame.locator("a")).not.toHaveAttribute("href", /.+/);
  await clickInZoomedFrame(page, EDITOR_FRAME, frame.locator("a"));
  expect(await page.title()).not.toBe("pwned");
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
});

test("the read-only preview runs no script and follows no link of the stored HTML", async ({
  page,
  mockApi,
}) => {
  await mockApi(ROUTES);
  await page.goto("/jobs/job-1");
  await page
    .getByRole("group", { name: "Lebenslauf" })
    .getByRole("button", { name: "Vorschau" })
    .click();
  const frame = page.frameLocator(PREVIEW_FRAME);
  await expect(frame.locator("body")).toContainText("Erfahrung");
  await expect(frame.locator("script")).toHaveCount(0);
  await expect(frame.locator("a")).not.toHaveAttribute("href", /.+/);
  await clickInZoomedFrame(page, PREVIEW_FRAME, frame.locator("a"));
  expect(await page.title()).not.toBe("pwned");
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
});

test("edits and saves: only the typed HTML is sent, no PDF is rendered", async ({
  page,
  mockApi,
}) => {
  const api = await mockApi(ROUTES);
  const frame = await openEditor(page);
  await typeIntoFrame(page, frame);
  const put = page.waitForRequest(isHtmlPut);
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  const body = (await put).postDataJSON() as { html: string };
  expect(body.html).toContain(TYPED);
  expect(body.html).not.toContain("<script");
  await expect(page.getByText("Änderungen gespeichert.")).toBeVisible();
  expect(api.requests.filter((key) => key.startsWith("POST /jobs"))).toEqual([]);
});

test("closing the preview asks before unsaved edits are lost", async ({ page, mockApi }) => {
  await mockApi(ROUTES);
  const frame = await openEditor(page);
  await typeIntoFrame(page, frame);
  await page
    .getByRole("dialog", { name: "Lebenslauf" })
    .getByRole("button", { name: "Schließen" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(frame.locator("body")).toContainText(TYPED);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// Twenty numbered lines: a click mapped with the wrong zoom would land on a neighbouring one.
const LINE_COUNT = 20;
const TARGET_LINE = 14;
const LINES_CV =
  "<html><body>" +
  Array.from({ length: LINE_COUNT }, (_, index) => `<p>Zeile ${index + 1}</p>`).join("") +
  "</body></html>";

test("a click on the zoomed page puts the caret where it was clicked", async ({
  page,
  mockApi,
}) => {
  await mockApi({
    ...ROUTES,
    [`GET /jobs/${JOB_ID}/documents/html`]: { body: { html: LINES_CV } },
  });
  await page.goto("/jobs/job-1");
  await page
    .getByRole("group", { name: "Lebenslauf" })
    .getByRole("button", { name: "Bearbeiten" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Lebenslauf" }).locator(".paper");
  await expect(sheet).not.toHaveClass(/zoom-100/);
  const frame = page.frameLocator(EDITOR_FRAME);
  const target = frame.locator("p").nth(TARGET_LINE - 1);
  await clickInZoomedFrame(page, EDITOR_FRAME, target);
  await page.keyboard.press("End");
  await page.keyboard.type(TYPED);
  await expect(target).toHaveText(`Zeile ${TARGET_LINE}${TYPED}`);
  await expect(frame.locator("p").nth(TARGET_LINE - 2)).toHaveText(`Zeile ${TARGET_LINE - 1}`);
  await expect(frame.locator("p").nth(TARGET_LINE)).toHaveText(`Zeile ${TARGET_LINE + 1}`);
});
