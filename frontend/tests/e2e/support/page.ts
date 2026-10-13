import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";

const SCREENSHOT_DIR = fileURLToPath(new URL("../__screenshots__/", import.meta.url));

/** Full-page PNG for the visual review against the prototype (not a pixel baseline). */
export async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SCREENSHOT_DIR}${name}.png`, fullPage: true });
}

/** Waits until no region inside <main> is loading (skeletons carry aria-busy), e.g. before a screenshot. */
export async function expectNothingLoading(page: Page): Promise<void> {
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/**
 * Pauses the page clock `offsetMs` after the page's current time. Relative to the install time
 * the pause could already lie in the past when loading took longer than the offset.
 */
export async function pauseClockSoon(page: Page, offsetMs: number): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + offsetMs);
}

/** Pixels the document is wider than the viewport; 0 means no horizontal scroll. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// Inside the panel's corner, clear of a centred dialog above it.
const CORNER_INSET_PX = 8;

/** True when the topmost element at the panel's bottom-right corner is a scrim (the panel is dimmed). */
export async function isDimmedByScrim(panel: Locator): Promise<boolean> {
  const box = await panel.boundingBox();
  if (!box) throw new Error("isDimmedByScrim: the panel is not rendered");
  const x = box.x + box.width - CORNER_INSET_PX;
  const y = box.y + box.height - CORNER_INSET_PX;
  return panel
    .page()
    .evaluate(
      ([px, py]) => document.elementFromPoint(px!, py!)?.classList.contains("scrim") ?? false,
      [x, y],
    );
}
