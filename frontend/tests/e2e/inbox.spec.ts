import type { PlatformBody } from "../../src/api/platforms";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { inboxRoutes, listItem, PLATFORMS_WITH_RUNS } from "./support/inboxFixtures";
import { fixNow, JOB_ID, jobBody, jobRoutes } from "./support/jobFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const SERVER_ERROR = { status: 500, body: { detail: "boom" } };
// The browser logs the failed GET /platforms (and the client's retries of it) as console errors.
const FAILED_PLATFORMS = /Failed to load resource: the server responded with a status of 500/;

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`inbox renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(inboxRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
      await expect(page.getByText("3 neue Treffer.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
      await expect(page.getByRole("tab", { name: /^Neu/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        page.getByText(/12 gefunden, 3 passend, 2 unter Schwellwert · Nächster Lauf heute 14:00\./),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-${size}-${scheme}`);
    });
  }
}

const TABS = [
  ["unter", "Unter Schwellwert", "Fullstack-Entwickler PHP"],
  ["aus", "Von dir aussortiert", "Teamlead Java Backend"],
] as const;

for (const [param, tabName, title] of TABS) {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`tab ${tabName} at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
        await mockApi(inboxRoutes());
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/inbox?tab=${param}`);
        await expect(page.getByRole("tab", { name: new RegExp(tabName) })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(page.getByRole("link", { name: title })).toBeVisible();
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `inbox-${param}-${size}-${scheme}`);
      });
    }
  }
}

test("switching tabs keeps the choice in the URL", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox");
  await page.getByRole("tab", { name: /Unter Schwellwert/ }).click();
  await expect(page).toHaveURL(/\/inbox\?tab=unter$/);
  await expect(page.getByRole("link", { name: "Fullstack-Entwickler PHP" })).toBeVisible();
});

test("the run line opens the jobs below the threshold", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Unter Schwellwert ansehen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/inbox\?tab=unter$/);
  await expect(page.getByRole("link", { name: "SAP ABAP Entwickler" })).toBeVisible();
  // Spec 4.3 #5: the button left with the tab switch, so focus lands on the new tab, not the page.
  await expect(page.getByRole("tab", { name: /Unter Schwellwert/ })).toBeFocused();
});

const KOTLIN_JOB = jobBody({ title: "Senior Kotlin Engineer", company: "N26" });

test("below 1200px a row opens the job page", async ({ page, mockApi }) => {
  await mockApi({ ...jobRoutes(KOTLIN_JOB), ...inboxRoutes() });
  await page.setViewportSize(VIEWPORTS.medium);
  await page.goto("/inbox");
  await expect(page.getByRole("complementary", { name: "Vorschau" })).toHaveCount(0);
  await page.getByRole("link", { name: "Senior Kotlin Engineer" }).click();
  await expect(page).toHaveURL(/\/jobs\/job-1$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Senior Kotlin Engineer" }),
  ).toBeVisible();
});

test("going back from a job page restores the tab", async ({ page, mockApi }) => {
  const below = listItem(JOB_ID, {
    title: "Senior Kotlin Engineer",
    company: "N26",
    match_score: 54,
    is_archived: true,
    archive_reason: "THRESHOLD",
  });
  await mockApi({ ...jobRoutes(KOTLIN_JOB), ...inboxRoutes({ below: [below] }) });
  await page.setViewportSize(VIEWPORTS.medium);
  await page.goto("/inbox");
  await page.getByRole("tab", { name: /Unter Schwellwert/ }).click();
  await expect(page).toHaveURL(/\/inbox\?tab=unter$/);
  await page.getByRole("link", { name: "Senior Kotlin Engineer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Senior Kotlin Engineer" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/inbox\?tab=unter$/);
  await expect(page.getByRole("tab", { name: /Unter Schwellwert/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("an empty inbox says so and offers the sources", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes({ new: [] }));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 2, name: "Keine neuen Treffer" })).toBeVisible();
  await expect(page.getByText("Alles gesichtet.", { exact: false })).toHaveCount(1);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Eingang/ }).locator(".count-badge")).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel").getByRole("link", { name: "Quellen ansehen" }),
  ).toHaveAttribute("href", "/sources");
  await saveScreenshot(page, "inbox-empty-1440");
});

test("a failed last run is shown with its reason", async ({ page, mockApi }) => {
  const failing: PlatformBody[] = [
    {
      id: 2,
      name: "Indeed",
      url: "https://de.indeed.com",
      last_run: { finished_at: "2026-10-08T06:00:00+00:00", error: "unreachable" },
    },
  ];
  await mockApi(inboxRoutes({}, { "GET /platforms": { body: failing } }));
  await page.goto("/inbox");
  await expect(
    page.getByText("Letzter Lauf: Indeed, heute 08:00, fehlgeschlagen (Seite nicht erreichbar)."),
  ).toBeVisible();
});

test.describe("sources that cannot be loaded", () => {
  test.use({ allowedConsoleErrors: [FAILED_PLATFORMS] });

  test("the run line says so and offers a retry", async ({ page, mockApi }) => {
    const routes = inboxRoutes({}, { "GET /platforms": SERVER_ERROR });
    await mockApi(routes);
    await page.goto("/inbox");
    await expect(page.getByText("Der letzte Lauf konnte nicht geladen werden.")).toBeVisible();
    await expect(page.getByText("boom")).toHaveCount(0);
    setRoutes(routes, { "GET /platforms": { body: PLATFORMS_WITH_RUNS } });
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(page.getByText(/12 gefunden, 3 passend, 2 unter Schwellwert · /)).toBeVisible();
  });
});

for (const path of ["/inbox", "/inbox?tab=unter", "/inbox?tab=aus"]) {
  test(`no horizontal scroll at 375px on ${path}`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes());
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(path);
    await expect(page.getByRole("tabpanel").getByRole("listitem").first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
}
