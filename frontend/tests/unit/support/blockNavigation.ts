import { afterEach, beforeEach } from "vitest";

/**
 * jsdom cannot navigate and prints "Not implemented: navigation to another Document" when a test
 * clicks an anchor (posting link, blob download). A capturing listener cancels the default action
 * only; React handlers and the click itself still run.
 */
export function blockAnchorNavigation(): void {
  const cancel = (event: Event) => event.preventDefault();
  beforeEach(() => document.addEventListener("click", cancel, true));
  afterEach(() => document.removeEventListener("click", cancel, true));
}
