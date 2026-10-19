import { inboxRoutes } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { VIEWPORTS } from "./support/constants";
import { saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

test("archive all sits in the inbox header and archives with the keep defaults", async ({
  page,
  mockApi,
}) => {
  const log = await mockApi(
    inboxRoutes({}, { "DELETE /jobs": { body: { status: "archived", count: 2 } } }),
  );
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  const opener = page.getByRole("button", { name: "Alle Stellen archivieren" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Alle Stellen archivieren" });
  await expect(dialog).toContainText("Verschiebt alle Treffer im Eingang");
  await saveScreenshot(page, "inbox-archive-all-1440-light");
  // Phase 8 Q1: checkbox rows are 44 px touch targets, desktop included.
  for (const check of await dialog.locator(".check").all()) {
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const sent = () => log.calls.filter((call) => call.key === "DELETE /jobs");
  expect(sent()).toHaveLength(0);
  await dialog.getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByText("2 Stellen archiviert.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(sent()).toHaveLength(1);
});
