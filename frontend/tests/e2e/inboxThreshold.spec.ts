import type { Page } from "@playwright/test";
import type { ThresholdAppliedBody, ThresholdPreviewBody } from "../../src/api/threshold";
import { SCORE_BUCKETS } from "../../src/domain/threshold";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { BELOW_ITEMS, inboxRoutes } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import type { MockResponse } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const SAVED = 60;
const DRAFT = 75;
const ARCHIVED = 2;
const PREVIEW_75: ThresholdPreviewBody = {
  threshold: DRAFT,
  would_archive: ARCHIVED,
  would_restore: 0,
};
const FIELD_NAME = "Schwellwert für automatisches Aussortieren";

/** GET /settings answers what the last POST /matching-preference saved, like the server does. */
function thresholdServer(): Record<string, MockResponse> {
  let saved = SAVED;
  return {
    "GET /settings": { body: null, respond: () => ({ language: "de", match_threshold: saved }) },
    "POST /matching-preference": {
      body: null,
      respond: (sent) => {
        saved = (sent as { match_threshold: number }).match_threshold;
        const applied: ThresholdAppliedBody = {
          match_threshold: saved,
          archived: ARCHIVED,
          restored: 0,
        };
        return { status: "saved", ...applied };
      },
    },
  };
}

test.beforeEach(async ({ page }) => {
  await fixNow(page);
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the threshold panel renders at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(inboxRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox?tab=unter");
      await expect(page.getByRole("heading", { level: 2, name: "Schwellwert" })).toBeVisible();
      await expect(
        page.getByRole("img", { name: "Verteilung: 5 Stellen, 2 davon unter 60" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: BELOW_ITEMS[0]!.title ?? "" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-threshold-${size}-${scheme}`);
    });
  }
}

test("previews, applies and undoes a threshold", async ({ page, mockApi }) => {
  const extra = { [`GET /matching-preference/preview?threshold=${DRAFT}`]: { body: PREVIEW_75 } };
  const log = await mockApi(inboxRoutes({}, { ...thresholdServer(), ...extra }));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox?tab=unter");
  const field = page.getByRole("spinbutton", { name: FIELD_NAME });
  await field.fill(String(DRAFT));
  await expect(
    page.getByText("Bei 75: 2 Treffer würden ausgeblendet, 0 kämen zurück."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(
    page.getByText("Schwellwert 75 übernommen: 2 ausgeblendet, 0 zurückgeholt."),
  ).toBeVisible();
  await expect(field).toHaveValue(String(DRAFT));
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht: Schwellwert wieder 60.")).toBeVisible();
  await expect(field).toHaveValue(String(SAVED));
  const posts = log.calls
    .filter((call) => call.key === "POST /matching-preference")
    .map((call) => call.body);
  expect(posts).toEqual([
    { match_threshold: DRAFT, apply_to_existing: true },
    { match_threshold: SAVED, apply_to_existing: true },
  ]);
});

// 0, 50 and 100 as asked; a click at the ends clamps and 50 is symmetric, so 10 and 90 are what
// catch a missing half-thumb inset.
const ALIGNMENT_SCORES = [0, 10, 50, 90, 100];
const EDGE_DISTRIBUTION = {
  counts: Array.from({ length: SCORE_BUCKETS }, (_, score) =>
    ALIGNMENT_SCORES.includes(score) ? 1 : 0,
  ),
};

const EDGE_ROUTES = {
  "GET /matching-preference/distribution": { body: EDGE_DISTRIBUTION },
  // Each click previews its value; the counts do not matter here.
  "GET /matching-preference/preview": {
    body: null,
    respond: () => ({ threshold: 0, would_archive: 0, would_restore: 0 }),
  },
};

/**
 * The browser maps a click to the value whose thumb centre lies under the pointer. A click on
 * the centre of tick n therefore gives n exactly only when thumb and tick are less than half a
 * point apart (about 1.7 px at these widths), which is within the 2 px the review asks for.
 */
async function valueUnderTick(page: Page, score: number): Promise<string> {
  const tick = await page.locator(`.thr-tick[data-score="${score}"]`).boundingBox();
  const slider = page.getByRole("slider", { name: FIELD_NAME });
  const track = await slider.boundingBox();
  if (!tick || !track) throw new Error("tick or slider not laid out");
  await page.mouse.click(tick.x + tick.width / 2, track.y + track.height / 2);
  return slider.inputValue();
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`thumb and ticks line up at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes({}, EDGE_ROUTES));
    await page.setViewportSize(viewport);
    await page.goto("/inbox?tab=unter");
    await expect(page.getByRole("img", { name: /^Verteilung: 5 Stellen/ })).toBeVisible();
    for (const score of ALIGNMENT_SCORES) {
      expect(await valueUnderTick(page, score)).toBe(String(score));
    }
  });
}

const LABELLED_SCORES = [60, 80];
const LABEL_TOLERANCE_PX = 2;
const MIN_LABEL_GAP_PX = 4;
const LABEL_ROUTES = {
  "GET /matching-preference/distribution": {
    body: {
      counts: Array.from({ length: SCORE_BUCKETS }, (_, score) =>
        LABELLED_SCORES.includes(score) ? 1 : 0,
      ),
    },
  },
};
const SCALE_WIDTHS = [320, 375, 390, 1440];
// The English words are the longest ("everything", "Possible", "Strong").
const LANGUAGES = [
  { language: "de", title: "Eingang" },
  { language: "en", title: "Inbox" },
] as const;

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const centreX = (box: { x: number; width: number } | null) => {
  if (!box) throw new Error("element not laid out");
  return box.x + box.width / 2;
};

/** Numerals and words of the scale, as laid out. */
function scaleLabels(page: Page): Promise<LabelBox[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".thr-scale .thr-num, .thr-scale .thr-word")).map(
      (element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      },
    ),
  );
}

// Two labels share a line when their boxes overlap vertically (baselines may differ by a pixel).
const sameLine = (a: LabelBox, b: LabelBox) => a.top < b.bottom && b.top < a.bottom;
const gapBetween = (a: LabelBox, b: LabelBox) => Math.max(b.left - a.right, a.left - b.right);

/** The smallest horizontal gap between any two labels on the same line (negative = overlap). */
function smallestGap(labels: readonly LabelBox[]): number {
  const gaps = labels.flatMap((label, index) =>
    labels
      .slice(index + 1)
      .filter((other) => sameLine(label, other))
      .map((other) => gapBetween(label, other)),
  );
  return Math.min(...gaps);
}

async function numeralOffset(page: Page, score: number): Promise<number> {
  const numeral = page.locator(".thr-scale").getByText(String(score), { exact: true });
  const tick = page.locator(`.thr-tick[data-score="${score}"]`);
  return centreX(await numeral.boundingBox()) - centreX(await tick.boundingBox());
}

for (const { language, title } of LANGUAGES) {
  for (const width of SCALE_WIDTHS) {
    test(`the scale labels keep apart and on their ticks in ${language} at ${width}px`, async ({
      page,
      mockApi,
    }) => {
      const settings = { body: { language, match_threshold: SAVED } };
      await mockApi(inboxRoutes({}, { ...LABEL_ROUTES, "GET /settings": settings }));
      await page.setViewportSize({ width, height: VIEWPORTS.mobile.height });
      await page.goto("/inbox?tab=unter");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator(".thr-tick")).toHaveCount(LABELLED_SCORES.length);
      expect(smallestGap(await scaleLabels(page))).toBeGreaterThanOrEqual(MIN_LABEL_GAP_PX);
      for (const score of LABELLED_SCORES) {
        expect(Math.abs(await numeralOffset(page, score))).toBeLessThanOrEqual(LABEL_TOLERANCE_PX);
      }
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
}
