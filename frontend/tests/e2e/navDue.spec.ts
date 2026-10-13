import type { Locator } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import { dueListPath } from "../../src/api/jobListPaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { inboxRoutes, listItem } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

// Fixed now 2026-10-08 10:00 Berlin: one overdue follow-up, one interview tomorrow, one far ahead.
// The ids stay clear of the inbox fixtures (job-1..3, 17, 20, 21).
const DUE: JobListItemBody[] = [
  listItem("job-50", { status: "APPLIED", next_follow_up_at: "2026-10-06T07:00:00+00:00" }),
  listItem("job-51", { status: "INTERVIEW", interview_at: "2026-10-09T08:00:00+00:00" }),
  listItem("job-52", { status: "APPLIED", next_follow_up_at: "2026-10-30T07:00:00+00:00" }),
];
const SIDEBAR_SIZE = "1440";
const DUE_REQUEST = `GET ${dueListPath()}`;

const LABEL_GAP_PX = 8;
const SIDEBAR_PADDING_PX = 22;
const SAME_EDGE_PX = 0.5;

/** The long label "Bewerbungen" keeps 8 px from the pill, and the pill ends where the inbox pill ends. */
async function expectPillClearOfLabel(link: Locator): Promise<void> {
  const page = link.page();
  const label = (await link.locator(".nav-label").boundingBox())!;
  const pill = (await link.locator(".count-badge").boundingBox())!;
  const inboxPill = (await page.locator(".nav a .count-badge").first().boundingBox())!;
  const sidebar = (await page.locator(".sidebar").boundingBox())!;
  expect(pill.x - (label.x + label.width)).toBeGreaterThanOrEqual(LABEL_GAP_PX);
  expect(pill.x + pill.width).toBeLessThanOrEqual(sidebar.x + sidebar.width - SIDEBAR_PADDING_PX);
  expect(Math.abs(pill.x + pill.width - (inboxPill.x + inboxPill.width))).toBeLessThanOrEqual(
    SAME_EDGE_PX,
  );
}

test.beforeEach(async ({ page }) => fixNow(page));

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Bewerbungen in the nav shows what is due at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(inboxRoutes({ due: DUE }));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
      const link = nav.getByRole("link", { name: /Bewerbungen/ });
      // The pill holds the visible numeral and the screen-reader sentence (CountBadge).
      await expect(link.locator(".count-badge-neutral")).toContainText("2");
      await expect(link.getByText("2 fällig")).toHaveClass("sr-only");
      // The same number as the pill: the inbox card, the header and the badge agree (Review Focus 2).
      await expect(
        page.getByRole("region", { name: "Anstehend" }).getByRole("listitem"),
      ).toHaveCount(2);
      expect(await horizontalOverflow(page)).toBe(0);
      if (size === SIDEBAR_SIZE) await expectPillClearOfLabel(link);
      await saveScreenshot(page, `nav-due-${size}-${scheme}`);
    });
  }
}

test("no badge when nothing is due", async ({ page, mockApi }) => {
  const log = await mockApi(inboxRoutes({ due: [DUE[2]!] }));
  await page.goto("/inbox");
  await expect.poll(() => log.requests.includes(DUE_REQUEST)).toBe(true);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  // The nav number is aria-hidden, so without a badge the link's name is the label alone.
  await expect(nav.getByRole("link", { name: "Bewerbungen", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Bewerbungen/ }).locator(".count-badge")).toHaveCount(
    0,
  );
});

test("the longer English label still leaves room for the pill", async ({ page, mockApi }) => {
  await mockApi(
    inboxRoutes(
      { due: DUE },
      { "GET /settings": { body: { language: "en", match_threshold: 60 } } },
    ),
  );
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const link = nav.getByRole("link", { name: /Applications/ });
  await expect(link.getByText("2 due")).toHaveClass("sr-only");
  await expectPillClearOfLabel(link);
});
