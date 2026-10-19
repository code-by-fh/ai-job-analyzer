export const E2E_PORT = 3101;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
// Must match NEXT_PUBLIC_API_URL in the "test:e2e" script of package.json.
export const MOCK_API_PREFIX = "/mock-api";
// The favicon service the server names in favicon_url (routers/platforms.py); answered locally.
export const FAVICON_SERVICE = "https://www.google.com/s2/favicons**";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  // Just below the inbox preview pane (WIDE_INBOX_QUERY, 1200 px): rows open the job page.
  medium: { width: 1100, height: 900 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 375, height: 812 },
} as const;

export const SCREENSHOT_SIZES = [
  ["1440", VIEWPORTS.desktop],
  ["390", VIEWPORTS.mobile],
] as const;

export const COLOR_SCHEMES = ["light", "dark"] as const;
