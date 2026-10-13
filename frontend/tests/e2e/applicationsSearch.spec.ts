import type { Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { ACTIVE_ITEMS, applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, MOCK_API_PREFIX, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const KOTLIN = ACTIVE_ITEMS.filter((item) => item.title?.includes("Kotlin"));
const KOTLIN_ACTIVE = `GET ${applicationsListPath({ group: "active", q: "Kotlin" }, 0)}`;
const SEARCHES = {
  Kotlin: { active: KOTLIN, closed: [] },
  Rust: { active: [], closed: [] },
  "100%": { active: [], closed: [] },
};

test.beforeEach(async ({ page }) => fixNow(page));

const field = (page: Page) => page.getByRole("searchbox", { name: "Bewerbungen durchsuchen" });
const section = (page: Page, name: string) => page.getByRole("region", { name });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`a search narrows the sections at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const log = await mockApi(applicationsRoutes({ searches: SEARCHES }));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await field(page).fill("Kotlin");
      await expect(page).toHaveURL(/\/applications\?q=Kotlin$/);
      await expect(section(page, "Vorgemerkt").getByRole("listitem")).toHaveCount(1);
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(1);
      await expect(section(page, "Interview")).toHaveCount(0);
      // The header describes all applications; the search narrows only the list.
      await expect(page.locator(".applications .mast-deck")).toHaveText("6 aktiv · 2 fällig");
      await expect(page.getByText("2 Bewerbungen gefunden")).toHaveClass("sr-only");
      expect(log.requests.filter((key) => key === KOTLIN_ACTIVE)).toHaveLength(1);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-search-${size}-${scheme}`);
    });

    test(`a search without hits at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(applicationsRoutes({ searches: SEARCHES }));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await field(page).fill("Rust");
      await expect(page.getByText("Keine Bewerbung passt zu „Rust“.")).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-search-none-${size}-${scheme}`);
    });
  }
}

test("a deep link restores the search", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications?q=Kotlin");
  await expect(field(page)).toHaveValue("Kotlin");
  await expect(page.getByRole("link", { name: "Kotlin Developer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Platform Engineer" })).toHaveCount(0);
});

test("a search without hits resets to everything and keeps focus in the field", async ({
  page,
  mockApi,
}) => {
  await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications");
  await field(page).fill("Rust");
  await expect(page.getByText("Keine Bewerbung passt zu „Rust“.")).toBeVisible();
  await page.getByRole("button", { name: "Suche zurücksetzen" }).click();
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue("");
  await expect(page).toHaveURL(/\/applications$/);
  await expect(section(page, "Interview")).toBeVisible();
});

test("wildcards are sent as typed", async ({ page, mockApi }) => {
  const log = await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications");
  await field(page).fill("100%");
  const key = `GET ${applicationsListPath({ group: "active", q: "100%" }, 0)}`;
  await expect.poll(() => log.requests).toContain(key);
});

/** Holds the Kotlin search answer until the returned release is called. */
async function holdKotlinSearch(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new URL(`http://app${applicationsListPath({ group: "active", q: "Kotlin" }, 0)}`);
  await page.route(`**${MOCK_API_PREFIX}${pending.pathname}${pending.search}`, async (route) => {
    await gate;
    await route.fallback();
  });
  return release;
}

const busyBar = (page: Page) =>
  page.locator(".apps-sections").evaluate((node) => {
    const bar = getComputedStyle(node, "::before");
    return { height: bar.height, animation: bar.animationName, size: bar.backgroundSize };
  });

for (const scheme of COLOR_SCHEMES) {
  test(`the kept rows show a busy bar while the next answer is pending in ${scheme} mode`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(applicationsRoutes({ searches: SEARCHES }));
    const release = await holdKotlinSearch(page);
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/applications");
    const row = page.locator(".arow").first();
    const background = () => row.evaluate((node) => getComputedStyle(node).backgroundColor);
    const resting = await background();
    await field(page).fill("Kotlin");
    await expect(page.locator(".apps-sections")).toHaveAttribute("aria-busy", "true");
    expect(await busyBar(page)).toEqual({
      height: "2px",
      animation: "apps-busy-slide",
      size: "30% 100%",
    });
    // The rows keep their resting background: a tint read as a hover.
    expect(await background()).toBe(resting);
    await saveScreenshot(page, `applications-search-busy-1440-${scheme}`);
    release();
    await expect(page.locator(".apps-sections")).not.toHaveAttribute("aria-busy", "true");
  });
}

test("the busy bar stands still when motion is reduced", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ searches: SEARCHES }));
  const release = await holdKotlinSearch(page);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/applications");
  await field(page).fill("Kotlin");
  await expect(page.locator(".apps-sections")).toHaveAttribute("aria-busy", "true");
  // A static partial segment at the left, so it never reads as a full-width divider.
  expect(await busyBar(page)).toEqual({ height: "2px", animation: "none", size: "30% 100%" });
  await saveScreenshot(page, "applications-search-busy-reduced-1440-light");
  release();
  await expect(page.locator(".apps-sections")).not.toHaveAttribute("aria-busy", "true");
});

// The bar sits in the gap below the strip; it must not touch the strip's boundary.
const MIN_BAR_GAP_PX = 4;

/** Pixels between the strip's bottom edge and the top of the busy bar. */
const barGap = (page: Page) =>
  page.locator(".apps-sections").evaluate((node) => {
    const strip = document.querySelector(".strip")!.getBoundingClientRect();
    const barTop =
      node.getBoundingClientRect().top + parseFloat(getComputedStyle(node, "::before").top);
    return barTop - strip.bottom;
  });

for (const scheme of COLOR_SCHEMES) {
  test(`the busy bar keeps clear of the strip at 390px in ${scheme} mode`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(applicationsRoutes({ searches: SEARCHES }));
    const release = await holdKotlinSearch(page);
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/applications");
    await field(page).fill("Kotlin");
    await expect(page.locator(".apps-sections")).toHaveAttribute("aria-busy", "true");
    expect(await barGap(page)).toBeGreaterThanOrEqual(MIN_BAR_GAP_PX);
    await saveScreenshot(page, `applications-search-busy-390-${scheme}`);
    release();
    await expect(page.locator(".apps-sections")).not.toHaveAttribute("aria-busy", "true");
  });
}

test.describe("the native clear glyph", () => {
  const GLYPH_INSET_PX = 17;
  const GLYPH_CLIP_PX = 36;
  // The palette ink is a warm grey; the browser's blue differs by about 80 between red and blue.
  const MAX_TINT_SPREAD = 20;

  /** The darkest pixel of the clip, whose channels tell the glyph's colour (computed styles of this pseudo are not reliable). */
  async function darkestPixel(page: Page): Promise<number[]> {
    const box = (await field(page).boundingBox())!;
    const clip = {
      x: box.x + box.width - GLYPH_CLIP_PX,
      y: box.y + 4,
      width: GLYPH_CLIP_PX - 4,
      height: box.height - 8,
    };
    const png = (await page.screenshot({ clip })).toString("base64");
    return page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let darkest = [255, 255, 255];
      for (let index = 0; index < pixels.length; index += 4) {
        const rgb = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!];
        if (rgb[0]! + rgb[1]! + rgb[2]! < darkest[0]! + darkest[1]! + darkest[2]!) darkest = rgb;
      }
      return darkest;
    }, png);
  }

  test("is grey from the palette, not the browser's blue", async ({ page, mockApi }) => {
    await mockApi(applicationsRoutes({ searches: SEARCHES }));
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/applications");
    await field(page).fill("Kotlin");
    await field(page).hover();
    const [red, green, blue] = await darkestPixel(page);
    expect(Math.max(red!, green!, blue!) - Math.min(red!, green!, blue!)).toBeLessThan(
      MAX_TINT_SPREAD,
    );
    expect(Math.max(red!, green!, blue!)).toBeLessThan(160);
  });

  test("still clears the field and drops q from the URL", async ({ page, mockApi }) => {
    await mockApi(applicationsRoutes({ searches: SEARCHES }));
    await page.goto("/applications");
    await field(page).fill("Kotlin");
    await expect(page).toHaveURL(/q=Kotlin/);
    const box = (await field(page).boundingBox())!;
    await page.mouse.click(box.x + box.width - GLYPH_INSET_PX, box.y + box.height / 2);
    await expect(field(page)).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/);
  });
});
