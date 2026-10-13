import { expect, test as base, type Page } from "@playwright/test";
import { mockApi, type ApiLog, type MockRoutes } from "./mockApi";

interface Fixtures {
  /** Installs the mock for the test's page; after the test every call must have had a fixture. */
  mockApi: (routes: MockRoutes) => Promise<ApiLog>;
  /** Spec 7: no console errors or uncaught exceptions in any journey; runs for every test. */
  consoleErrors: void;
}

interface Options {
  /** Opt-out for a test that deliberately calls routes without a fixture. */
  allowUnexpectedApiCalls: boolean;
  /** Narrow opt-in for console errors a test provokes on purpose (see EXPECTED_SESSION_PROBE). */
  allowedConsoleErrors: readonly RegExp[];
}

/**
 * The browser logs every 401 response as a console error. A test whose journey probes a missing
 * session (GET /me, POST /auth/refresh) on purpose allows exactly this line and nothing else.
 */
export const EXPECTED_SESSION_PROBE =
  /Failed to load resource: the server responded with a status of 401/;

/**
 * Chromium logs this for each of Playwright's own probes into the script-less sandboxed edit frame
 * (the exact text, once per probe); the page itself never runs a script there.
 */
export const SANDBOX_PROBE =
  /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export const test = base.extend<Fixtures & Options>({
  allowUnexpectedApiCalls: [false, { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  mockApi: [
    async ({ page, allowUnexpectedApiCalls }, use) => {
      const logs: ApiLog[] = [];
      await use(async (routes) => {
        const log = await mockApi(page, routes);
        logs.push(log);
        return log;
      });
      if (!allowUnexpectedApiCalls) {
        expect(logs.flatMap((log) => log.unexpected)).toEqual([]);
      }
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors = collectConsoleErrors(page);
      await use();
      const isAllowed = (text: string) =>
        allowedConsoleErrors.some((pattern) => pattern.test(text));
      expect(errors.filter((text) => !isAllowed(text))).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
