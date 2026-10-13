import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import {
  BELOW_ITEMS,
  DISMISSED_ITEMS,
  inboxRoutes,
  listRoutes,
  NEW_ITEMS,
} from "./support/inboxFixtures";
import { fixNow, jobBody, UPDATED } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const REST = NEW_ITEMS.slice(1);
const DELETED = { body: { status: "deleted" } };
const LEAD = DISMISSED_ITEMS[0]!;

const sentTo = (log: ApiLog, key: string) =>
  log.calls.filter((call) => call.key === key).map((call) => call.body);

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`dismissing a match shows the undo toast at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const routes = inboxRoutes({}, { "PATCH /jobs/job-1": UPDATED });
      const log = await mockApi(routes);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      const dismiss = page
        .getByRole("tabpanel")
        .getByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" });
      // Only once the list is loaded: the refetch after the PATCH sees the server without the job.
      await expect(dismiss).toBeVisible();
      setRoutes(routes, listRoutes({ new: REST }));
      await dismiss.click();
      await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(0);
      await expect(page.getByText("Aussortiert: N26.")).toBeVisible();
      expect(sentTo(log, "PATCH /jobs/job-1")).toEqual([{ is_archived: true }]);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-dismissed-toast-${size}-${scheme}`);
    });
  }
}

test("Rückgängig brings a sorted-out match back", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-1": UPDATED });
  const log = await mockApi(routes);
  await page.goto("/inbox");
  const dismiss = page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" });
  await expect(dismiss).toBeVisible();
  setRoutes(routes, listRoutes({ new: REST }));
  await dismiss.click();
  await expect(page.getByText("Aussortiert: N26.")).toBeVisible();
  setRoutes(routes, listRoutes());
  await page.getByRole("button", { name: "Rückgängig" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Rückgängig gemacht: N26 ist wieder unter Neu.")).toBeVisible();
  // Spec 4.3 #5: the toast left with its focused button; focus returns to the page, not body.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(1);
  expect(sentTo(log, "PATCH /jobs/job-1")).toEqual([{ is_archived: true }, { is_archived: false }]);
});

test("shortlisting moves a match on to Bewerbungen", async ({ page, mockApi }) => {
  const shortlisted = { body: jobBody({ status: "DRAFTED" }) };
  const routes = inboxRoutes({}, { "POST /jobs/job-1/status": shortlisted });
  const log = await mockApi(routes);
  await page.goto("/inbox");
  const shortlist = page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Vormerken: Senior Kotlin Engineer" });
  await expect(shortlist).toBeVisible();
  setRoutes(routes, listRoutes({ new: REST }));
  await shortlist.click();
  await expect(page.getByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(0);
  expect(sentTo(log, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }]);
});

test("restoring from Unter Schwellwert offers to view the job", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-20": UPDATED });
  await mockApi(routes);
  await page.goto("/inbox?tab=unter");
  const restore = page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Wiederherstellen: Fullstack-Entwickler PHP" });
  await expect(restore).toBeVisible();
  setRoutes(routes, listRoutes({ below: BELOW_ITEMS.slice(1) }));
  await restore.click();
  await expect(page.getByText("Aroundhome ist wieder im Eingang.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fullstack-Entwickler PHP" })).toHaveCount(0);
  // Scoped: the run line has its own "Ansehen" button.
  await expect(page.locator(".toasts").getByRole("button", { name: "Ansehen" })).toBeVisible();
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`deleting for good asks first at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const routes = inboxRoutes({}, { "DELETE /jobs/job-17": DELETED });
      const log = await mockApi(routes);
      await page.setViewportSize(viewport);
      // Reduced motion: the screenshot shows the dialog, not a frame of its entry animation.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto("/inbox?tab=aus");
      await page.getByRole("button", { name: `Endgültig löschen: ${LEAD.title}` }).click();
      const dialog = page.getByRole("dialog", { name: "Endgültig löschen?" });
      await expect(dialog).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-delete-dialog-${size}-${scheme}`);
      expect(log.requests).not.toContain("DELETE /jobs/job-17");
      setRoutes(routes, listRoutes({ dismissed: [] }));
      await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
      await expect(page.getByText("Gelöscht: Check24.")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Nichts aussortiert" }),
      ).toBeVisible();
    });
  }
}
