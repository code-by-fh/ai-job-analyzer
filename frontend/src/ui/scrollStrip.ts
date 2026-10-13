/**
 * Centre an item inside a horizontally scrolling strip by moving only the strip's own scrollLeft,
 * so the page never scrolls vertically (scrollIntoView would). No-op when the strip does not overflow.
 */
export function centerInStrip(strip: HTMLElement | null, item: Element | null | undefined): void {
  if (!strip || !item || strip.scrollWidth <= strip.clientWidth) return;
  const stripRect = strip.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const offset = itemRect.left + itemRect.width / 2 - (stripRect.left + stripRect.width / 2);
  strip.scrollLeft += offset;
}
