import type { Page, Request } from "@playwright/test";
import { ADMIN_USER_ID } from "./support/fixtures";
import { jobBody, jobRoutes, JOB_ID, READY } from "./support/jobFixtures";
import type { ApiLog, MockRoutes } from "./support/mockApi";
import { expect, SANDBOX_PROBE, test } from "./support/test";

// The script and the handlers must never run; the page title and a global are the witnesses.
const HOSTILE_CV =
  "<html><head><script>window.top.document.title = 'pwned'; window.__pwned = 1;</script></head>" +
  "<body><p onclick=\"window.top.document.title = 'pwned'\">Erfahrung</p>" +
  "<a href=\"javascript:window.top.document.title = 'pwned'\">Link</a></body></html>";
const FRAME_TITLE = "Lebenslauf bearbeiten";
const TYPED = "Neue Zeile";

test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

const ROUTES: MockRoutes = jobRoutes(jobBody({ status: "DRAFTED", ...READY }), {
  [`GET /jobs/${JOB_ID}/documents/html`]: { body: { html: HOSTILE_CV } },
  [`PUT /jobs/${JOB_ID}/documents/html`]: { body: { ok: true } },
  [`POST /jobs/${JOB_ID}/documents/render`]: { body: { queued: true } },
});

async function openEditor(page: Page) {
  await page.goto("/jobs/job-1");
  await page
    .getByRole("group", { name: "Lebenslauf" })
    .getByRole("button", { name: "Bearbeiten" })
    .click();
  const frame = page.frameLocator(`iframe[title="${FRAME_TITLE}"]`);
  await expect(frame.locator("body")).toContainText("Erfahrung");
  return frame;
}

async function typeIntoFrame(page: Page, frame: ReturnType<Page["frameLocator"]>) {
  await frame.locator("body").click();
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
  await frame.locator("p").click();
  await expect(frame.locator("a")).not.toHaveAttribute("href", /.+/);
  await frame.locator("a").click();
  expect(await page.title()).not.toBe("pwned");
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
});

test("edits, saves and re-renders: the typed text is sent and the render ends with the event", async ({
  page,
  mockApi,
}) => {
  const api: ApiLog = await mockApi(ROUTES);
  const frame = await openEditor(page);
  await typeIntoFrame(page, frame);
  const put = page.waitForRequest(isHtmlPut);
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  const body = (await put).postDataJSON() as { html: string };
  expect(body.html).toContain(TYPED);
  expect(body.html).not.toContain("<script");
  await expect(page.getByText("PDF wird neu gesetzt …")).toBeVisible();
  const done = { type: "job_update", user_id: ADMIN_USER_ID, job_id: "job-1", rendered_kind: "cv" };
  await expect.poll(() => api.sockets.length).toBe(1);
  api.sockets[0].send(JSON.stringify(done));
  await expect(page.getByText("PDF wird neu gesetzt …")).toBeHidden();
});

test("a link in the app asks before unsaved edits are lost", async ({ page, mockApi }) => {
  await mockApi(ROUTES);
  const frame = await openEditor(page);
  await typeIntoFrame(page, frame);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await nav.getByRole("link", { name: /Eingang/ }).click();
  const dialog = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page).toHaveURL(/\/jobs\/job-1/);
  await expect(frame.locator("body")).toContainText(TYPED);
  await nav.getByRole("link", { name: /Eingang/ }).click();
  await dialog.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(page).toHaveURL(/\/inbox/);
});
