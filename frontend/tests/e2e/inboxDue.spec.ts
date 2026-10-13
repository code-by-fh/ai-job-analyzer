import { dueListPath } from "../../src/api/jobListPaths";
import { COLOR_SCHEMES, MOCK_API_PREFIX, SCREENSHOT_SIZES } from "./support/constants";
import { inboxRoutes, listItem } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const DUE = [
  listItem("job-40", {
    title: "Platform Engineer",
    company: "Otto",
    status: "APPLIED",
    next_follow_up_at: "2026-10-01T08:00:00+00:00",
  }),
  listItem("job-41", {
    title: "Kotlin Developer",
    company: "Hermes",
    status: "INTERVIEW",
    interview_at: "2026-10-09T12:00:00+00:00",
  }),
  listItem("job-42", {
    title: "Java Engineer",
    company: "Tchibo",
    status: "OFFER",
    next_follow_up_at: "2026-10-30T08:00:00+00:00",
  }),
  listItem("job-43", {
    title: "Staff Engineer",
    company: "Zalando",
    status: "APPLIED",
    next_follow_up_at: "2026-10-02T08:00:00+00:00",
  }),
  listItem("job-44", {
    title: "Lead Developer",
    company: "Otto",
    status: "APPLIED",
    next_follow_up_at: "2026-10-03T08:00:00+00:00",
  }),
];
const DUE_REQUEST = `GET ${dueListPath()}`;

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the due card shows the three earliest due steps at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(inboxRoutes({ due: DUE }));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      const card = page.getByRole("region", { name: "Anstehend" });
      const links = card.getByRole("link");
      await expect(links).toHaveCount(3);
      await expect(links.first()).toHaveAttribute("href", "/jobs/job-40");
      await expect(card.getByText("überfällig seit 01.10.2026")).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-due-${size}-${scheme}`);
    });
  }
}

test("no due card without due steps", async ({ page, mockApi }) => {
  const log = await mockApi(inboxRoutes({ due: [DUE[2]!] }));
  await page.goto("/inbox");
  await expect.poll(() => log.requests.includes(DUE_REQUEST)).toBe(true);
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anstehend" })).toHaveCount(0);
});

test("the list waits for the due card, so nothing is pushed down", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes({ due: DUE }));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Registered after the mock, so it sees the due request first and hands it on when released.
  await page.route(`**${MOCK_API_PREFIX}${dueListPath()}`, async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Anstehend" })).toHaveCount(0);
  release();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anstehend" })).toBeVisible();
});
