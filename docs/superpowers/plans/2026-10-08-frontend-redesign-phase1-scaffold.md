# Frontend Redesign Phase 1 (`web/` Scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new Next.js app in `web/` next to the old `frontend/`: tooling, Editorial theme tokens and self-hosted fonts, design-system primitives, typed DE/EN i18n, the API client, realtime, TanStack Query, the app shell, the login page, placeholder routes and the `ai-job-agent-web` compose service on port 3001.

**Architecture:** Thin App Router route files in `web/app/` render client features from `web/src/`. Server state lives only in TanStack Query; `src/api/client.ts` owns cookies, a single-flight refresh and error normalisation; `src/realtime/` owns the one WebSocket per tab and maps validated, user-filtered events onto the query cache. Visual primitives are a 1:1 port of the prototype's component CSS into `@layer components`; Tailwind v4 utilities resolve to the same tokens through `@theme inline`.

**Tech Stack:** Node 22.23, pnpm 10.34.6, Next.js 16.4.0 (App Router, `output: "standalone"`), React 19.3.0, TypeScript 5.9.3 (strict), Tailwind CSS 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, @fontsource 5.3.0, Vitest 5.0.3 + jsdom 30.1.2 + Testing Library, Playwright 1.64.0.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (sections 1, 2, 4.1, 5, 6, 7, 8 phase 1). Visual source of truth: `docs/prototype/clickdummy-editorial.html`. API facts: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.0, A.1, A.11, B.0, B.1), typed to the **new** shapes from spec section 3 (B3 top-level `user_id` on WebSocket events, B6 `GET /jobs` returns `{items, total}`, B9 `platforms.last_run`).

## Global Constraints

- **Placement:** new app in `web/`; `frontend/` stays untouched and working (spec 2.1).
- **Versions (exact pins, no `^`/`~`):** `next` 16.4.0, `react`/`react-dom` 19.3.0, `typescript` 5.9.3, `tailwindcss`/`@tailwindcss/postcss` 4.3.3, `@tanstack/react-query` 5.104.1, `zod` 4.6.5, `lucide-react` 1.53.0, `@fontsource-variable/bricolage-grotesque`/`@fontsource/hanken-grotesk`/`@fontsource/source-serif-4` 5.3.0, `vitest` 5.0.3, `vite` 8.3.3, `@vitejs/plugin-react` 6.1.2, `jsdom` 30.1.2, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1, `@testing-library/user-event` 14.6.7, `@playwright/test` 1.64.0 (matches the installed Chromium headless shell 1248), `eslint` 9.39.5, `eslint-config-next` 16.4.0, `prettier` 3.9.9, `@types/node` 22.20.5, `@types/react`/`@types/react-dom` 19.3.0. All verified on a private registry on 2026-10-08.
- **Package manager:** "pnpm 10, pinned via `packageManager` in `package.json`, with `pnpm-lock.yaml` committed" -> `"packageManager": "pnpm@10.34.6"`. No `package-lock.json`, no `.npmrc` (spec 2.4: the registry is set through the environment).
- **Node:** 22 (`>=22.12.0`). Node 20 is end-of-life and Vitest 5 / jsdom 30 require Node 22. Locally use `~/.local/opt/node22`; Docker uses `node:22-alpine`.
- **Ports:** "dev port 3001. Compose service `ai-job-agent-web` (port 3001). `ALLOWED_ORIGINS` gets `http://localhost:3001` added."
- **Coding standards:** functions of 20 lines or less (lint-enforced with `max-lines-per-function`), at most 3 parameters (`max-params`), named exports except where Next.js route files require a default export, named constants instead of magic literals, comments explain *why* and are in English, no emoji anywhere, TypeScript strict.
- **Boundaries are validated:** environment (`NEXT_PUBLIC_API_URL`), every REST response and every WebSocket message pass a zod schema. The client "filters by the current user and job ids it knows".
- **No hard-coded UI strings:** "all text goes through typed DE/EN dictionaries, and a missing key fails the type check."
- **Server state:** "TanStack Query ... is the only state library. UI state lives in components or in the URL query."
- **Icons:** "`lucide-react` at stroke 1.75. No other UI kit."
- **Fonts:** "self-hosted woff2 via `next/font/local` from `@fontsource` files: Bricolage Grotesque (variable), Hanken Grotesk, Source Serif 4 (documents only)."
- **Visual hard rules (spec 5):** "no gradients, glassmorphism, indigo or purple, emoji, sparkle icons, rainbow icons or pulsing dots; one pulsing indicator is allowed, for a running crawl; vermilion is reserved for the next move, the active nav item, strong scores and primary buttons; errors use crimson, always with an icon and words."
- **Toasts (spec 4.1):** "an ink pill, at most 2 stacked, paused on hover or focus. Toasts with an action stay at least 10 s."
- **apiFetch (spec 6):** "401: a single-flight refresh, then one retry; a failed refresh sends the user to `/login?next=`." Normalise `{detail: string}`, `{detail: [...]}` (per-field), `{error}` with 429 ("zu viele Anfragen, bitte kurz warten") and the scraper's `200 + {status:"error"}` into one `ApiError {status, code, message, fields?}`. Messages "never show raw server internals".
- **Realtime (spec 6):** "drops events whose `user_id` is not the current user's and events for unknown job ids, reconnects with exponential backoff (max 30 s) and refetches the active queries after a reconnect."
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. Task 1 creates `$QA/webrun.sh`, which sources `$QA/env.sh` (private registry, Playwright browser path, `LD_LIBRARY_PATH`, fonts), puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a command:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/config.test.ts`
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror). If formatting pushes a function above 20 lines, split it into a named helper; never disable the rule.
- **Checkpoint:** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'` -> all four exit 0.
- **Lockfile:** after any `pnpm install`/`pnpm add`, run `cp "$QA"/web/pnpm-lock.yaml "$REPO"/web/pnpm-lock.yaml`.
- If `next build` reports that it changed `tsconfig.json`, copy the change back into `$REPO/web/tsconfig.json`.

## Review Focus

1. **Typing `/` inside a form field** (search box, login, later the notes editor) must type a slash; only `/` pressed outside editable elements opens global search. Test: Task 10, `GlobalSearch` "does not open while typing in a field".
2. **`?next=` pointing off-site** (`//evil.example`, `https://evil.example`, `/\evil.example`, `/login?...`) must land on `/inbox` after login, never on another origin. Tests: Task 4 `safeNextPath`, Task 12 e2e "ignores an off-site next parameter".
3. **Access token expires while the WebSocket is open** (server closes with 1008): refresh once and reconnect with backoff; if the refresh fails, go to `/login` and stop reconnecting; a network error during refresh must not log the user out. Tests: Task 4 "keeps the session when the refresh endpoint is unreachable", Task 6 "1008" connection tests.
4. **5xx or malformed responses** (`{"detail":"Internal server error"}`, plain-text 502, a body that fails the schema) must show a generic German sentence, never the server text. Tests: Task 4 `describeError` and client "BAD_RESPONSE".
5. **Theme preference "system" while the OS switches dark/light at runtime, and a stored "dark" preference on first paint** must follow the OS live and never flash light. Tests: Task 2 `useApplyThemeMode` "follows an OS switch", Task 12 e2e "applies a stored dark theme before first paint".

---

## File Map

Repository root (modified): `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `context/progress-tracker.md`, `context/ui-context.md`, `context/architecture.md`.

QA helper (scratch, not in the repo): `$QA/webrun.sh`.

`web/` (all new):

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `.env.development`, `.env.production` | Tooling and build configuration |
| `Dockerfile`, `Dockerfile.dev`, `.dockerignore`, `env.sh`, `README.md` | Container build, runtime API URL injection, docs |
| `app/layout.tsx`, `app/providers.tsx`, `app/globals.css`, `app/icon.svg`, `app/page.tsx`, `app/not-found.tsx` | Root document, provider composition, CSS entry, favicon, `/` -> `/inbox`, 404 |
| `app/login/page.tsx` | Login route |
| `app/(app)/layout.tsx` and `app/(app)/{inbox,applications,jobs/[id],sources,companies,profile,settings}/page.tsx` | Authenticated shell and placeholder pages |
| `src/config.ts` | Validated API base URL and derived WebSocket URL |
| `src/lib/preferenceStore.ts` | localStorage-backed preference store for `useSyncExternalStore` |
| `src/theme/tokens.css`, `base.css`, `fonts.ts`, `theme.ts`, `themeScript.ts`, `useTheme.ts`, `ThemeProvider.tsx` | Tokens from the prototype, base styles, fonts, light/dark/system logic, no-flash boot script |
| `src/i18n/languages.ts`, `format.ts`, `de.ts`, `en.ts`, `translate.ts`, `formatTime.ts`, `useI18n.ts`, `LanguageProvider.tsx` | Typed dictionaries, interpolation, language store, `<html lang>` sync |
| `src/api/errors.ts`, `client.ts`, `session.ts`, `describeError.ts` | `ApiError`, normaliser, `createApiClient`, login redirect helpers, user-facing error text |
| `src/api/instance.ts`, `queryKeys.ts`, `queryClient.ts`, `QueryProvider.tsx`, `auth.ts`, `settings.ts`, `jobs.ts`, `platforms.ts`, `crawl.ts` | App client instance, query setup, one module per resource |
| `src/domain/scoreBand.ts` | Score band (pure) |
| `src/realtime/events.ts`, `filter.ts`, `backoff.ts`, `connection.ts`, `activity.ts`, `knownJobs.ts`, `applyEvent.ts`, `handleMessage.ts`, `openRealtime.ts`, `useActivity.ts` | Event schemas, user/job filter, reconnect, background-activity state, cache mapping |
| `src/ui/*.tsx`, `src/ui/toast.ts`, `src/ui/cx.ts`, `src/ui/styles/{controls,layout,overlay}.css` | Design-system primitives |
| `src/features/shell/*` | Sidebar, bottom bar, activity label, user menu, global search, realtime provider, nav counts |
| `src/features/auth/*` | Login screen and form |
| `src/features/placeholder/*` | Placeholder page and 404 view |
| `tests/unit/**` | Vitest unit tests and test support |
| `tests/e2e/**` | Playwright smoke tests with mocked API; screenshots in `tests/e2e/__screenshots__/` |

**Screenshots decision:** `web/tests/e2e/__screenshots__/` is **gitignored**. The PNGs are review artifacts that a reviewer compares against the prototype by eye (spec 7), not pixel baselines; committing generated output violates the versioning standard. Because `websync.sh` deletes and re-copies `tests/` in the mirror, Task 12 copies them back to `$REPO/web/tests/e2e/__screenshots__/` after each run.

---

### Task 1: Tooling scaffold and validated config

**Files:**
- Create: `$QA/webrun.sh` (scratch helper, not in the repo)
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/eslint.config.mjs`, `web/.prettierrc.json`, `web/.prettierignore`, `web/postcss.config.mjs`, `web/vitest.config.ts`, `web/.gitignore`, `web/.env.development`, `web/.env.production`
- Create: `web/app/layout.tsx` (minimal, replaced in Tasks 2 and 3), `web/app/page.tsx`
- Create: `web/src/config.ts`
- Test: `web/tests/unit/setup.ts`, `web/tests/unit/config.test.ts`
- Generated: `web/pnpm-lock.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: `RUNTIME_API_URL_PLACEHOLDER: "APP_API_URL"`, `parseApiBaseUrl(raw: string | undefined): string`, `toWebSocketUrl(apiBaseUrl: string): string`, `API_BASE_URL: string`, `WS_URL: string` (all from `@/config`). Path alias `@/*` -> `web/src/*`. Scripts `dev`, `build`, `start`, `lint`, `format`, `typecheck`, `test`, `test:e2e`.

- [ ] **Step 1: Create the QA runner**

Create `$QA/webrun.sh` and make it executable (`chmod +x "$QA"/webrun.sh`):

```bash
#!/usr/bin/env bash
# Runs a command in the $QA/web mirror of $REPO/web with Node 22 and pnpm 10 first on PATH.
# The repo lives on a drvfs mount where node_modules cannot be installed, hence the mirror.
set -euo pipefail
QA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$QA_DIR/env.sh"
export PATH="$QA/npm-global/bin:$HOME/.local/opt/node22/bin:$PATH"
"$QA/websync.sh"
cd "$QA/web"
exec "$@"
```

Run: `"$QA"/webrun.sh sh -c 'node --version && pnpm --version'` (after Step 2 created `web/`)
Expected: `v22.23.2` and `10.34.6`.

- [ ] **Step 2: Write the tooling files**

`web/package.json`:

```json
{
  "name": "ai-job-agent-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.34.6",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "eslint . --max-warnings=0 && prettier --check .",
    "format": "prettier --write .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "NEXT_PUBLIC_API_URL=http://localhost:3101/mock-api next build && playwright test"
  },
  "dependencies": {
    "@fontsource-variable/bricolage-grotesque": "5.3.0",
    "@fontsource/hanken-grotesk": "5.3.0",
    "@fontsource/source-serif-4": "5.3.0",
    "@tanstack/react-query": "5.104.1",
    "lucide-react": "1.53.0",
    "next": "16.4.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@playwright/test": "1.64.0",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/dom": "10.4.2",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/node": "22.20.5",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.2",
    "eslint": "9.39.5",
    "eslint-config-next": "16.4.0",
    "jsdom": "30.1.2",
    "prettier": "3.9.9",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vite": "8.3.3",
    "vitest": "5.0.3"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the self-contained server from .next/standalone.
  output: "standalone",
};

export default nextConfig;
```

`web/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Coding standards: functions of at most 20 lines and 3 parameters.
const MAX_FUNCTION_LINES = 20;
const MAX_PARAMS = 3;

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", MAX_PARAMS],
      "import/no-default-export": "error",
      "no-console": "error",
    },
  },
  {
    // Next.js resolves route files by their default export.
    files: ["app/**/{page,layout,not-found}.tsx"],
    rules: { "import/no-default-export": "off" },
  },
  globalIgnores([".next/**", "next-env.d.ts", "test-results/**", "playwright-report/**"]),
]);
```

`web/.prettierrc.json`:

```json
{
  "printWidth": 100
}
```

`web/.prettierignore`:

```
.next
node_modules
pnpm-lock.yaml
test-results
playwright-report
tests/e2e/__screenshots__
next-env.d.ts
```

`web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

`web/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    // src/config.ts validates this at import time, exactly like the browser bundle does.
    env: { NEXT_PUBLIC_API_URL: "http://api.test" },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
```

`web/.gitignore`:

```
/node_modules
/.next/
/out/
/coverage
/test-results/
/playwright-report/
/tests/e2e/__screenshots__/
next-env.d.ts
*.tsbuildinfo
.env*
!.env.development
!.env.production
```

`web/.env.development` (no secrets; overridden by an exported `NEXT_PUBLIC_API_URL`):

```
# API published by docker-compose (ai-job-agent-server, host port 8002).
NEXT_PUBLIC_API_URL=http://localhost:8002
```

`web/.env.production`:

```
# Placeholder baked into production builds; env.sh replaces it with APP_API_URL at container start.
NEXT_PUBLIC_API_URL=APP_API_URL
```

`web/app/layout.tsx` (minimal; Task 2 replaces it):

```tsx
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx` (Task 4 Step 6 swaps the literal for the shared `DEFAULT_AFTER_LOGIN_PATH` constant):

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/inbox");
}
```

- [ ] **Step 3: Install and copy the lockfile back**

Run: `"$QA"/webrun.sh pnpm install && cp "$QA"/web/pnpm-lock.yaml "$REPO"/web/pnpm-lock.yaml`
Expected: `Done in ...s using pnpm v10.34.6`; warnings about ignored build scripts (sharp, unrs-resolver) are fine.

- [ ] **Step 4: Write the failing config test**

`web/tests/unit/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

`web/tests/unit/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseApiBaseUrl, RUNTIME_API_URL_PLACEHOLDER, toWebSocketUrl } from "@/config";

describe("parseApiBaseUrl", () => {
  it("strips trailing slashes from an http URL", () => {
    expect(parseApiBaseUrl("http://localhost:8002/")).toBe("http://localhost:8002");
  });

  it("accepts the Docker runtime placeholder", () => {
    expect(parseApiBaseUrl(RUNTIME_API_URL_PLACEHOLDER)).toBe("APP_API_URL");
  });

  it("rejects a missing value", () => {
    expect(() => parseApiBaseUrl(undefined)).toThrow(ZodError);
  });

  it("rejects a non-http protocol", () => {
    expect(() => parseApiBaseUrl("ftp://files.example.com")).toThrow(ZodError);
  });
});

describe("toWebSocketUrl", () => {
  it("maps http to ws and appends /ws", () => {
    expect(toWebSocketUrl("http://localhost:8002")).toBe("ws://localhost:8002/ws");
  });

  it("maps https to wss", () => {
    expect(toWebSocketUrl("https://api.example.com")).toBe("wss://api.example.com/ws");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/config.test.ts`
Expected: FAIL with `Failed to resolve import "@/config"`.

- [ ] **Step 6: Implement `src/config.ts`**

```ts
import { z } from "zod";

/**
 * Literal baked into production builds (.env.production). env.sh swaps it for APP_API_URL when the
 * container starts, so one image serves any API host. env.sh also rewrites this constant in the
 * bundle, which is harmless: the union below then accepts the real URL twice.
 */
export const RUNTIME_API_URL_PLACEHOLDER = "APP_API_URL";

const TRAILING_SLASHES = /\/+$/;
const HTTP_SCHEME = /^http/;

const apiBaseUrlSchema = z.union([
  z.url({ protocol: /^https?$/ }),
  z.literal(RUNTIME_API_URL_PLACEHOLDER),
]);

/**
 * Validates the REST base URL and strips trailing slashes.
 * @throws ZodError when the value is missing or not an http(s) URL.
 */
export function parseApiBaseUrl(raw: string | undefined): string {
  return apiBaseUrlSchema.parse(raw).replace(TRAILING_SLASHES, "");
}

/** Derives the WebSocket endpoint from the REST base: http -> ws, https -> wss. */
export function toWebSocketUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(HTTP_SCHEME, "ws")}/ws`;
}

// Next inlines NEXT_PUBLIC_* only for direct property access, so no destructuring here.
export const API_BASE_URL = parseApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
export const WS_URL = toWebSocketUrl(API_BASE_URL);
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/config.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green; `next build` lists `/` and `/_not-found`, and `.next/standalone/server.js` exists (`"$QA"/webrun.sh test -f .next/standalone/server.js`).

### Task 2: Theme tokens, fonts, base styles and the theme switch

**Files:**
- Create: `web/src/theme/tokens.css`, `web/src/theme/base.css`, `web/src/theme/fonts.ts`, `web/src/theme/theme.ts`, `web/src/theme/themeScript.ts`, `web/src/theme/useTheme.ts`, `web/src/theme/ThemeProvider.tsx`, `web/src/lib/preferenceStore.ts`
- Create: `web/app/globals.css`, `web/app/providers.tsx`, `web/app/icon.svg`
- Modify: `web/app/layout.tsx` (full replacement)
- Modify: `web/tests/unit/setup.ts` (reset the theme store)
- Test: `web/tests/unit/lib/preferenceStore.test.ts`, `web/tests/unit/theme/theme.test.ts`, `web/tests/unit/theme/useTheme.test.tsx`, `web/tests/unit/support/fakeMatchMedia.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createPreferenceStore<T extends string>(options: { key: string; isValid: (value: string) => value is T; fallback: () => T }): PreferenceStore<T>` with `get(): T`, `set(value: T): void`, `subscribe(listener: () => void): () => void` (`@/lib/preferenceStore`).
  - `ThemePreference = "light" | "dark" | "system"`, `ThemeMode = "light" | "dark"`, `THEME_PREFERENCES`, `THEME_STORAGE_KEY = "ajp-theme"`, `DARK_SCHEME_QUERY`, `isThemePreference`, `resolveMode(preference, systemPrefersDark): ThemeMode`, `nextPreference(current): ThemePreference`, `applyMode(root: HTMLElement, mode: ThemeMode): void` (`@/theme/theme`).
  - `themeStore`, `useTheme(): { preference: ThemePreference; setPreference(value): void; cycle(): void }`, `useApplyThemeMode(preference): void` (`@/theme/useTheme`).
  - `ThemeProvider` (`@/theme/ThemeProvider`), `THEME_BOOT_SCRIPT` (`@/theme/themeScript`), `FONT_VARIABLE_CLASSES` (`@/theme/fonts`).
  - `Providers` (`app/providers.tsx`), later tasks wrap more providers inside it.
  - CSS: every prototype token (`--bg`, `--text`, `--accent`, `--st-*`, `--sb-*`, `--inv-*`, `--fs-*`, `--r-*`, `--rule-w`, ...); Tailwind utilities `bg-surface`, `text-accent`, `text-ink`, `text-muted`, `text-faint`, `border-line`, `rounded-ctl`, `text-13`, ...; base classes `.num .muted .faint .small .display .code hr.div`; keyframes `spin rise fade slide-in`.

**Decision (fonts):** `next/font/local` pointing straight at the woff2 files inside the pinned `@fontsource` packages (`../../node_modules/@fontsource.../files/*.woff2`). Next copies them to `.next/static/media` with hashed names, preloads the UI and display faces and exposes CSS variables (`--font-hanken`, `--font-bricolage`, `--font-source-serif`) that `tokens.css` puts at the front of the prototype's font stacks. Verified with Next 16.4.0 + Turbopack + Tailwind 4.3.3 on 2026-10-08 (build emits the files, utilities resolve). No font binaries in git; the versions live in `pnpm-lock.yaml`. Bricolage uses the `opsz` file, which carries both the `opsz` and `wght 200-800` axes like the prototype.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/support/fakeMatchMedia.ts`:

```ts
import { vi } from "vitest";

export interface FakeMediaQuery {
  setMatches: (matches: boolean) => void;
}

/** jsdom has no matchMedia; this stands in for the browser's prefers-color-scheme query. */
export function installFakeMatchMedia(initialMatches: boolean): FakeMediaQuery {
  const listeners = new Set<() => void>();
  let matches = initialMatches;
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => mediaQueryList);
  return {
    setMatches: (next) => {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}
```

`web/tests/unit/lib/preferenceStore.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPreferenceStore } from "@/lib/preferenceStore";

const COLORS = ["red", "blue"] as const;
type Color = (typeof COLORS)[number];
const STORAGE_KEY = "test-color";
const isColor = (value: string): value is Color => (COLORS as readonly string[]).includes(value);

function createColorStore() {
  return createPreferenceStore<Color>({ key: STORAGE_KEY, isValid: isColor, fallback: () => "red" });
}

describe("createPreferenceStore", () => {
  it("returns the fallback when nothing is stored", () => {
    expect(createColorStore().get()).toBe("red");
  });

  it("returns a valid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "blue");
    expect(createColorStore().get()).toBe("blue");
  });

  it("ignores an invalid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "green");
    expect(createColorStore().get()).toBe("red");
  });

  it("persists a new value and notifies subscribers", () => {
    const store = createColorStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set("blue");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("blue");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createColorStore();
    const listener = vi.fn();
    store.subscribe(listener)();
    store.set("blue");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the choice for this tab when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    const store = createColorStore();
    store.set("blue");
    expect(store.get()).toBe("blue");
  });
});
```

`web/tests/unit/theme/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyMode, isThemePreference, nextPreference, resolveMode } from "@/theme/theme";

describe("theme", () => {
  it("recognises the three preferences only", () => {
    expect(["light", "dark", "system"].every(isThemePreference)).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });

  it("resolves system to the OS scheme", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });

  it("keeps an explicit preference regardless of the OS", () => {
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });

  it("cycles light, dark, system like the prototype", () => {
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
    expect(nextPreference("system")).toBe("light");
  });

  it("writes the mode to data-mode", () => {
    applyMode(document.documentElement, "dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
  });
});
```

`web/tests/unit/theme/useTheme.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/theme/theme";
import { useApplyThemeMode, useTheme } from "@/theme/useTheme";
import { installFakeMatchMedia } from "../support/fakeMatchMedia";

describe("useApplyThemeMode", () => {
  it("uses the OS scheme for the system preference", () => {
    installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("system"));
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("follows an OS switch at runtime while the preference is system", () => {
    const media = installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("system"));
    act(() => media.setMatches(false));
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("ignores the OS scheme for an explicit preference", () => {
    installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("light"));
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});

describe("useTheme", () => {
  it("cycles and persists the preference", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.cycle());
    expect(result.current.preference).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
```

Add the store reset to `web/tests/unit/setup.ts` (full file):

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { themeStore } from "@/theme/useTheme";

// Stores cache their value per module; reset them so every test starts from the defaults.
beforeEach(() => {
  themeStore.set("system");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib tests/unit/theme`
Expected: FAIL with `Failed to resolve import "@/lib/preferenceStore"` (and `@/theme/...`).

- [ ] **Step 3: Implement the store and theme logic**

`web/src/lib/preferenceStore.ts`:

```ts
type Listener = () => void;

export interface PreferenceStoreOptions<T extends string> {
  key: string;
  isValid: (value: string) => value is T;
  fallback: () => T;
}

/** A tiny external store for useSyncExternalStore, persisted in localStorage when available. */
export interface PreferenceStore<T extends string> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createPreferenceStore<T extends string>(
  options: PreferenceStoreOptions<T>,
): PreferenceStore<T> {
  const listeners = new Set<Listener>();
  let current: T | null = null;
  const get = (): T => (current ??= readStored(options) ?? options.fallback());
  const set = (value: T): void => {
    current = value;
    writeStored(options.key, value);
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return { get, set, subscribe };
}

function readStored<T extends string>(options: PreferenceStoreOptions<T>): T | null {
  try {
    const raw = window.localStorage.getItem(options.key);
    return raw !== null && options.isValid(raw) ? raw : null;
  } catch {
    // Storage blocked (private mode, sandboxed preview): fall back to the default.
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the in-memory value still applies for this tab.
  }
}
```

`web/src/theme/theme.ts`:

```ts
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "ajp-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: string): value is ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveMode(preference: ThemePreference, systemPrefersDark: boolean): ThemeMode {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Order of the sidebar's cycle button, as in the prototype: light, dark, system. */
export function nextPreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

/** tokens.css switches every colour on :root[data-mode="dark"]. */
export function applyMode(root: HTMLElement, mode: ThemeMode): void {
  root.dataset.mode = mode;
}
```

`web/src/theme/themeScript.ts`:

```ts
import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from "./theme";

const STORAGE_KEY_LITERAL = JSON.stringify(THEME_STORAGE_KEY);
const QUERY_LITERAL = JSON.stringify(DARK_SCHEME_QUERY);

/**
 * Inline <head> script that sets data-mode before first paint, so a stored dark preference never
 * flashes light. It mirrors resolveMode() because it must run before any bundle is loaded.
 */
export const THEME_BOOT_SCRIPT = `(function(){var p=null;try{p=localStorage.getItem(${STORAGE_KEY_LITERAL})}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia(${QUERY_LITERAL}).matches);document.documentElement.dataset.mode=d?"dark":"light"})()`;
```

`web/src/theme/useTheme.ts`:

```ts
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPreferenceStore } from "@/lib/preferenceStore";
import {
  applyMode,
  DARK_SCHEME_QUERY,
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  nextPreference,
  resolveMode,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

export const themeStore = createPreferenceStore<ThemePreference>({
  key: THEME_STORAGE_KEY,
  isValid: isThemePreference,
  fallback: () => DEFAULT_THEME_PREFERENCE,
});

const serverPreference = (): ThemePreference => DEFAULT_THEME_PREFERENCE;

export interface ThemeControls {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  cycle: () => void;
}

export function useTheme(): ThemeControls {
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.get, serverPreference);
  return {
    preference,
    setPreference: themeStore.set,
    cycle: () => themeStore.set(nextPreference(preference)),
  };
}

/** Applies the resolved mode and keeps following the OS while the preference is "system". */
export function useApplyThemeMode(preference: ThemePreference): void {
  useEffect(() => {
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    const apply = () => applyMode(document.documentElement, resolveMode(preference, media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
}
```

`web/src/theme/ThemeProvider.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useApplyThemeMode, useTheme } from "./useTheme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preference } = useTheme();
  useApplyThemeMode(preference);
  return children;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib tests/unit/theme`
Expected: PASS, 15 tests.

- [ ] **Step 5: Port the tokens and base styles**

`web/src/theme/tokens.css` (values copied verbatim from the prototype's `:root` and `:root[data-mode="dark"]`; only the three font stacks gain the `next/font` variables in front):

```css
/*
  Editorial design tokens, copied from docs/prototype/clickdummy-editorial.html.
  Paper and ink plus one vermilion signal colour; errors use crimson (hue 10).
  Contrast (WCAG 2, computed in the prototype): light text 16.9:1, text-3 >= 4.76:1,
  accent text 5.4:1, white on vermilion 4.8:1; dark text 16.6:1, text-3 >= 5.1:1.
*/
:root {
  --font-ui:
    var(--font-hanken), "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    "Helvetica Neue", Arial, sans-serif;
  --font-display: var(--font-bricolage), var(--font-hanken), ui-sans-serif, system-ui, sans-serif;
  --font-serif:
    var(--font-source-serif), "Iowan Old Style", "Charter", "Sitka Text", Cambria, Georgia, serif;
  --font-code: ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace;

  --fs-12: 12px; --fs-13: 13px; --fs-14: 14px; --fs-16: 16px; --fs-20: 20px;
  --fs-body: 14.5px; --fs-list: 14px;

  --r-ctl: 3px; --r-panel: 4px; --r-pill: 999px;
  --ctl-h: 34px; --ctl-h-sm: 28px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  --page-pad: 48px; --sidebar-w: 252px; --list-w: 420px;
  --rule-w: 4px;

  --ease: cubic-bezier(.2,.7,.3,1); --t-fast: 120ms; --t-mid: 200ms;

  /* light: paper and ink */
  --bg: oklch(0.977 0.004 80);
  --surface: oklch(0.995 0.002 80);
  --sunken: oklch(0.95 0.006 75);
  --raised: oklch(0.962 0.006 75);
  --float: oklch(0.995 0.002 80);
  --hover: oklch(0.945 0.007 75);
  --selected: oklch(0.935 0.009 70);
  --field: oklch(0.995 0.002 80);
  --line: oklch(0.885 0.006 70);
  --line-strong: oklch(0.79 0.008 70);
  --rule: oklch(0.2 0.008 60);
  --text: oklch(0.2 0.008 60);
  --text-2: oklch(0.42 0.01 60);
  --text-3: oklch(0.51 0.012 60);
  --accent: oklch(0.575 0.205 33);
  --accent-hover: oklch(0.52 0.2 33);
  --accent-soft: oklch(0.95 0.03 40);
  --accent-text: oklch(0.53 0.19 33);
  --on-accent: oklch(0.995 0.002 80);
  --focus: oklch(0.575 0.205 33);
  --danger: oklch(0.5 0.18 10);
  --danger-soft: oklch(0.955 0.025 15);
  --warn: oklch(0.74 0.14 70);
  --warn-text: oklch(0.48 0.1 65);
  --warn-soft: oklch(0.955 0.04 85);
  --ok: oklch(0.5 0.11 150);
  --scrim: oklch(0.2 0.008 60 / 0.35);
  --shadow-float: 0 1px 0 oklch(0.2 0.008 60 / 0.06), 0 14px 34px -10px oklch(0.2 0.008 60 / 0.28);
  /* stages: a refined secondary set that never competes with the signal */
  --st-open: oklch(0.7 0.01 70);
  --st-drafted: oklch(0.72 0.11 85);
  --st-applied: oklch(0.56 0.09 245);
  --st-interview: oklch(0.58 0.08 190);
  --st-offer: oklch(0.56 0.11 150);
  --st-closed: oklch(0.76 0.008 70);
  /* printed proof */
  --paper: oklch(0.995 0.002 85);
  --paper-ink: oklch(0.2 0.008 60);
  --paper-muted: oklch(0.48 0.01 60);
  --paper-rule: oklch(0.86 0.006 70);
  --desk: oklch(0.925 0.008 72);
  --mark: oklch(0.42 0.01 60);
  /* sidebar, bottom bar: always ink */
  --sb-bg: oklch(0.2 0.008 60);
  --sb-raised: oklch(0.255 0.009 60);
  --sb-text: oklch(0.96 0.006 80);
  --sb-text-2: oklch(0.76 0.008 70);
  --sb-text-3: oklch(0.66 0.008 70);
  --sb-line: oklch(0.34 0.01 60);
  --sb-accent: oklch(0.68 0.19 36);
  /* inverse surface for toasts */
  --inv-bg: oklch(0.2 0.008 60);
  --inv-hover: oklch(0.29 0.009 60);
  --inv-line: oklch(0.4 0.01 60);
  --inv-text: oklch(0.96 0.006 80);
  --inv-text-2: oklch(0.8 0.008 70);
  --inv-text-3: oklch(0.68 0.008 70);
  --inv-accent: oklch(0.74 0.16 38);
  color-scheme: light;
}
:root[data-mode="dark"] {
  --bg: oklch(0.165 0.004 60);
  --surface: oklch(0.205 0.005 60);
  --sunken: oklch(0.145 0.004 60);
  --raised: oklch(0.215 0.006 60);
  --float: oklch(0.235 0.007 60);
  --hover: oklch(0.24 0.007 60);
  --selected: oklch(0.25 0.008 60);
  --field: oklch(0.185 0.005 60);
  --line: oklch(0.3 0.008 60);
  --line-strong: oklch(0.4 0.01 60);
  --rule: oklch(0.95 0.006 80);
  --text: oklch(0.95 0.006 80);
  --text-2: oklch(0.78 0.008 70);
  --text-3: oklch(0.66 0.008 70);
  --accent: oklch(0.68 0.19 36);
  --accent-hover: oklch(0.74 0.17 38);
  --accent-soft: oklch(0.27 0.05 35);
  --accent-text: oklch(0.74 0.16 38);
  --on-accent: oklch(0.17 0.004 60);
  --focus: oklch(0.74 0.16 38);
  --danger: oklch(0.72 0.15 15);
  --danger-soft: oklch(0.26 0.05 15);
  --warn: oklch(0.78 0.12 80);
  --warn-text: oklch(0.83 0.11 80);
  --warn-soft: oklch(0.27 0.04 75);
  --ok: oklch(0.74 0.11 150);
  --scrim: oklch(0.05 0 0 / 0.6);
  --shadow-float: 0 1px 0 oklch(0 0 0 / 0.3), 0 16px 40px -10px oklch(0 0 0 / 0.6);
  --st-open: oklch(0.6 0.01 70);
  --st-drafted: oklch(0.78 0.11 85);
  --st-applied: oklch(0.7 0.09 245);
  --st-interview: oklch(0.72 0.08 190);
  --st-offer: oklch(0.72 0.11 150);
  --st-closed: oklch(0.5 0.008 70);
  --desk: oklch(0.13 0.004 60);
  --mark: oklch(0.66 0.008 70);
  --sb-bg: oklch(0.125 0.004 60);
  --sb-raised: oklch(0.2 0.006 60);
  --sb-line: oklch(0.28 0.008 60);
  --sb-text-3: oklch(0.62 0.008 70);
  --inv-bg: oklch(0.93 0.006 80);
  --inv-hover: oklch(0.87 0.008 75);
  --inv-line: oklch(0.75 0.01 70);
  --inv-text: oklch(0.2 0.008 60);
  --inv-text-2: oklch(0.38 0.01 60);
  --inv-text-3: oklch(0.45 0.01 60);
  --inv-accent: oklch(0.5 0.19 33);
  color-scheme: dark;
}

@media (max-width: 1100px) {
  :root { --page-pad: 32px; }
}
@media (max-width: 767px) {
  :root { --page-pad: 16px; --rule-w: 3px; }
}
```

`web/src/theme/base.css`:

```css
/* Base element styles and helpers ported from the prototype's "base" section. */
@layer base {
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 400 var(--fs-body)/1.5 var(--font-ui);
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  h1, h2, h3, h4, p { margin: 0; }
  button, input, select, textarea { font: inherit; color: inherit; }
  a { color: var(--accent-text); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: color-mix(in oklch, currentColor 35%, transparent); }
  a:hover { text-decoration-color: currentColor; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 2px; }
  ::selection { background: var(--accent); color: var(--on-accent); }
}

@layer components {
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: var(--text-2); }
  .faint { color: var(--text-3); }
  .small { font-size: var(--fs-12); }
  .code { font-family: var(--font-code); font-size: 12.5px; }
  .display { font-family: var(--font-display); font-optical-sizing: auto; }
  hr.div { border: 0; border-top: 1px solid var(--line); margin: var(--s5) 0; }
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slide-in { from { transform: translateX(32px); opacity: 0; } }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(6px); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  .spin { animation: none !important; }
}
```

`web/app/globals.css` (later tasks add `@import` lines directly below the last one):

```css
@import "tailwindcss";
@import "../src/theme/tokens.css";
@import "../src/theme/base.css";

/*
  Expose the Editorial tokens to Tailwind utilities (bg-surface, text-accent, text-muted, ...).
  The default palette is removed so off-system colours such as indigo cannot slip in (spec 5).
*/
@theme inline {
  --color-*: initial;
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-sunken: var(--sunken);
  --color-raised: var(--raised);
  --color-float: var(--float);
  --color-hover: var(--hover);
  --color-selected: var(--selected);
  --color-field: var(--field);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-rule: var(--rule);
  --color-ink: var(--text);
  --color-muted: var(--text-2);
  --color-faint: var(--text-3);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-soft: var(--accent-soft);
  --color-accent-text: var(--accent-text);
  --color-on-accent: var(--on-accent);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-warn: var(--warn);
  --color-warn-text: var(--warn-text);
  --color-warn-soft: var(--warn-soft);
  --color-ok: var(--ok);
  --color-st-open: var(--st-open);
  --color-st-drafted: var(--st-drafted);
  --color-st-applied: var(--st-applied);
  --color-st-interview: var(--st-interview);
  --color-st-offer: var(--st-offer);
  --color-st-closed: var(--st-closed);
  --color-paper: var(--paper);
  --color-paper-ink: var(--paper-ink);
  --color-paper-muted: var(--paper-muted);
  --color-desk: var(--desk);
  --radius-ctl: var(--r-ctl);
  --radius-panel: var(--r-panel);
  --text-12: var(--fs-12);
  --text-13: var(--fs-13);
  --text-14: var(--fs-14);
  --text-16: var(--fs-16);
  --text-20: var(--fs-20);
  --text-body: var(--fs-body);
}
```

- [ ] **Step 6: Fonts, providers, layout and favicon**

`web/src/theme/fonts.ts` (`next/font/local` needs literal paths, so they cannot be constants):

```ts
import localFont from "next/font/local";

// The woff2 files come from the pinned @fontsource packages, so they are versioned by
// pnpm-lock.yaml instead of being committed. Same files and axes as the prototype.
const displayFont = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
});

const uiFont = localFont({
  src: [
    { path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-hanken",
  display: "swap",
});

// Only the A4 document previews use the serif, so it is not preloaded on every page.
const serifFont = localFont({
  src: [
    { path: "../../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-source-serif",
  display: "swap",
  preload: false,
});

/** Class names that define --font-bricolage, --font-hanken and --font-source-serif on <html>. */
export const FONT_VARIABLE_CLASSES = [displayFont.variable, uiFont.variable, serifFont.variable].join(" ");
```

`web/app/providers.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/theme/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

`web/app/layout.tsx` (full replacement; Task 3 adds metadata and the language constant):

```tsx
import type { ReactNode } from "react";
import { FONT_VARIABLE_CLASSES } from "@/theme/fonts";
import { THEME_BOOT_SCRIPT } from "@/theme/themeScript";
import { Providers } from "./providers";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode is set by the boot script before hydration, so the attribute legitimately differs.
    <html lang="de" className={FONT_VARIABLE_CLASSES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`web/app/icon.svg` (brand mark: ink square with the vermilion block; Next serves it and adds `<link rel="icon">`, which also stops the browser from requesting a missing `/favicon.ico`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="oklch(0.2 0.008 60)"/><rect x="11" y="11" width="10" height="10" fill="oklch(0.575 0.205 33)"/></svg>
```

- [ ] **Step 7: Verify fonts and tokens reach the build**

Run: `"$QA"/webrun.sh sh -c 'pnpm build && ls .next/static/media/*.woff2 | wc -l && grep -l "data-mode" .next/static/chunks/*.css'`
Expected: build succeeds, `6` font files, and one CSS chunk path printed.

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 3: Typed DE/EN i18n

**Files:**
- Create: `web/src/i18n/languages.ts`, `web/src/i18n/format.ts`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/src/i18n/translate.ts`, `web/src/i18n/formatTime.ts`, `web/src/i18n/useI18n.ts`, `web/src/i18n/LanguageProvider.tsx`
- Modify: `web/app/providers.tsx`, `web/app/layout.tsx`, `web/tests/unit/setup.ts`
- Test: `web/tests/unit/i18n/format.test.ts`, `web/tests/unit/i18n/parity.test.ts`, `web/tests/unit/i18n/parity.types.ts`, `web/tests/unit/i18n/useI18n.test.tsx`

**Interfaces:**
- Consumes: `createPreferenceStore` (Task 2).
- Produces:
  - `LANGUAGES = ["de", "en"]`, `Language`, `DEFAULT_LANGUAGE = "de"`, `LANGUAGE_STORAGE_KEY = "ajp-language"`, `isLanguage(value: unknown): value is Language`, `languageFromLocale(locale: string | undefined): Language` (`@/i18n/languages`).
  - `de` (source of truth) and `MessageKey` (`@/i18n/de`); `en: Record<MessageKey, string>` (`@/i18n/en`).
  - `MessageVars`, `formatMessage(template, vars?)`, `placeholdersOf(template): string[]` (`@/i18n/format`).
  - `Translate = (key: MessageKey, vars?: MessageVars) => string`, `DICTIONARIES`, `translate(language, key, vars?)`, `translatorFor(language): Translate` (`@/i18n/translate`).
  - `formatTime(timestamp: number, language: Language, timeZone?: string): string` (`@/i18n/formatTime`).
  - `languageStore`, `useI18n(): { language; setLanguage(language): void; t: Translate }` (`@/i18n/useI18n`); `LanguageProvider` (`@/i18n/LanguageProvider`).
  - Every message key listed in `de.ts` below. Later tasks use only these keys; adding a key means adding it to both files.

**Decision:** flat dotted keys in one object per language. `de.ts` is declared `as const` and defines `MessageKey`; `en.ts` is typed `Record<MessageKey, string>`, so a missing key and an unknown key both fail `tsc` (object-literal excess property check). The current language lives in a `useSyncExternalStore` store (localStorage, then the browser locale, then German); the server preference from `GET /settings` overrides it after login (Task 10).

- [ ] **Step 1: Write the dictionaries**

`web/src/i18n/de.ts`:

```ts
/** German UI copy. This object defines the key set; en.ts must provide exactly the same keys. */
export const de = {
  "app.name": "Job Agent",
  "app.description": "Findet passende Stellen, schreibt die Unterlagen, behält jede Bewerbung im Blick.",
  "nav.main": "Hauptnavigation",
  "nav.inbox": "Eingang",
  "nav.applications": "Bewerbungen",
  "nav.sources": "Quellen",
  "nav.profile": "Profil",
  "nav.settings": "Einstellungen",
  "nav.companies": "Firmen",
  "nav.more": "Mehr",
  "nav.newMatches": "{count} neue Treffer",
  "nav.sourceErrors": "{count} Fehler",
  "shell.sidebar": "Seitenleiste",
  "page.job": "Stelle",
  "placeholder.deck": "Dieser Bereich wird gerade neu gebaut.",
  "notFound.title": "Seite nicht gefunden",
  "notFound.text": "Diese Adresse gibt es nicht.",
  "notFound.back": "Zum Eingang",
  "loading": "Lädt …",
  "activity.label": "Aktivität",
  "activity.runningOne": "1 Aufgabe läuft",
  "activity.runningMany": "{count} Aufgaben laufen",
  "activity.heading": "Im Hintergrund",
  "activity.none": "Keine laufenden Aufgaben.",
  "activity.unknownSource": "Quelle",
  "activity.crawlTitle": "{source} durchsuchen",
  "activity.step.starting": "Startet …",
  "activity.step.collecting": "Links sammeln: {done} von {total}",
  "activity.step.extracting": "Details lesen: {done} von {total}",
  "activity.step.analysing": "Bewerten: {done} von {total}",
  "activity.finished.completed": "Zuletzt fertig: {source}, {time}",
  "activity.finished.failed": "Zuletzt fehlgeschlagen: {source}, {time}",
  "activity.finished.cancelled": "Zuletzt abgebrochen: {source}, {time}",
  "theme.label": "Darstellung",
  "theme.cycle": "Darstellung wechseln",
  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "theme.system": "System",
  "language.label": "Sprache",
  "language.de": "Deutsch",
  "language.en": "English",
  "user.menu": "Benutzermenü",
  "user.roleAdmin": "Admin",
  "user.roleMember": "Mitglied",
  "user.account": "Konto",
  "user.logout": "Abmelden",
  "search.label": "Suche",
  "search.inputLabel": "Stellen und Firmen durchsuchen",
  "search.hint": "Die Ergebnisse werden in einer späteren Version angebunden.",
  "dialog.close": "Schließen",
  "toast.close": "Meldung schließen",
  "toast.backgroundError": "Eine Hintergrundaufgabe ist fehlgeschlagen.",
  "login.title": "Anmelden",
  "login.foot": "Selbst gehostet. Deine Daten bleiben auf deinem Server.",
  "login.username": "Benutzername",
  "login.password": "Passwort",
  "login.submit": "Anmelden",
  "login.failed": "Benutzername oder Passwort ist falsch.",
  "login.required": "Bitte ausfüllen.",
  "error.unexpected": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "error.server": "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
  "error.network": "Keine Verbindung zum Server.",
  "error.rateLimited": "Zu viele Anfragen, bitte kurz warten.",
  "error.sessionExpired": "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.",
  "error.forbidden": "Dafür fehlen dir die Rechte.",
  "error.languageNotSaved": "Die Sprache konnte nicht gespeichert werden.",
  "error.retry": "Erneut versuchen",
  "score.strong": "Stark",
  "score.possible": "Möglich",
  "score.weak": "Schwach",
  "score.title": "Passung {score} von 100: {band}",
} as const;

export type MessageKey = keyof typeof de;
```

`web/src/i18n/en.ts`:

```ts
import type { MessageKey } from "./de";

/** English UI copy; typed against the German key set, so a missing or extra key fails tsc. */
export const en: Record<MessageKey, string> = {
  "app.name": "Job Agent",
  "app.description": "Finds matching jobs, writes the documents, keeps track of every application.",
  "nav.main": "Main navigation",
  "nav.inbox": "Inbox",
  "nav.applications": "Applications",
  "nav.sources": "Sources",
  "nav.profile": "Profile",
  "nav.settings": "Settings",
  "nav.companies": "Companies",
  "nav.more": "More",
  "nav.newMatches": "{count} new matches",
  "nav.sourceErrors": "{count} failing",
  "shell.sidebar": "Sidebar",
  "page.job": "Job",
  "placeholder.deck": "This area is being rebuilt.",
  "notFound.title": "Page not found",
  "notFound.text": "This address does not exist.",
  "notFound.back": "Go to inbox",
  "loading": "Loading …",
  "activity.label": "Activity",
  "activity.runningOne": "1 task running",
  "activity.runningMany": "{count} tasks running",
  "activity.heading": "In the background",
  "activity.none": "No tasks running.",
  "activity.unknownSource": "Source",
  "activity.crawlTitle": "Searching {source}",
  "activity.step.starting": "Starting …",
  "activity.step.collecting": "Collecting links: {done} of {total}",
  "activity.step.extracting": "Reading details: {done} of {total}",
  "activity.step.analysing": "Scoring: {done} of {total}",
  "activity.finished.completed": "Last finished: {source}, {time}",
  "activity.finished.failed": "Last failed: {source}, {time}",
  "activity.finished.cancelled": "Last cancelled: {source}, {time}",
  "theme.label": "Appearance",
  "theme.cycle": "Change appearance",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "language.label": "Language",
  "language.de": "Deutsch",
  "language.en": "English",
  "user.menu": "User menu",
  "user.roleAdmin": "Admin",
  "user.roleMember": "Member",
  "user.account": "Account",
  "user.logout": "Log out",
  "search.label": "Search",
  "search.inputLabel": "Search jobs and companies",
  "search.hint": "Results will be connected in a later version.",
  "dialog.close": "Close",
  "toast.close": "Dismiss message",
  "toast.backgroundError": "A background task failed.",
  "login.title": "Log in",
  "login.foot": "Self-hosted. Your data stays on your server.",
  "login.username": "Username",
  "login.password": "Password",
  "login.submit": "Log in",
  "login.failed": "Username or password is incorrect.",
  "login.required": "Please fill in.",
  "error.unexpected": "Something went wrong. Please try again.",
  "error.server": "The server reported an error. Please try again shortly.",
  "error.network": "Cannot reach the server.",
  "error.rateLimited": "Too many requests, please wait a moment.",
  "error.sessionExpired": "Your session has expired. Please log in again.",
  "error.forbidden": "You do not have permission to do this.",
  "error.languageNotSaved": "The language could not be saved.",
  "error.retry": "Try again",
  "score.strong": "Strong",
  "score.possible": "Possible",
  "score.weak": "Weak",
  "score.title": "Fit {score} of 100: {band}",
};
```

- [ ] **Step 2: Write the failing tests**

`web/tests/unit/i18n/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMessage, placeholdersOf } from "@/i18n/format";
import { formatTime } from "@/i18n/formatTime";

describe("formatMessage", () => {
  it("replaces every occurrence of a placeholder", () => {
    expect(formatMessage("{n} von {n}", { n: 3 })).toBe("3 von 3");
  });

  it("leaves unknown placeholders visible instead of printing undefined", () => {
    expect(formatMessage("{source}, {time}", { source: "StepStone" })).toBe("StepStone, {time}");
  });

  it("returns the template unchanged without variables", () => {
    expect(formatMessage("Eingang")).toBe("Eingang");
  });
});

describe("placeholdersOf", () => {
  it("lists placeholder names sorted", () => {
    expect(placeholdersOf("{total} {done} {done}")).toEqual(["done", "done", "total"]);
  });
});

describe("formatTime", () => {
  const AFTERNOON = Date.UTC(2026, 9, 8, 14, 5);

  it("formats a 24-hour time in German", () => {
    expect(formatTime(AFTERNOON, "de", "UTC")).toBe("14:05");
  });

  it("formats a 12-hour time in English", () => {
    expect(formatTime(AFTERNOON, "en", "UTC")).toMatch(/^2:05\sPM$/);
  });
});
```

`web/tests/unit/i18n/parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { de, type MessageKey } from "@/i18n/de";
import { en } from "@/i18n/en";
import { placeholdersOf } from "@/i18n/format";

const KEYS = Object.keys(de) as MessageKey[];
const EMOJI = /\p{Extended_Pictographic}/u;

describe("DE/EN dictionaries", () => {
  it("have identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual([...KEYS].sort());
  });

  it.each(KEYS)("%s uses the same placeholders in both languages", (key) => {
    expect(placeholdersOf(en[key])).toEqual(placeholdersOf(de[key]));
  });

  it("contain no empty strings", () => {
    expect([...Object.values(de), ...Object.values(en)].filter((text) => text.trim() === "")).toEqual([]);
  });

  it("contain no emoji", () => {
    expect([...Object.values(de), ...Object.values(en)].filter((text) => EMOJI.test(text))).toEqual([]);
  });
});
```

`web/tests/unit/i18n/parity.types.ts` (type-level test: compiled by `pnpm typecheck`, not run by Vitest):

```ts
import type { MessageKey } from "@/i18n/de";
import { translate } from "@/i18n/translate";

// @ts-expect-error: a dictionary that misses keys must not type-check.
export const incomplete: Record<MessageKey, string> = { "app.name": "Job Agent" };

// @ts-expect-error: unknown message keys are rejected at compile time.
export const unknownKey = translate("de", "nav.doesNotExist");
```

`web/tests/unit/i18n/useI18n.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { languageStore, useI18n } from "@/i18n/useI18n";
import { languageFromLocale } from "@/i18n/languages";

function InboxLabel() {
  const { t } = useI18n();
  return <span>{t("nav.inbox")}</span>;
}

describe("useI18n", () => {
  it("renders German by default", () => {
    render(<InboxLabel />);
    expect(screen.getByText("Eingang")).toBeInTheDocument();
  });

  it("switches language and updates <html lang>", () => {
    render(
      <LanguageProvider>
        <InboxLabel />
      </LanguageProvider>,
    );
    act(() => languageStore.set("en"));
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("languageFromLocale", () => {
  it("maps a regional tag to its language", () => {
    expect(languageFromLocale("en-US")).toBe("en");
  });

  it("falls back to German for unsupported or missing locales", () => {
    expect(languageFromLocale("fr-FR")).toBe("de");
    expect(languageFromLocale(undefined)).toBe("de");
  });
});
```

Add the language store reset to `web/tests/unit/setup.ts` (full file):

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { languageStore } from "@/i18n/useI18n";
import { themeStore } from "@/theme/useTheme";

// Stores cache their value per module; reset them so every test starts from the defaults.
// jsdom reports navigator.language "en-US", so German is set explicitly.
beforeEach(() => {
  themeStore.set("system");
  languageStore.set("de");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/i18n`
Expected: FAIL with `Failed to resolve import "@/i18n/format"` (and the other new modules).

- [ ] **Step 4: Implement the i18n modules**

`web/src/i18n/languages.ts`:

```ts
export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "de";
export const LANGUAGE_STORAGE_KEY = "ajp-language";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Maps a BCP 47 tag such as "en-US" to a supported language; German otherwise. */
export function languageFromLocale(locale: string | undefined): Language {
  const primary = locale?.split("-")[0]?.toLowerCase();
  return isLanguage(primary) ? primary : DEFAULT_LANGUAGE;
}
```

`web/src/i18n/format.ts`:

```ts
const PLACEHOLDER = /\{(\w+)\}/g;

export type MessageVars = Readonly<Record<string, string | number>>;

/** Replaces every {name}; an unknown name stays visible so a missing variable is noticed. */
export function formatMessage(template: string, vars: MessageVars = {}): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]).sort();
}
```

`web/src/i18n/translate.ts`:

```ts
import { de, type MessageKey } from "./de";
import { en } from "./en";
import { formatMessage, type MessageVars } from "./format";
import type { Language } from "./languages";

export type Translate = (key: MessageKey, vars?: MessageVars) => string;

export const DICTIONARIES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  de,
  en,
};

export function translate(language: Language, key: MessageKey, vars?: MessageVars): string {
  return formatMessage(DICTIONARIES[language][key], vars);
}

export function translatorFor(language: Language): Translate {
  return (key, vars) => translate(language, key, vars);
}
```

`web/src/i18n/formatTime.ts`:

```ts
import type { Language } from "./languages";

/** Short clock time in the user's language; timeZone defaults to the browser's own zone. */
export function formatTime(timestamp: number, language: Language, timeZone?: string): string {
  return new Intl.DateTimeFormat(language, { timeStyle: "short", timeZone }).format(timestamp);
}
```

`web/src/i18n/useI18n.ts`:

```ts
"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createPreferenceStore } from "@/lib/preferenceStore";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  languageFromLocale,
  type Language,
} from "./languages";
import { translatorFor, type Translate } from "./translate";

export const languageStore = createPreferenceStore<Language>({
  key: LANGUAGE_STORAGE_KEY,
  isValid: isLanguage,
  fallback: () => languageFromLocale(navigator.language),
});

// The server render has no localStorage; German avoids a mismatch for the common case.
const serverLanguage = (): Language => DEFAULT_LANGUAGE;

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

export function useI18n(): I18n {
  const language = useSyncExternalStore(languageStore.subscribe, languageStore.get, serverLanguage);
  const t = useMemo(() => translatorFor(language), [language]);
  return { language, setLanguage: languageStore.set, t };
}
```

`web/src/i18n/LanguageProvider.tsx`:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useI18n } from "./useI18n";

/** Keeps <html lang> in sync with the chosen language for screen readers and hyphenation. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return children;
}
```

- [ ] **Step 5: Wire the provider and metadata**

`web/app/providers.tsx` (full file):

```tsx
"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </LanguageProvider>
  );
}
```

`web/app/layout.tsx` (full file):

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { de } from "@/i18n/de";
import { DEFAULT_LANGUAGE } from "@/i18n/languages";
import { FONT_VARIABLE_CLASSES } from "@/theme/fonts";
import { THEME_BOOT_SCRIPT } from "@/theme/themeScript";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: de["app.name"],
  description: de["app.description"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode is set by the boot script before hydration, so the attribute legitimately differs.
    <html lang={DEFAULT_LANGUAGE} className={FONT_VARIABLE_CLASSES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass, including the type-level test**

Run: `"$QA"/webrun.sh sh -c 'pnpm exec vitest run tests/unit/i18n && pnpm typecheck'`
Expected: PASS (format 6, parity 3 + one per key, useI18n 4); `tsc` exits 0, which proves both `@ts-expect-error` lines really error. Sanity check of the type test: temporarily delete `"nav.more"` from `en.ts`, run `pnpm typecheck`, expect `Property '"nav.more"' is missing`, then restore it.

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 4: API client core (apiFetch, error normaliser, login redirect)

**Files:**
- Create: `web/src/api/errors.ts`, `web/src/api/client.ts`, `web/src/api/session.ts`, `web/src/api/describeError.ts`
- Modify: `web/app/page.tsx`
- Test: `web/tests/unit/support/fakeFetch.ts`, `web/tests/unit/api/errors.test.ts`, `web/tests/unit/api/client.test.ts`, `web/tests/unit/api/session.test.ts`, `web/tests/unit/api/describeError.test.ts`

**Interfaces:**
- Consumes: `Translate`, `MessageKey` (Task 3).
- Produces:
  - `ApiErrorCode`, `class ApiError extends Error { status: number; code: ApiErrorCode; fields: Readonly<Record<string, string>> }`, `errorFromResponse(status: number, body: unknown): ApiError`, `errorFromScraperBody(body: unknown): ApiError | null`, `networkError()`, `badResponseError(status)`, `unauthenticatedError()` (`@/api/errors`).
  - `ApiRequest { method?; json?; form?; signal?; skipAuthRefresh? }`, `ApiClient { request<T>(path: string, schema: ZodType<T>, init?: ApiRequest): Promise<T>; refreshSession(): Promise<boolean> }`, `createApiClient(options: { baseUrl: string; onAuthLost: () => void; fetchImpl?: typeof fetch }): ApiClient`, `createSingleFlight<T>(task: () => Promise<T>): () => Promise<T>` (`@/api/client`).
  - `LOGIN_PATH = "/login"`, `DEFAULT_AFTER_LOGIN_PATH = "/inbox"`, `loginRedirectUrl(currentPath): string`, `safeNextPath(raw: string | null): string`, `redirectToLogin(): void` (`@/api/session`).
  - `describeError(error: unknown, t: Translate): string` (`@/api/describeError`).

**Decision:** "apiFetch" is `ApiClient.request`. It takes a zod schema for the success body, so every response is validated at the boundary. `message` on `ApiError` is empty whenever the UI must use its own sentence (5xx, 429, network, malformed body); `describeError` turns codes into translated text. A network failure during refresh is a `NETWORK_ERROR`, not a logout.

- [ ] **Step 1: Write the test support and failing tests**

`web/tests/unit/support/fakeFetch.ts` (fetch is the system boundary, so it is the one thing we fake):

```ts
export interface RecordedCall {
  url: string;
  method: string;
  body: string | null;
  credentials: RequestCredentials | undefined;
}

export type Responder = (call: RecordedCall) => Response;

export interface FakeFetch {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
}

/** A fetch stand-in that records every call; a responder that throws simulates a network error. */
export function createFakeFetch(responder: Responder): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? String(init.body) : null,
      credentials: init?.credentials,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetchImpl, calls };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

`web/tests/unit/api/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError, errorFromResponse, errorFromScraperBody } from "@/api/errors";

describe("errorFromResponse", () => {
  it("keeps a FastAPI detail string as the message", () => {
    const error = errorFromResponse(404, { detail: "Job not found" });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Job not found" });
  });

  it("maps a Pydantic detail list to per-field errors", () => {
    const error = errorFromResponse(422, {
      detail: [
        { loc: ["body", "username"], msg: "Field required", type: "missing" },
        { loc: ["body", "cv_data", "education"], msg: "Input should be a string", type: "string_type" },
      ],
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toEqual({
      username: "Field required",
      "cv_data.education": "Input should be a string",
    });
    expect(error.message).toBe("Field required");
  });

  it("maps the slowapi 429 body to RATE_LIMITED without passing its text on", () => {
    const error = errorFromResponse(429, { error: "Rate limit exceeded: 5 per 1 minute" });
    expect(error).toMatchObject({ code: "RATE_LIMITED", message: "" });
  });

  it("hides the detail of server errors", () => {
    const error = errorFromResponse(500, { detail: "Internal server error" });
    expect(error).toMatchObject({ status: 500, code: "SERVER_ERROR", message: "" });
  });

  it("handles the plain-text 502 of the scraper proxy", () => {
    expect(errorFromResponse(502, "Scraper service unavailable").code).toBe("SERVER_ERROR");
  });

  it("falls back to BAD_REQUEST for an unmapped 4xx status", () => {
    expect(errorFromResponse(418, { detail: "Nope" })).toMatchObject({ code: "BAD_REQUEST", message: "Nope" });
  });
});

describe("errorFromScraperBody", () => {
  it("turns 200 + status error into UPSTREAM_ERROR", () => {
    const error = errorFromScraperBody({ status: "Error", message: "Seite nicht erreichbar" });
    expect(error).toMatchObject({ status: 200, code: "UPSTREAM_ERROR", message: "Seite nicht erreichbar" });
  });

  it("ignores successful scraper bodies", () => {
    expect(errorFromScraperBody({ status: "Started", job_id: "c1" })).toBeNull();
    expect(errorFromScraperBody({ jobs: [] })).toBeNull();
  });
});
```

`web/tests/unit/api/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient, createSingleFlight } from "@/api/client";
import { ApiError } from "@/api/errors";
import { createFakeFetch, jsonResponse, type RecordedCall, type Responder } from "../support/fakeFetch";

const BASE_URL = "http://api.test";
const statusSchema = z.object({ status: z.string() });
const valueSchema = z.object({ value: z.string() });
const UNAUTHORIZED = { detail: "Could not validate credentials" };

function clientWith(responder: Responder) {
  const fake = createFakeFetch(responder);
  const onAuthLost = vi.fn();
  const client = createApiClient({ baseUrl: BASE_URL, onAuthLost, fetchImpl: fake.fetchImpl });
  return { client, onAuthLost, calls: fake.calls };
}

const isRefresh = (call: RecordedCall) => call.url.endsWith("/auth/refresh");

/** Answers 401 until a successful refresh, then echoes the requested URL. */
function expiringSession(refreshStatus: number): Responder {
  let refreshed = false;
  return (call) => {
    if (isRefresh(call)) {
      refreshed = refreshStatus === 200;
      return jsonResponse(refreshStatus, { status: "ok" });
    }
    return refreshed ? jsonResponse(200, { value: call.url }) : jsonResponse(401, UNAUTHORIZED);
  };
}

describe("ApiClient.request", () => {
  it("sends cookies and returns the validated body", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { value: "x", extra: 1 }));
    await expect(client.request("/me", valueSchema)).resolves.toEqual({ value: "x" });
    expect(calls[0]).toMatchObject({ url: "http://api.test/me", method: "GET", credentials: "include" });
  });

  it("posts form fields url-encoded", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { status: "ok" }));
    await client.request("/auth/login", statusSchema, { method: "POST", form: { username: "admin", password: "a&b" } });
    expect(calls[0].body).toBe("username=admin&password=a%26b");
  });

  it("posts JSON bodies", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { status: "ok" }));
    await client.request("/language-preference", statusSchema, { method: "POST", json: { language: "en" } });
    expect(calls[0].body).toBe('{"language":"en"}');
  });

  it("returns undefined for 204 No Content", async () => {
    const { client } = clientWith(() => new Response(null, { status: 204 }));
    await expect(client.request("/x", z.undefined(), { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("refreshes once for concurrent 401s and retries every request", async () => {
    const { client, calls } = clientWith(expiringSession(200));
    const results = await Promise.all(["/a", "/b", "/c"].map((path) => client.request(path, valueSchema)));
    expect(results.map((result) => result.value)).toEqual([
      "http://api.test/a",
      "http://api.test/b",
      "http://api.test/c",
    ]);
    expect(calls.filter(isRefresh)).toHaveLength(1);
  });

  it("reports a lost session when the refresh is rejected", async () => {
    const { client, onAuthLost } = clientWith(expiringSession(401));
    const result = client.request("/me", valueSchema);
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it("reports a lost session when the retried request is still 401", async () => {
    const responder: Responder = (call) =>
      isRefresh(call) ? jsonResponse(200, { status: "ok" }) : jsonResponse(401, UNAUTHORIZED);
    const { client, onAuthLost, calls } = clientWith(responder);
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });

  it("keeps the session when the refresh endpoint is unreachable", async () => {
    const responder: Responder = (call) => {
      if (isRefresh(call)) throw new TypeError("Failed to fetch");
      return jsonResponse(401, UNAUTHORIZED);
    };
    const { client, onAuthLost } = clientWith(responder);
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("does not refresh when skipAuthRefresh is set (wrong password)", async () => {
    const { client, onAuthLost, calls } = clientWith(() => jsonResponse(401, { detail: "Incorrect username or password" }));
    const login = client.request("/auth/login", statusSchema, { method: "POST", skipAuthRefresh: true });
    await expect(login).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(calls).toHaveLength(1);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("turns a scraper 200 + status error body into UPSTREAM_ERROR", async () => {
    const { client } = clientWith(() => jsonResponse(200, { status: "error", message: "Seite nicht erreichbar" }));
    await expect(client.request("/scraper/x", statusSchema)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "Seite nicht erreichbar",
    });
  });

  it("rejects a body that does not match the schema with BAD_RESPONSE", async () => {
    const { client } = clientWith(() => jsonResponse(200, { unexpected: true }));
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ code: "BAD_RESPONSE", message: "" });
  });

  it("maps a rejected fetch to NETWORK_ERROR", async () => {
    const { client } = clientWith(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("rethrows aborts untouched so query cancellation stays silent", async () => {
    const { client } = clientWith(() => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("createSingleFlight", () => {
  it("shares one in-flight run between concurrent callers", async () => {
    const task = vi.fn(async () => true);
    const run = createSingleFlight(task);
    await Promise.all([run(), run()]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("starts a new run after the previous one settled", async () => {
    const task = vi.fn(async () => true);
    const run = createSingleFlight(task);
    await run();
    await run();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
```

`web/tests/unit/api/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN_PATH, loginRedirectUrl, safeNextPath } from "@/api/session";

describe("loginRedirectUrl", () => {
  it("carries the current path and query as an encoded next parameter", () => {
    expect(loginRedirectUrl("/jobs/1?tab=firma")).toBe("/login?next=%2Fjobs%2F1%3Ftab%3Dfirma");
  });
});

describe("safeNextPath", () => {
  it("accepts a same-origin path with query", () => {
    expect(safeNextPath("/sources?quelle=3")).toBe("/sources?quelle=3");
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/login?next=%2Finbox",
    "inbox",
    "",
    null,
  ])("falls back to the inbox for %s", (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });
});
```

`web/tests/unit/api/describeError.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
const apiError = (code: ApiError["code"], message = "") => new ApiError({ status: 500, code, message });

describe("describeError", () => {
  it("never shows the text of a server error", () => {
    const text = describeError(apiError("SERVER_ERROR", "Internal server error"), t);
    expect(text).toBe("Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.");
  });

  it("treats a malformed response like a server error", () => {
    expect(describeError(apiError("BAD_RESPONSE"), t)).toBe(t("error.server"));
  });

  it("asks the user to wait on rate limits", () => {
    expect(describeError(apiError("RATE_LIMITED"), t)).toBe("Zu viele Anfragen, bitte kurz warten.");
  });

  it("names a missing connection", () => {
    expect(describeError(apiError("NETWORK_ERROR"), t)).toBe("Keine Verbindung zum Server.");
  });

  it("shows the server's message for a client error", () => {
    expect(describeError(apiError("BAD_REQUEST", "Nur PDF Dateien erlaubt."), t)).toBe("Nur PDF Dateien erlaubt.");
  });

  it("falls back to a generic sentence when a client error has no message", () => {
    expect(describeError(apiError("NOT_FOUND"), t)).toBe(t("error.unexpected"));
  });

  it("handles values that are not ApiErrors", () => {
    expect(describeError(new Error("boom"), t)).toBe(t("error.unexpected"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api`
Expected: FAIL with `Failed to resolve import "@/api/errors"` (and the other new modules).

- [ ] **Step 3: Implement `errors.ts`**

```ts
import { z } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "BAD_RESPONSE"
  | "SERVER_ERROR"
  | "NETWORK_ERROR";

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Readonly<Record<string, string>>;
}

/**
 * The one error every API call rejects with. `message` is empty whenever the UI must supply its
 * own sentence (server errors, rate limits, network, malformed bodies); see describeError.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Readonly<Record<string, string>>;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
  }
}

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR_STATUS = 500;
const NO_RESPONSE_STATUS = 0;

const CODE_BY_STATUS: Readonly<Record<number, ApiErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_ERROR",
};

// FastAPI prefixes validation locations with where the value came from; that is not a field name.
const LOCATION_ROOTS = new Set(["body", "query", "path"]);

const detailTextSchema = z.object({ detail: z.string() });
const validationIssueSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
});
const detailListSchema = z.object({ detail: z.array(validationIssueSchema) });
const scraperErrorSchema = z.object({
  status: z.string().regex(/^error$/i),
  message: z.string().optional(),
});

type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** Normalises a non-2xx body (FastAPI detail string or list, slowapi 429, plain text) into an ApiError. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  if (status >= FIRST_SERVER_ERROR_STATUS) return new ApiError({ status, code: "SERVER_ERROR", message: "" });
  if (status === HTTP_TOO_MANY_REQUESTS) return new ApiError({ status, code: "RATE_LIMITED", message: "" });
  const list = detailListSchema.safeParse(body);
  if (list.success) return validationError(status, list.data.detail);
  const text = detailTextSchema.safeParse(body);
  const message = text.success ? text.data.detail : "";
  return new ApiError({ status, code: CODE_BY_STATUS[status] ?? "BAD_REQUEST", message });
}

/** The scraper reports logical failures as 200 + {status: "error"}; null for any other body. */
export function errorFromScraperBody(body: unknown): ApiError | null {
  const parsed = scraperErrorSchema.safeParse(body);
  if (!parsed.success) return null;
  return new ApiError({ status: HTTP_OK, code: "UPSTREAM_ERROR", message: parsed.data.message ?? "" });
}

export function networkError(): ApiError {
  return new ApiError({ status: NO_RESPONSE_STATUS, code: "NETWORK_ERROR", message: "" });
}

export function badResponseError(status: number): ApiError {
  return new ApiError({ status, code: "BAD_RESPONSE", message: "" });
}

export function unauthenticatedError(): ApiError {
  return new ApiError({ status: HTTP_UNAUTHORIZED, code: "UNAUTHENTICATED", message: "" });
}

function validationError(status: number, issues: readonly ValidationIssue[]): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[fieldName(issue.loc)] ??= issue.msg;
  }
  return new ApiError({ status, code: "VALIDATION_ERROR", message: issues[0]?.msg ?? "", fields });
}

function fieldName(location: ReadonlyArray<string | number>): string {
  return location.filter((part) => !LOCATION_ROOTS.has(String(part))).join(".");
}
```

- [ ] **Step 4: Implement `client.ts`**

```ts
import type { ZodType } from "zod";
import {
  badResponseError,
  errorFromResponse,
  errorFromScraperBody,
  networkError,
  unauthenticatedError,
} from "./errors";

const HTTP_UNAUTHORIZED = 401;
const HTTP_NO_CONTENT = 204;
const REFRESH_PATH = "/auth/refresh";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest {
  method?: HttpMethod;
  /** Sent as application/json. */
  json?: unknown;
  /** Sent as application/x-www-form-urlencoded; the login endpoint expects this. */
  form?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  /** For endpoints where 401 means "wrong credentials", not "expired session". */
  skipAuthRefresh?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Called once a session cannot be restored; the app sends the user to /login?next=. */
  onAuthLost: () => void;
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  /** @throws ApiError for every failure except aborts, which are rethrown unchanged. */
  request<T>(path: string, schema: ZodType<T>, init?: ApiRequest): Promise<T>;
  refreshSession(): Promise<boolean>;
}

// Resolved per call, so tests and the browser can swap the global fetch after module load.
const globalFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

type Send = (path: string, init: ApiRequest) => Promise<Response>;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? globalFetch;
  const send: Send = (path, init) => sendRequest(fetchImpl, options.baseUrl + path, init);
  const refreshSession = createSingleFlight(() => refreshCookies(send));

  async function retryAfterRefresh(path: string, init: ApiRequest): Promise<Response> {
    const retried = (await refreshSession()) ? await send(path, init) : null;
    if (retried && retried.status !== HTTP_UNAUTHORIZED) return retried;
    options.onAuthLost();
    throw unauthenticatedError();
  }

  async function request<T>(path: string, schema: ZodType<T>, init: ApiRequest = {}): Promise<T> {
    const first = await send(path, init);
    const needsRefresh = first.status === HTTP_UNAUTHORIZED && !init.skipAuthRefresh;
    return parseResponse(needsRefresh ? await retryAfterRefresh(path, init) : first, schema);
  }

  return { request, refreshSession };
}

/** A refresh that the server rejects is `false`; an unreachable server throws NETWORK_ERROR instead. */
async function refreshCookies(send: Send): Promise<boolean> {
  const response = await send(REFRESH_PATH, { method: "POST" });
  return response.ok;
}

/** Concurrent callers share one in-flight run (e.g. many 401s, one refresh); the next call starts anew. */
export function createSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= task().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

async function sendRequest(fetchImpl: typeof fetch, url: string, init: ApiRequest): Promise<Response> {
  try {
    return await fetchImpl(url, toRequestInit(init));
  } catch (error) {
    // TanStack Query aborts superseded requests; that is not a failure to report.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }
}

function toRequestInit(init: ApiRequest): RequestInit {
  const headers = new Headers({ Accept: "application/json" });
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const method = init.method ?? "GET";
  return { method, headers, credentials: "include", signal: init.signal, body: toBody(init) };
}

function toBody(init: ApiRequest): BodyInit | undefined {
  if (init.json !== undefined) return JSON.stringify(init.json);
  return init.form ? new URLSearchParams(init.form) : undefined;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === HTTP_NO_CONTENT) return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Plain-text bodies exist (the scraper proxy's 502); the normaliser handles them as text.
    return text;
  }
}

async function parseResponse<T>(response: Response, schema: ZodType<T>): Promise<T> {
  const body = await readBody(response);
  if (!response.ok) throw errorFromResponse(response.status, body);
  const upstream = errorFromScraperBody(body);
  if (upstream) throw upstream;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badResponseError(response.status);
  return parsed.data;
}
```

- [ ] **Step 5: Implement `session.ts` and `describeError.ts`**

`web/src/api/session.ts`:

```ts
export const LOGIN_PATH = "/login";
export const DEFAULT_AFTER_LOGIN_PATH = "/inbox";
const NEXT_PARAM = "next";

/** /login?next=<current path and query>, so the user returns to where the session ended. */
export function loginRedirectUrl(currentPath: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: currentPath })}`;
}

/** Accepts only same-origin absolute paths, so ?next= cannot send the user to another site. */
export function safeNextPath(raw: string | null): string {
  const sameOrigin = raw?.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\");
  if (!raw || !sameOrigin || raw.startsWith(LOGIN_PATH)) return DEFAULT_AFTER_LOGIN_PATH;
  return raw;
}

/** Full navigation (not router.push) so every cached query of the lost session is discarded. */
export function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  window.location.assign(loginRedirectUrl(pathname + search));
}
```

`web/src/api/describeError.ts`:

```ts
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { ApiError, type ApiErrorCode } from "./errors";

// Codes whose server text is either absent or must not be shown (spec 6: no raw internals).
const GENERIC_MESSAGE: Partial<Record<ApiErrorCode, MessageKey>> = {
  NETWORK_ERROR: "error.network",
  SERVER_ERROR: "error.server",
  BAD_RESPONSE: "error.server",
  RATE_LIMITED: "error.rateLimited",
  UNAUTHENTICATED: "error.sessionExpired",
  FORBIDDEN: "error.forbidden",
};

/** User-facing sentence for anything an API call can throw. */
export function describeError(error: unknown, t: Translate): string {
  if (!(error instanceof ApiError)) return t("error.unexpected");
  const genericKey = GENERIC_MESSAGE[error.code];
  if (genericKey) return t(genericKey);
  return error.message === "" ? t("error.unexpected") : error.message;
}
```

- [ ] **Step 6: Use the shared constant on the home route**

`web/app/page.tsx` (full file):

```tsx
import { redirect } from "next/navigation";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/api/session";

export default function HomePage() {
  redirect(DEFAULT_AFTER_LOGIN_PATH);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api`
Expected: PASS (errors 8, client 15, session 9, describeError 7).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 5: API resource modules and TanStack Query setup

**Files:**
- Create: `web/src/api/instance.ts`, `web/src/api/queryKeys.ts`, `web/src/api/auth.ts`, `web/src/api/settings.ts`, `web/src/api/jobs.ts`, `web/src/api/platforms.ts`, `web/src/api/crawl.ts`, `web/src/api/queryClient.ts`, `web/src/api/QueryProvider.tsx`
- Modify: `web/app/providers.tsx`
- Test: `web/tests/unit/api/resources.test.ts`, `web/tests/unit/api/queryClient.test.ts`

**Interfaces:**
- Consumes: `createApiClient`, `ApiError`, `redirectToLogin` (Task 4); `API_BASE_URL` (Task 1); `Language`, `isLanguage` (Task 3).
- Produces:
  - `api: ApiClient` (`@/api/instance`).
  - `queryKeys = { me, languagePreference, jobCounts, jobsRoot, job(id), platforms, activity, company(domain), templates, systemStatus }` (`@/api/queryKeys`).
  - `CurrentUser { id: number; username: string; is_admin: boolean }`, `Credentials { username; password }`, `login(credentials): Promise<void>`, `logout(): Promise<void>`, `fetchCurrentUser(): Promise<CurrentUser>` (`@/api/auth`).
  - `fetchLanguagePreference(): Promise<Language | null>`, `saveLanguagePreference(language): Promise<void>` (`@/api/settings`).
  - `JobCounts`, `JobListPage { items: ReadonlyArray<{ id: string }>; total: number }` (B6), `fetchJobCounts()`, `openMatchCount(counts?): number` (`@/api/jobs`).
  - `Platform { id; name; url; last_run?: { error?: string | null } | null }` (B9), `fetchPlatforms()`, `countFailingPlatforms(platforms): number` (`@/api/platforms`).
  - `CrawlJob { job_id; platform; status; total; scraping_completed }`, `fetchCrawlJobs(): Promise<CrawlJob[]>` (`@/api/crawl`).
  - `MAX_QUERY_RETRIES = 2`, `shouldRetry(failureCount, error): boolean`, `createQueryClient(): QueryClient` (`@/api/queryClient`); `QueryProvider` (`@/api/QueryProvider`).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/api/resources.test.ts` (the global `fetch` is the boundary the app instance uses):

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, login } from "@/api/auth";
import { fetchCrawlJobs } from "@/api/crawl";
import { fetchJobCounts, openMatchCount } from "@/api/jobs";
import { countFailingPlatforms, fetchPlatforms } from "@/api/platforms";
import { fetchLanguagePreference, saveLanguagePreference } from "@/api/settings";
import { createFakeFetch, jsonResponse, type RecordedCall, type Responder } from "../support/fakeFetch";

function stubApi(responder: Responder): RecordedCall[] {
  const fake = createFakeFetch(responder);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

describe("auth", () => {
  it("posts credentials url-encoded and does not refresh on a wrong password", async () => {
    const calls = stubApi(() => jsonResponse(401, { detail: "Incorrect username or password" }));
    await expect(login({ username: "admin", password: "wrong" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(calls).toEqual([
      expect.objectContaining({ url: "http://api.test/auth/login", method: "POST", body: "username=admin&password=wrong" }),
    ]);
  });

  it("reads the current user", async () => {
    stubApi(() => jsonResponse(200, { id: 1, username: "admin", is_admin: true }));
    await expect(fetchCurrentUser()).resolves.toEqual({ id: 1, username: "admin", is_admin: true });
  });
});

describe("settings", () => {
  it("returns a supported server language", async () => {
    stubApi(() => jsonResponse(200, { role: "Dev", language: "en" }));
    await expect(fetchLanguagePreference()).resolves.toBe("en");
  });

  it("returns null for an unsupported server language", async () => {
    stubApi(() => jsonResponse(200, { language: "fr" }));
    await expect(fetchLanguagePreference()).resolves.toBeNull();
  });

  it("saves the language as JSON", async () => {
    const calls = stubApi(() => jsonResponse(200, { status: "ok", language: "en" }));
    await saveLanguagePreference("en");
    expect(calls[0]).toMatchObject({ url: "http://api.test/language-preference", method: "POST", body: '{"language":"en"}' });
  });
});

describe("jobs", () => {
  it("counts open matches for the inbox badge", async () => {
    stubApi(() => jsonResponse(200, { status_counts: { OPEN: 3, DRAFTED: 1, ARCHIVE: 9 }, domain_counts: [] }));
    expect(openMatchCount(await fetchJobCounts())).toBe(3);
  });

  it("treats missing counts as zero", () => {
    expect(openMatchCount(undefined)).toBe(0);
  });
});

describe("platforms", () => {
  it("counts platforms whose last run failed", async () => {
    stubApi(() =>
      jsonResponse(200, [
        { id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs", last_run: { error: null } },
        { id: 2, name: "Indeed", url: "https://de.indeed.com/jobs", last_run: { error: "Seite nicht erreichbar" } },
        { id: 3, name: "Neu", url: "https://jobs.example.com", last_run: null },
      ]),
    );
    expect(countFailingPlatforms(await fetchPlatforms())).toBe(1);
  });
});

describe("crawl", () => {
  it("fills missing progress numbers with zero", async () => {
    stubApi(() => jsonResponse(200, { jobs: [{ job_id: "c1", platform: "https://a.example", status: "starting" }] }));
    await expect(fetchCrawlJobs()).resolves.toEqual([
      { job_id: "c1", platform: "https://a.example", status: "starting", total: 0, scraping_completed: 0 },
    ]);
  });
});
```

`web/tests/unit/api/queryClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError, networkError } from "@/api/errors";
import { MAX_QUERY_RETRIES, shouldRetry } from "@/api/queryClient";

const clientError = new ApiError({ status: 404, code: "NOT_FOUND", message: "" });
const serverError = new ApiError({ status: 500, code: "SERVER_ERROR", message: "" });
const expiredSession = new ApiError({ status: 401, code: "UNAUTHENTICATED", message: "" });

describe("shouldRetry", () => {
  it("does not retry client errors", () => {
    expect(shouldRetry(0, clientError)).toBe(false);
  });

  it("does not retry an expired session (apiFetch already refreshed once)", () => {
    expect(shouldRetry(0, expiredSession)).toBe(false);
  });

  it("retries server and network errors", () => {
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(1, networkError())).toBe(true);
  });

  it("stops at the retry limit", () => {
    expect(shouldRetry(MAX_QUERY_RETRIES, serverError)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/resources.test.ts tests/unit/api/queryClient.test.ts`
Expected: FAIL with `Failed to resolve import "@/api/auth"`.

- [ ] **Step 3: Implement the instance, keys and resources**

`web/src/api/instance.ts`:

```ts
import { API_BASE_URL } from "@/config";
import { createApiClient } from "./client";
import { redirectToLogin } from "./session";

/** The app-wide client; a session that cannot be refreshed ends on /login?next=. */
export const api = createApiClient({ baseUrl: API_BASE_URL, onAuthLost: redirectToLogin });
```

`web/src/api/queryKeys.ts`:

```ts
/**
 * Query keys per resource (spec 6). src/realtime/applyEvent.ts invalidates with the same keys,
 * so a key defined here may have no query yet in phase 1 (templates, company, system status).
 */
export const queryKeys = {
  me: ["me"],
  languagePreference: ["settings", "language"],
  jobCounts: ["job-counts"],
  jobsRoot: ["jobs"],
  job: (id: string) => ["job", id] as const,
  platforms: ["platforms"],
  activity: ["activity"],
  company: (domain: string) => ["company", domain] as const,
  templates: ["templates"],
  systemStatus: ["system-status"],
} as const;
```

`web/src/api/auth.ts`:

```ts
import { z } from "zod";
import { api } from "./instance";

export const currentUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  is_admin: z.boolean(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export interface Credentials {
  username: string;
  password: string;
}

const statusSchema = z.object({ status: z.string() });

/** Sets the httpOnly session cookies; a 401 here means wrong credentials, not an expired session. */
export async function login(credentials: Credentials): Promise<void> {
  const form = { username: credentials.username, password: credentials.password };
  await api.request("/auth/login", statusSchema, { method: "POST", form, skipAuthRefresh: true });
}

/** Ends the session on every device: the server bumps the user's token version. */
export async function logout(): Promise<void> {
  await api.request("/auth/logout", statusSchema, { method: "POST", skipAuthRefresh: true });
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return api.request("/me", currentUserSchema);
}
```

`web/src/api/settings.ts`:

```ts
import { z } from "zod";
import { isLanguage, type Language } from "@/i18n/languages";
import { api } from "./instance";

// GET /settings returns the whole profile; phase 1 only needs the language.
const languageSettingsSchema = z.object({ language: z.string().nullish() });
const savedLanguageSchema = z.object({ status: z.string(), language: z.string() });

/** The stored language (it also sets the language of AI output); null when unset or unsupported. */
export async function fetchLanguagePreference(): Promise<Language | null> {
  const settings = await api.request("/settings", languageSettingsSchema);
  return isLanguage(settings.language) ? settings.language : null;
}

export async function saveLanguagePreference(language: Language): Promise<void> {
  await api.request("/language-preference", savedLanguageSchema, { method: "POST", json: { language } });
}
```

`web/src/api/jobs.ts`:

```ts
import { z } from "zod";
import { api } from "./instance";

const jobCountsSchema = z.object({ status_counts: z.record(z.string(), z.number()) });
export type JobCounts = z.infer<typeof jobCountsSchema>;

/** Page shape of GET /jobs after backend change B6; the list queries arrive with the inbox (phase 3). */
export interface JobListPage {
  items: ReadonlyArray<{ id: string }>;
  total: number;
}

export async function fetchJobCounts(): Promise<JobCounts> {
  return api.request("/jobs/counts?is_archived=false", jobCountsSchema);
}

/** Inbox badge: active OPEN jobs, the "Treffer" (spec 4.3). */
export function openMatchCount(counts: JobCounts | undefined): number {
  return counts?.status_counts.OPEN ?? 0;
}
```

`web/src/api/platforms.ts`:

```ts
import { z } from "zod";
import { api } from "./instance";

// Only what phase 1 reads; B9's last_run also carries timestamps and counts for phase 5.
const lastRunSchema = z.object({ error: z.string().nullish() });

const platformSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string(),
  last_run: lastRunSchema.nullish(),
});
export type Platform = z.infer<typeof platformSchema>;

export async function fetchPlatforms(): Promise<Platform[]> {
  return api.request("/platforms", z.array(platformSchema));
}

/** Sources badge: platforms whose last run ended with an error. */
export function countFailingPlatforms(platforms: readonly Platform[]): number {
  return platforms.filter((platform) => Boolean(platform.last_run?.error)).length;
}
```

`web/src/api/crawl.ts`:

```ts
import { z } from "zod";
import { api } from "./instance";

// The scraper omits counters before the first progress event.
const crawlJobSchema = z.object({
  job_id: z.string(),
  platform: z.string(),
  status: z.string(),
  total: z.number().default(0),
  scraping_completed: z.number().default(0),
});
export type CrawlJob = z.infer<typeof crawlJobSchema>;

const crawlStatusSchema = z.object({ jobs: z.array(crawlJobSchema) });

/** Crawls of the signed-in user (the scraper reads the user from the session cookie). */
export async function fetchCrawlJobs(): Promise<CrawlJob[]> {
  const status = await api.request("/scraper/crawl-status", crawlStatusSchema);
  return status.jobs;
}
```

- [ ] **Step 4: Implement the query client and provider**

`web/src/api/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";

export const MAX_QUERY_RETRIES = 2;
const STALE_TIME_MS = 30_000;
const FIRST_SERVER_ERROR_STATUS = 500;
const NO_RESPONSE_STATUS = 0;

/** Retries only what can heal by itself: network failures and 5xx. 4xx will not change on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const isClientError =
    error instanceof ApiError &&
    error.status > NO_RESPONSE_STATUS &&
    error.status < FIRST_SERVER_ERROR_STATUS;
  return !isClientError && failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // The WebSocket keeps data fresh, so focus refetches would only add load.
      queries: { retry: shouldRetry, staleTime: STALE_TIME_MS, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
```

`web/src/api/QueryProvider.tsx`:

```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "./queryClient";

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser tab; useState keeps it stable across re-renders.
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

`web/app/providers.tsx` (full file):

```tsx
"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/api/QueryProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <LanguageProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </LanguageProvider>
    </QueryProvider>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api`
Expected: PASS (resources 9, queryClient 4, plus Task 4's tests).

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 6: Realtime (event schemas, filter, reconnect, activity, cache mapping)

**Files:**
- Create: `web/src/realtime/events.ts`, `filter.ts`, `backoff.ts`, `connection.ts`, `activity.ts`, `knownJobs.ts`, `applyEvent.ts`, `handleMessage.ts`, `openRealtime.ts`, `useActivity.ts` (all under `web/src/realtime/`)
- Test: `web/tests/unit/support/fakeSocket.ts`, `web/tests/unit/realtime/backoff.test.ts`, `filter.test.ts`, `connection.test.ts`, `activity.test.ts`, `handleMessage.test.ts` (under `web/tests/unit/realtime/`)

**Interfaces:**
- Consumes: `queryKeys`, `api`, `JobListPage`, `CrawlJob`, `fetchCrawlJobs` (Task 5); `redirectToLogin` (Task 4); `WS_URL` (Task 1).
- Produces:
  - `realtimeEventSchema`, `RealtimeEvent`, `RealtimeEventType`, `EventOf<K>`, `ProgressEvent`, `FinishEvent`, `ActivityEvent`, `isFinishEvent`, `parseRealtimeMessage(raw: string): RealtimeEvent | null` (`@/realtime/events`).
  - `FilterContext { userId: number; isKnownJob(jobId: string): boolean }`, `scopedJobId(event)`, `acceptEvent(event, context): boolean` (`@/realtime/filter`).
  - `BACKOFF_BASE_MS = 1000`, `BACKOFF_MAX_MS = 30000`, `backoffDelay(attempt): number` (`@/realtime/backoff`).
  - `POLICY_VIOLATION_CLOSE_CODE = 1008`, `RealtimeSocket`, `ConnectionOptions`, `class RealtimeConnection { start(); close() }` (`@/realtime/connection`).
  - `ActivityStep`, `ActivityOutcome`, `ActivityTask`, `FinishedTask`, `ActivityState`, `EMPTY_ACTIVITY`, `sourceLabel`, `activityFromCrawlJobs`, `reduceActivity(state, event, now)`, `progressPercent(task)` (`@/realtime/activity`).
  - `isJobInCache(queryClient, jobId)` (`@/realtime/knownJobs`); `RealtimeDeps { queryClient; now(): number; onGlobalError(): void }`, `applyEvent(event, deps)` (`@/realtime/applyEvent`); `handleRealtimeMessage(raw, userId, deps)` (`@/realtime/handleMessage`); `openRealtime(userId, deps): RealtimeConnection` (`@/realtime/openRealtime`); `useActivity(enabled: boolean): ActivityState` (`@/realtime/useActivity`).

**Decision:** event payloads follow backend change B3 (every user event has a top-level `user_id`; only `ai_error` and `ai_error_cleared` may lack it). Crawl events use `job_id` for the crawl run, while `job_update`, `job_updated` and `interview_prep_ready` refer to job postings and are dropped unless the job is in a loaded query. The new `template_ready` event (B3) is typed as `{type, user_id}` only, because the spec does not define more fields; it invalidates `["templates"]`. Background activity is a query (`["activity"]`) seeded from `GET /scraper/crawl-status` and patched by events, so TanStack Query stays the only state store.

- [ ] **Step 1: Write the test support and failing tests**

`web/tests/unit/support/fakeSocket.ts`:

```ts
import type { RealtimeSocket } from "@/realtime/connection";

/** Stands in for the browser WebSocket; tests drive its lifecycle explicitly. */
export class FakeSocket implements RealtimeSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  receive(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  drop(code: number): void {
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

export function createSocketFactory() {
  const sockets: FakeSocket[] = [];
  const create = (url: string): FakeSocket => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  return { sockets, create };
}
```

`web/tests/unit/realtime/backoff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backoffDelay } from "@/realtime/backoff";

describe("backoffDelay", () => {
  it.each([
    [0, 1_000],
    [1, 2_000],
    [2, 4_000],
    [4, 16_000],
    [5, 30_000],
    [12, 30_000],
  ])("attempt %i waits %i ms", (attempt, delay) => {
    expect(backoffDelay(attempt)).toBe(delay);
  });
});
```

`web/tests/unit/realtime/filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRealtimeMessage, type RealtimeEvent } from "@/realtime/events";
import { acceptEvent, type FilterContext } from "@/realtime/filter";

const USER_ID = 7;
const OTHER_USER_ID = 8;
const contextKnowing = (...jobIds: string[]): FilterContext => ({
  userId: USER_ID,
  isKnownJob: (jobId) => jobIds.includes(jobId),
});

describe("parseRealtimeMessage", () => {
  it("parses a valid event and strips fields the UI does not use", () => {
    const raw = JSON.stringify({ type: "new_job", user_id: USER_ID, crawl_job_id: "c1", job: { id: "j1", title: "Dev" } });
    expect(parseRealtimeMessage(raw)).toEqual({ type: "new_job", user_id: USER_ID, job: { id: "j1" } });
  });

  it("drops frames that are not JSON", () => {
    expect(parseRealtimeMessage("ping")).toBeNull();
  });

  it("drops unknown event types", () => {
    expect(parseRealtimeMessage(JSON.stringify({ type: "job_skipped", user_id: USER_ID, job_id: "c1" }))).toBeNull();
  });

  it("drops a user event without a top-level user_id", () => {
    expect(parseRealtimeMessage(JSON.stringify({ type: "new_job", job: { id: "j1", user_id: USER_ID } }))).toBeNull();
  });
});

describe("acceptEvent", () => {
  const newJob = (userId: number): RealtimeEvent => ({ type: "new_job", user_id: userId, job: { id: "j1" } });

  it("accepts the current user's events", () => {
    expect(acceptEvent(newJob(USER_ID), contextKnowing())).toBe(true);
  });

  it("drops another user's events", () => {
    expect(acceptEvent(newJob(OTHER_USER_ID), contextKnowing())).toBe(false);
  });

  it("accepts the whitelisted global events", () => {
    expect(acceptEvent({ type: "ai_error" }, contextKnowing())).toBe(true);
  });

  it("drops updates for jobs this tab never loaded", () => {
    const update: RealtimeEvent = { type: "job_update", user_id: USER_ID, job_id: "j9" };
    expect(acceptEvent(update, contextKnowing("j1"))).toBe(false);
  });

  it("accepts updates for loaded jobs, including the nested id of job_updated", () => {
    const updated: RealtimeEvent = { type: "job_updated", user_id: USER_ID, job: { id: "j1" } };
    expect(acceptEvent(updated, contextKnowing("j1"))).toBe(true);
  });
});
```

`web/tests/unit/realtime/connection.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "@/realtime/backoff";
import {
  POLICY_VIOLATION_CLOSE_CODE,
  RealtimeConnection,
  type ConnectionOptions,
} from "@/realtime/connection";
import { createSocketFactory } from "../support/fakeSocket";

const ABNORMAL_CLOSE_CODE = 1006;

function connect(overrides: Partial<ConnectionOptions> = {}) {
  const factory = createSocketFactory();
  const options: ConnectionOptions = {
    url: "ws://api.test/ws",
    createSocket: factory.create,
    onMessage: vi.fn(),
    onReconnected: vi.fn(),
    onAuthRejected: vi.fn(async () => true),
    ...overrides,
  };
  const connection = new RealtimeConnection(options);
  connection.start();
  return { connection, options, sockets: factory.sockets };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeConnection", () => {
  it("forwards messages as strings", () => {
    const { options, sockets } = connect();
    sockets[0].receive('{"type":"ai_error"}');
    expect(options.onMessage).toHaveBeenCalledWith('{"type":"ai_error"}');
  });

  it("reconnects with exponential backoff", async () => {
    const { sockets } = connect();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS - 1);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(2 * BACKOFF_BASE_MS);
    expect(sockets).toHaveLength(3);
  });

  it("resets the backoff after a successful open", async () => {
    const { sockets } = connect();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    sockets[1].open();
    sockets[1].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(sockets).toHaveLength(3);
  });

  it("reports a reconnect only after the first open", async () => {
    const { options, sockets } = connect();
    sockets[0].open();
    expect(options.onReconnected).not.toHaveBeenCalled();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    sockets[1].open();
    expect(options.onReconnected).toHaveBeenCalledTimes(1);
  });

  it("refreshes the session on close code 1008 and reconnects", async () => {
    const { options, sockets } = connect();
    sockets[0].drop(POLICY_VIOLATION_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(options.onAuthRejected).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
  });

  it("stops reconnecting on 1008 when the session cannot be refreshed", async () => {
    const { sockets } = connect({ onAuthRejected: vi.fn(async () => false) });
    sockets[0].drop(POLICY_VIOLATION_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
  });

  it("closes the socket and stops reconnecting after close()", async () => {
    const { connection, sockets } = connect();
    connection.close();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets[0].closed).toBe(true);
    expect(sockets).toHaveLength(1);
  });
});
```

`web/tests/unit/realtime/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  progressPercent,
  reduceActivity,
  sourceLabel,
  type ActivityTask,
} from "@/realtime/activity";
import type { ActivityEvent } from "@/realtime/events";

const NOW = Date.UTC(2026, 9, 8, 12, 0);
const USER = { user_id: 7 };
const STEPSTONE = "https://www.stepstone.de/jobs/kotlin";
const started: ActivityEvent = { type: "crawl_job_started", ...USER, job_id: "c1", platform: STEPSTONE };
const task = (overrides: Partial<ActivityTask>): ActivityTask => ({
  id: "c1",
  source: "www.stepstone.de",
  step: "starting",
  done: 0,
  total: 0,
  ...overrides,
});

describe("reduceActivity", () => {
  it("adds a task on start with the platform host as its source", () => {
    expect(reduceActivity(EMPTY_ACTIVITY, started, NOW).running).toEqual([task({})]);
  });

  it("tracks link collection progress", () => {
    const progress: ActivityEvent = { type: "crawl_job_progress", ...USER, job_id: "c1", platform: STEPSTONE, total: 12, scraping_completed: 5 };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), progress, NOW);
    expect(state.running).toEqual([task({ step: "collecting", done: 5, total: 12 })]);
  });

  it("keeps the source when later events carry no platform", () => {
    const extracting: ActivityEvent = { type: "crawl_job_extracting", ...USER, job_id: "c1", extracting_count: 3, total: 9 };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), extracting, NOW);
    expect(state.running).toEqual([task({ step: "extracting", done: 3, total: 9 })]);
  });

  it("creates a task for progress that arrives before its start event", () => {
    const analysing: ActivityEvent = { type: "job_analysis_started", ...USER, job_id: "c2", analysis_completed: 1 };
    expect(reduceActivity(EMPTY_ACTIVITY, analysing, NOW).running).toEqual([
      task({ id: "c2", source: "", step: "analysing", done: 1 }),
    ]);
  });

  it("keeps the order of running tasks on progress", () => {
    const second: ActivityEvent = { type: "crawl_job_started", ...USER, job_id: "c2", platform: "https://de.indeed.com" };
    const progress: ActivityEvent = { type: "crawl_job_progress", ...USER, job_id: "c1", platform: STEPSTONE, total: 4 };
    const state = [started, second, progress].reduce((current, event) => reduceActivity(current, event, NOW), EMPTY_ACTIVITY);
    expect(state.running.map((entry) => entry.id)).toEqual(["c1", "c2"]);
  });

  it("moves a completed crawl to lastFinished", () => {
    const completed: ActivityEvent = { type: "crawl_job_completed", ...USER, job_id: "c1" };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), completed, NOW);
    expect(state).toEqual({
      running: [],
      lastFinished: { id: "c1", source: "www.stepstone.de", outcome: "completed", finishedAt: NOW },
    });
  });

  it("records failed crawls with their outcome", () => {
    const failed: ActivityEvent = { type: "crawl_job_failed", ...USER, job_id: "c1" };
    expect(reduceActivity(EMPTY_ACTIVITY, failed, NOW).lastFinished?.outcome).toBe("failed");
  });
});

describe("activityFromCrawlJobs", () => {
  it("seeds running crawls and skips finished ones", () => {
    const state = activityFromCrawlJobs([
      { job_id: "c1", platform: STEPSTONE, status: "crawling", total: 12, scraping_completed: 5 },
      { job_id: "c2", platform: STEPSTONE, status: "completed", total: 3, scraping_completed: 3 },
    ]);
    expect(state).toEqual({ running: [task({ step: "collecting", done: 5, total: 12 })], lastFinished: null });
  });
});

describe("progressPercent", () => {
  it.each([
    [0, 0, 5],
    [0, 12, 5],
    [5, 12, 42],
    [13, 12, 100],
  ])("%i of %i shows %i %%", (done, total, percent) => {
    expect(progressPercent(task({ done, total }))).toBe(percent);
  });
});

describe("sourceLabel", () => {
  it("returns a value that is not a URL unchanged", () => {
    expect(sourceLabel("stepstone.de")).toBe("stepstone.de");
  });
});
```

`web/tests/unit/realtime/handleMessage.test.ts`:

```ts
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import type { ActivityState } from "@/realtime/activity";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";

const USER_ID = 7;
const OTHER_USER_ID = 8;
const NOW = Date.UTC(2026, 9, 8, 12, 0);
const LIST_KEY = ["jobs", { tab: "new" }];

function setup() {
  const queryClient = new QueryClient();
  const onGlobalError = vi.fn();
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError };
  const send = (event: object) => handleRealtimeMessage(JSON.stringify(event), USER_ID, deps);
  return { queryClient, onGlobalError, deps, send };
}

const isInvalidated = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

describe("handleRealtimeMessage", () => {
  it("invalidates the counts for the user's new job", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobCounts, { status_counts: {} });
    send({ type: "new_job", user_id: USER_ID, job: { id: "j1" } });
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(true);
  });

  it("ignores another user's new job", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobCounts, { status_counts: {} });
    send({ type: "new_job", user_id: OTHER_USER_ID, job: { id: "j1" } });
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(false);
  });

  it("ignores updates for jobs that are not in any loaded query", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    send({ type: "job_update", user_id: USER_ID, job_id: "j2" });
    expect(isInvalidated(queryClient, LIST_KEY)).toBe(false);
  });

  it("invalidates the lists when a loaded job changes", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    send({ type: "job_update", user_id: USER_ID, job_id: "j1" });
    expect(isInvalidated(queryClient, LIST_KEY)).toBe(true);
  });

  it("records crawl progress in the activity cache", () => {
    const { queryClient, send } = setup();
    send({ type: "crawl_job_started", user_id: USER_ID, job_id: "c1", platform: "https://www.stepstone.de/jobs" });
    expect(queryClient.getQueryData<ActivityState>(queryKeys.activity)?.running[0]?.source).toBe("www.stepstone.de");
  });

  it("reports the user's background errors", () => {
    const { onGlobalError, send } = setup();
    send({ type: "global_error", user_id: USER_ID, message: "Kein Profil" });
    expect(onGlobalError).toHaveBeenCalledTimes(1);
  });

  it("drops malformed frames without side effects", () => {
    const { queryClient, onGlobalError, deps } = setup();
    handleRealtimeMessage("{not json", USER_ID, deps);
    expect(onGlobalError).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/realtime`
Expected: FAIL with `Failed to resolve import "@/realtime/backoff"` (and the other new modules).

- [ ] **Step 3: Implement events, filter and backoff**

`web/src/realtime/events.ts`:

```ts
import { z } from "zod";

// Backend change B3: every user-related event carries a top-level user_id.
const userScoped = { user_id: z.number().int() };
// Crawl events use job_id for the crawl run, not for a job posting.
const crawlRun = { ...userScoped, job_id: z.string() };
const jobRef = z.object({ id: z.string() });

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("crawl_job_started"), ...crawlRun, platform: z.string() }),
  z.object({
    type: z.literal("crawl_job_progress"),
    ...crawlRun,
    platform: z.string(),
    total: z.number(),
    scraping_completed: z.number().optional(),
  }),
  z.object({ type: z.literal("crawl_job_extracting"), ...crawlRun, extracting_count: z.number(), total: z.number() }),
  z.object({ type: z.literal("job_analysis_started"), ...crawlRun, analysis_completed: z.number() }),
  z.object({ type: z.literal("crawl_job_completed"), ...crawlRun }),
  z.object({ type: z.literal("crawl_job_failed"), ...crawlRun }),
  z.object({ type: z.literal("crawl_job_cancelled"), ...crawlRun }),
  z.object({ type: z.literal("crawl_completed"), ...userScoped }),
  z.object({ type: z.literal("new_job"), ...userScoped, job: jobRef }),
  z.object({ type: z.literal("job_updated"), ...userScoped, job: jobRef }),
  z.object({ type: z.literal("job_update"), ...userScoped, job_id: z.string() }),
  z.object({ type: z.literal("interview_prep_ready"), ...userScoped, job_id: z.string() }),
  z.object({ type: z.literal("company_profile_ready"), ...userScoped, domain: z.string() }),
  z.object({ type: z.literal("template_ready"), ...userScoped }),
  z.object({ type: z.literal("global_error"), ...userScoped }),
  // The only events the server may broadcast without user_id (B3 whitelist).
  z.object({ type: z.literal("ai_error") }),
  z.object({ type: z.literal("ai_error_cleared") }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent["type"];
export type EventOf<K extends RealtimeEventType> = Extract<RealtimeEvent, { type: K }>;

export const PROGRESS_EVENT_TYPES = [
  "crawl_job_started",
  "crawl_job_progress",
  "crawl_job_extracting",
  "job_analysis_started",
] as const;
export const FINISH_EVENT_TYPES = ["crawl_job_completed", "crawl_job_failed", "crawl_job_cancelled"] as const;

export type ProgressEvent = EventOf<(typeof PROGRESS_EVENT_TYPES)[number]>;
export type FinishEvent = EventOf<(typeof FINISH_EVENT_TYPES)[number]>;
export type ActivityEvent = ProgressEvent | FinishEvent;

export function isFinishEvent(event: ActivityEvent): event is FinishEvent {
  return (FINISH_EVENT_TYPES as readonly string[]).includes(event.type);
}

/** Validates one WebSocket frame; anything unknown or malformed becomes null and is dropped. */
export function parseRealtimeMessage(raw: string): RealtimeEvent | null {
  try {
    const parsed = realtimeEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON (e.g. a proxy keep-alive frame): nothing to apply.
    return null;
  }
}
```

`web/src/realtime/filter.ts`:

```ts
import type { RealtimeEvent } from "./events";

export interface FilterContext {
  userId: number;
  isKnownJob: (jobId: string) => boolean;
}

/** The job posting an event patches, or null when the event is not about one job. */
export function scopedJobId(event: RealtimeEvent): string | null {
  switch (event.type) {
    case "job_updated":
      return event.job.id;
    case "job_update":
    case "interview_prep_ready":
      return event.job_id;
    default:
      return null;
  }
}

/**
 * Spec 6: never trust the socket blindly. Drop events for other users and for jobs this tab has
 * not loaded. Only the whitelisted global events come without user_id (enforced by the schema).
 */
export function acceptEvent(event: RealtimeEvent, context: FilterContext): boolean {
  if (!("user_id" in event)) return true;
  if (event.user_id !== context.userId) return false;
  const jobId = scopedJobId(event);
  return jobId === null || context.isKnownJob(jobId);
}
```

`web/src/realtime/backoff.ts`:

```ts
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** Exponential reconnect delay: 1 s, 2 s, 4 s ... capped at 30 s (spec 6). */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
}
```

- [ ] **Step 4: Implement the connection**

`web/src/realtime/connection.ts`:

```ts
import { backoffDelay } from "./backoff";

/** Close code the API uses for a missing, expired or revoked access token. */
export const POLICY_VIOLATION_CLOSE_CODE = 1008;

/** The part of the browser WebSocket this module uses; tests provide a fake. */
export interface RealtimeSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

export interface ConnectionOptions {
  url: string;
  createSocket: (url: string) => RealtimeSocket;
  onMessage: (data: string) => void;
  /** Runs after every open except the first; the app refetches active queries here. */
  onReconnected: () => void;
  /** Runs on close code 1008; resolve false to stop reconnecting because the session is gone. */
  onAuthRejected: () => Promise<boolean>;
}

/** One socket per tab with exponential reconnect. The server ignores client messages, so it only listens. */
export class RealtimeConnection {
  private attempt = 0;
  private hasOpened = false;
  private stopped = false;
  private socket: RealtimeSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: ConnectionOptions) {}

  start(): void {
    this.open();
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }

  private open(): void {
    const socket = this.options.createSocket(this.options.url);
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (event) => this.options.onMessage(String(event.data));
    socket.onclose = (event) => void this.handleClose(event.code);
    this.socket = socket;
  }

  private handleOpen(): void {
    if (this.hasOpened) this.options.onReconnected();
    this.hasOpened = true;
    this.attempt = 0;
  }

  private async handleClose(code: number): Promise<void> {
    if (this.stopped) return;
    if (code === POLICY_VIOLATION_CLOSE_CODE && !(await this.options.onAuthRejected())) return;
    // close() may have run while the refresh was pending.
    if (this.stopped) return;
    this.timer = setTimeout(() => this.open(), backoffDelay(this.attempt));
    this.attempt += 1;
  }
}
```

- [ ] **Step 5: Implement activity, cache mapping and wiring**

`web/src/realtime/activity.ts`:

```ts
import type { CrawlJob } from "@/api/crawl";
import { isFinishEvent, type ActivityEvent, type EventOf, type FinishEvent, type ProgressEvent } from "./events";

export type ActivityStep = "starting" | "collecting" | "extracting" | "analysing";
export type ActivityOutcome = "completed" | "failed" | "cancelled";

export interface ActivityTask {
  id: string;
  source: string;
  step: ActivityStep;
  done: number;
  total: number;
}

export interface FinishedTask {
  id: string;
  source: string;
  outcome: ActivityOutcome;
  finishedAt: number;
}

export interface ActivityState {
  running: readonly ActivityTask[];
  lastFinished: FinishedTask | null;
}

export const EMPTY_ACTIVITY: ActivityState = { running: [], lastFinished: null };

const FINISHED_CRAWL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const OUTCOME_BY_EVENT: Readonly<Record<FinishEvent["type"], ActivityOutcome>> = {
  crawl_job_completed: "completed",
  crawl_job_failed: "failed",
  crawl_job_cancelled: "cancelled",
};
const MIN_VISIBLE_PERCENT = 5;
const FULL_PERCENT = 100;

type ProgressUpdaters = {
  [K in ProgressEvent["type"]]: (task: ActivityTask, event: EventOf<K>) => ActivityTask;
};

const PROGRESS_UPDATERS: ProgressUpdaters = {
  crawl_job_started: (task, event) => ({ ...task, source: sourceLabel(event.platform), step: "starting" }),
  crawl_job_progress: (task, event) => ({
    ...task,
    source: sourceLabel(event.platform),
    step: "collecting",
    done: event.scraping_completed ?? 0,
    total: event.total,
  }),
  crawl_job_extracting: (task, event) => ({
    ...task,
    step: "extracting",
    done: event.extracting_count,
    total: event.total,
  }),
  job_analysis_started: (task, event) => ({ ...task, step: "analysing", done: event.analysis_completed }),
};

/** A platform URL's host; values that are not URLs (old bare hosts) are shown as they are. */
export function sourceLabel(platformUrl: string): string {
  try {
    return new URL(platformUrl).host;
  } catch {
    return platformUrl;
  }
}

/** Seeds the state from GET /scraper/crawl-status after a load or reconnect. */
export function activityFromCrawlJobs(jobs: readonly CrawlJob[]): ActivityState {
  const running = jobs.filter((job) => !FINISHED_CRAWL_STATUSES.has(job.status)).map(taskFromCrawlJob);
  return { running, lastFinished: null };
}

/** Applies one crawl event; `now` is injected so the reducer stays pure. */
export function reduceActivity(state: ActivityState, event: ActivityEvent, now: number): ActivityState {
  if (isFinishEvent(event)) return finishTask(state, event, now);
  const previous = state.running.find((task) => task.id === event.job_id);
  return { ...state, running: upsertTask(state.running, progressTask(previous, event)) };
}

/** Bar width in percent; never below 5 so a task that just started still shows. */
export function progressPercent(task: ActivityTask): number {
  if (task.total <= 0) return MIN_VISIBLE_PERCENT;
  const percent = Math.round((task.done / task.total) * FULL_PERCENT);
  return Math.min(FULL_PERCENT, Math.max(MIN_VISIBLE_PERCENT, percent));
}

function taskFromCrawlJob(job: CrawlJob): ActivityTask {
  const step: ActivityStep = job.status === "starting" ? "starting" : "collecting";
  return { id: job.job_id, source: sourceLabel(job.platform), step, done: job.scraping_completed, total: job.total };
}

function progressTask(previous: ActivityTask | undefined, event: ProgressEvent): ActivityTask {
  const base: ActivityTask = previous ?? { id: event.job_id, source: "", step: "starting", done: 0, total: 0 };
  // TypeScript cannot correlate the updater with the event's own type; the mapped type guarantees it.
  const update = PROGRESS_UPDATERS[event.type] as (task: ActivityTask, event: ProgressEvent) => ActivityTask;
  return update(base, event);
}

function upsertTask(tasks: readonly ActivityTask[], next: ActivityTask): ActivityTask[] {
  const exists = tasks.some((task) => task.id === next.id);
  return exists ? tasks.map((task) => (task.id === next.id ? next : task)) : [...tasks, next];
}

function finishTask(state: ActivityState, event: FinishEvent, now: number): ActivityState {
  const finished = state.running.find((task) => task.id === event.job_id);
  const outcome = OUTCOME_BY_EVENT[event.type];
  return {
    running: state.running.filter((task) => task.id !== event.job_id),
    lastFinished: { id: event.job_id, source: finished?.source ?? "", outcome, finishedAt: now },
  };
}
```

`web/src/realtime/knownJobs.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { JobListPage } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";

/** True when this tab holds the job in a detail query or in any loaded list page. */
export function isJobInCache(queryClient: QueryClient, jobId: string): boolean {
  if (queryClient.getQueryData(queryKeys.job(jobId)) !== undefined) return true;
  return queryClient
    .getQueriesData<JobListPage>({ queryKey: queryKeys.jobsRoot })
    .some(([, page]) => page?.items.some((item) => item.id === jobId) ?? false);
}
```

`web/src/realtime/applyEvent.ts`:

```ts
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_ACTIVITY, reduceActivity, type ActivityState } from "./activity";
import type { ActivityEvent, EventOf, FinishEvent, RealtimeEvent, RealtimeEventType } from "./events";

export interface RealtimeDeps {
  queryClient: QueryClient;
  now: () => number;
  onGlobalError: () => void;
}

type Handler<E> = (event: E, deps: RealtimeDeps) => void;

function invalidate(deps: RealtimeDeps, ...keys: QueryKey[]): void {
  keys.forEach((queryKey) => void deps.queryClient.invalidateQueries({ queryKey }));
}

function patchActivity(event: ActivityEvent, deps: RealtimeDeps): void {
  deps.queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
    reduceActivity(state ?? EMPTY_ACTIVITY, event, deps.now()),
  );
}

function finishCrawl(event: FinishEvent, deps: RealtimeDeps): void {
  patchActivity(event, deps);
  invalidate(deps, queryKeys.platforms, queryKeys.jobsRoot, queryKeys.jobCounts);
}

// One entry per event type: a new event type fails the type check until it is handled here.
const HANDLERS: { [K in RealtimeEventType]: Handler<EventOf<K>> } = {
  crawl_job_started: patchActivity,
  crawl_job_progress: patchActivity,
  crawl_job_extracting: patchActivity,
  job_analysis_started: patchActivity,
  crawl_job_completed: finishCrawl,
  crawl_job_failed: finishCrawl,
  crawl_job_cancelled: finishCrawl,
  crawl_completed: (_event, deps) => invalidate(deps, queryKeys.platforms),
  new_job: (_event, deps) => invalidate(deps, queryKeys.jobsRoot, queryKeys.jobCounts),
  job_updated: (event, deps) => invalidate(deps, queryKeys.job(event.job.id), queryKeys.jobsRoot),
  job_update: (event, deps) => invalidate(deps, queryKeys.job(event.job_id), queryKeys.jobsRoot),
  interview_prep_ready: (event, deps) => invalidate(deps, queryKeys.job(event.job_id)),
  company_profile_ready: (event, deps) => invalidate(deps, queryKeys.company(event.domain)),
  template_ready: (_event, deps) => invalidate(deps, queryKeys.templates),
  global_error: (_event, deps) => deps.onGlobalError(),
  ai_error: (_event, deps) => invalidate(deps, queryKeys.systemStatus),
  ai_error_cleared: (_event, deps) => invalidate(deps, queryKeys.systemStatus),
};

/** Maps one accepted event onto the query cache (spec 6: realtime -> cache updates). */
export function applyEvent(event: RealtimeEvent, deps: RealtimeDeps): void {
  // TypeScript cannot correlate HANDLERS[event.type] with the event's own type; the map guarantees it.
  const handler = HANDLERS[event.type] as Handler<RealtimeEvent>;
  handler(event, deps);
}
```

`web/src/realtime/handleMessage.ts`:

```ts
import { applyEvent, type RealtimeDeps } from "./applyEvent";
import { parseRealtimeMessage } from "./events";
import { acceptEvent } from "./filter";
import { isJobInCache } from "./knownJobs";

/** Parses, filters and applies one raw frame; anything invalid or foreign is dropped. */
export function handleRealtimeMessage(raw: string, userId: number, deps: RealtimeDeps): void {
  const event = parseRealtimeMessage(raw);
  if (!event) return;
  const context = { userId, isKnownJob: (jobId: string) => isJobInCache(deps.queryClient, jobId) };
  if (acceptEvent(event, context)) applyEvent(event, deps);
}
```

`web/src/realtime/openRealtime.ts` (wiring only; exercised end-to-end by Task 12's mocked socket):

```ts
import { api } from "@/api/instance";
import { redirectToLogin } from "@/api/session";
import { WS_URL } from "@/config";
import type { RealtimeDeps } from "./applyEvent";
import { RealtimeConnection } from "./connection";
import { handleRealtimeMessage } from "./handleMessage";

/** Opens the tab's single socket for the signed-in user. */
export function openRealtime(userId: number, deps: RealtimeDeps): RealtimeConnection {
  const connection = new RealtimeConnection({
    url: WS_URL,
    createSocket: (url) => new WebSocket(url),
    onMessage: (raw) => handleRealtimeMessage(raw, userId, deps),
    // Events may have been missed while disconnected (spec 6).
    onReconnected: () => void deps.queryClient.refetchQueries({ type: "active" }),
    onAuthRejected: reauthenticate,
  });
  connection.start();
  return connection;
}

async function reauthenticate(): Promise<boolean> {
  try {
    const refreshed = await api.refreshSession();
    if (!refreshed) redirectToLogin();
    return refreshed;
  } catch {
    // Network trouble, not an expired session: keep reconnecting with backoff.
    return true;
  }
}
```

`web/src/realtime/useActivity.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCrawlJobs } from "@/api/crawl";
import { queryKeys } from "@/api/queryKeys";
import { activityFromCrawlJobs, EMPTY_ACTIVITY, type ActivityState } from "./activity";

async function fetchActivity(): Promise<ActivityState> {
  return activityFromCrawlJobs(await fetchCrawlJobs());
}

/** Background tasks: seeded from the scraper, then kept current by realtime events. */
export function useActivity(enabled: boolean): ActivityState {
  // Realtime patches this entry, so it must not go stale by time.
  const query = useQuery({ queryKey: queryKeys.activity, queryFn: fetchActivity, staleTime: Infinity, enabled });
  return query.data ?? EMPTY_ACTIVITY;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/realtime`
Expected: PASS (backoff 6, filter 9, connection 7, activity 13, handleMessage 7).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 7: UI primitives, part 1 (controls and score)

**Files:**
- Create: `web/src/ui/cx.ts`, `Icon.tsx`, `Button.tsx`, `Tag.tsx`, `Chip.tsx`, `Seg.tsx`, `Field.tsx`, `Select.tsx`, `CountBadge.tsx`, `Notice.tsx`, `ScoreMeter.tsx` (under `web/src/ui/`), `web/src/ui/styles/controls.css`
- Create: `web/src/domain/scoreBand.ts`
- Modify: `web/app/globals.css` (add `@import "../src/ui/styles/controls.css";` below the `base.css` import)
- Test: `web/tests/unit/domain/scoreBand.test.ts`, `web/tests/unit/ui/controls.test.tsx`

**Interfaces:**
- Consumes: `useI18n`, `MessageKey` (Task 3).
- Produces:
  - `cx(...parts: Array<string | false | null | undefined>): string` (`@/ui/cx`).
  - `Icon({ icon: LucideIcon; size?: "md" | "lg"; className? })` - stroke 1.75 (`@/ui/Icon`).
  - `Button(props: ButtonHTMLAttributes & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "md" | "sm"; icon?: LucideIcon; iconOnly?: boolean; busy?: boolean })` (`@/ui/Button`).
  - `Tag({ children })`, `Chip({ pressed, onToggle, children })`, `Seg<T>({ options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void; label: string })`.
  - `Field({ id, label, hint?, error?, children })`, `TextField({ id, label, hint?, error?, ...inputProps })`, `describedBy({ id, hint?, error? })` (`@/ui/Field`); `Select({ ...selectProps, children })` (`@/ui/Select`).
  - `CountBadge({ count, label })`, `Notice({ tone?: "info" | "warn" | "error"; children })`, `ScoreMeter({ score })`.
  - `ScoreBand`, `STRONG_SCORE_MIN = 80`, `POSSIBLE_SCORE_MIN = 60`, `roundScore(score)`, `scoreBand(score)` (`@/domain/scoreBand`).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/scoreBand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roundScore, scoreBand } from "@/domain/scoreBand";

describe("scoreBand", () => {
  it.each([
    [100, "strong"],
    [80, "strong"],
    [79, "possible"],
    [60, "possible"],
    [59, "weak"],
    [0, "weak"],
  ] as const)("%i is %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe("roundScore", () => {
  it("rounds the float match score for display", () => {
    expect(roundScore(79.5)).toBe(80);
  });

  it("clamps values outside 0..100", () => {
    expect(roundScore(-3)).toBe(0);
    expect(roundScore(104)).toBe(100);
  });
});
```

`web/tests/unit/ui/controls.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { CountBadge } from "@/ui/CountBadge";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { ScoreMeter } from "@/ui/ScoreMeter";
import { Seg } from "@/ui/Seg";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Speichern</Button>);
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAttribute("type", "button");
  });

  it("maps the variant to the prototype class", () => {
    render(<Button variant="primary" icon={Inbox}>Vormerken</Button>);
    expect(screen.getByRole("button", { name: "Vormerken" })).toHaveClass("btn", "btn-primary");
  });

  it("marks a busy button for assistive technology", () => {
    render(<Button busy>Erzeugen</Button>);
    expect(screen.getByRole("button", { name: "Erzeugen" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("Seg", () => {
  const OPTIONS = [
    { value: "light", label: "Hell" },
    { value: "dark", label: "Dunkel" },
  ] as const;

  it("marks the selected option and reports a new choice", async () => {
    const onChange = vi.fn();
    render(<Seg options={OPTIONS} value="light" onChange={onChange} label="Darstellung" />);
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Dunkel" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});

describe("Chip", () => {
  it("toggles through onToggle", async () => {
    const onToggle = vi.fn();
    render(<Chip pressed={false} onToggle={onToggle}>Remote</Chip>);
    await userEvent.click(screen.getByRole("button", { name: "Remote" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("TextField", () => {
  it("labels the input and links hint and error", () => {
    render(<TextField id="role" label="Rolle" hint="Wie im Lebenslauf" error="Bitte ausfüllen." />);
    const input = screen.getByLabelText("Rolle");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Wie im Lebenslauf Bitte ausfüllen.");
  });

  it("is not marked invalid without an error", () => {
    render(<TextField id="role" label="Rolle" />);
    expect(screen.getByLabelText("Rolle")).not.toHaveAttribute("aria-invalid");
  });
});

describe("CountBadge", () => {
  it("shows the number and announces the label", () => {
    render(<CountBadge count={3} label="3 neue Treffer" />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("3 neue Treffer")).toHaveClass("sr-only");
  });
});

describe("Notice", () => {
  it("announces errors as alerts", () => {
    render(<Notice tone="error">Laden fehlgeschlagen.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Laden fehlgeschlagen.");
  });
});

describe("ScoreMeter", () => {
  it("shows the rounded score with its band word and strong styling", () => {
    const { container } = render(<ScoreMeter score={83.6} />);
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("Stark")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("score", "strong");
  });

  it("explains the score in its title", () => {
    const { container } = render(<ScoreMeter score={42} />);
    expect(container.firstChild).toHaveAttribute("title", "Passung 42 von 100: Schwach");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/ui/controls.test.tsx`
Expected: FAIL with `Failed to resolve import "@/domain/scoreBand"` (and the ui modules).

- [ ] **Step 3: Implement the score band and helpers**

`web/src/domain/scoreBand.ts`:

```ts
export type ScoreBand = "strong" | "possible" | "weak";

// Bands of the prototype: Stark >= 80, Möglich >= 60, Schwach below.
export const STRONG_SCORE_MIN = 80;
export const POSSIBLE_SCORE_MIN = 60;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/** match_score is a float 0..100; the UI shows whole numbers and bands the shown number. */
export function roundScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score)));
}

export function scoreBand(score: number): ScoreBand {
  if (score >= STRONG_SCORE_MIN) return "strong";
  return score >= POSSIBLE_SCORE_MIN ? "possible" : "weak";
}
```

`web/src/ui/cx.ts`:

```ts
/** Joins class names and skips falsy parts. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

`web/src/ui/Icon.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

// Spec 2.3: lucide-react at stroke 1.75; size comes from .ico / .ico-lg in controls.css.
const ICON_STROKE_WIDTH = 1.75;

export interface IconProps {
  icon: LucideIcon;
  size?: "md" | "lg";
  className?: string;
}

/** Decorative icon; the surrounding control carries the accessible name. */
export function Icon({ icon: Glyph, size = "md", className }: IconProps) {
  return (
    <Glyph
      aria-hidden="true"
      focusable="false"
      strokeWidth={ICON_STROKE_WIDTH}
      className={cx("ico", size === "lg" && "ico-lg", className)}
    />
  );
}
```

- [ ] **Step 4: Implement the controls**

`web/src/ui/Button.tsx`:

```tsx
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string | null> = {
  default: null,
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  /** Icon-only buttons need an aria-label. */
  iconOnly?: boolean;
  busy?: boolean;
}

type ButtonLook = Pick<ButtonProps, "variant" | "size" | "iconOnly" | "className">;

export function Button(props: ButtonProps) {
  const { look, icon, busy, dom } = splitButtonProps(props);
  // type="button" first so an explicit type in props wins; buttons never submit by accident.
  return (
    <button type="button" {...dom} className={buttonClasses(look)} aria-busy={busy || undefined}>
      {busy ? <Icon icon={LoaderCircle} className="spin" /> : icon && <Icon icon={icon} />}
      {look.iconOnly ? null : <span>{dom.children}</span>}
    </button>
  );
}

function splitButtonProps({ variant, size, icon, iconOnly, busy, ...dom }: ButtonProps) {
  return { look: { variant, size, iconOnly, className: dom.className }, icon, busy: busy ?? false, dom };
}

function buttonClasses({ variant = "default", size = "md", iconOnly = false, className }: ButtonLook): string {
  return cx("btn", VARIANT_CLASS[variant], size === "sm" && "btn-sm", iconOnly && "btn-icon", className);
}
```

`web/src/ui/Tag.tsx`:

```tsx
import type { ReactNode } from "react";

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}
```

`web/src/ui/Chip.tsx`:

```tsx
import type { ReactNode } from "react";

export interface ChipProps {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Toggle pill for filters (e.g. phase strip, spoken languages). */
export function Chip({ pressed, onToggle, children }: ChipProps) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onToggle}>
      {children}
    </button>
  );
}
```

`web/src/ui/Seg.tsx`:

```tsx
export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export interface SegProps<T extends string> {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Segmented control: one choice of a few, shown side by side. */
export function Seg<T extends string>({ options, value, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

`web/src/ui/Field.tsx`:

```tsx
import { CircleAlert } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

const hintId = (id: string): string => `${id}-hint`;
const errorId = (id: string): string => `${id}-error`;

/** ids for aria-describedby, so screen readers read hint and error with the control. */
export function describedBy({ id, hint, error }: Omit<FieldProps, "label" | "children">): string | undefined {
  const ids = [hint ? hintId(id) : null, error ? errorId(id) : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/** Label, control slot, hint and error. Errors always carry an icon and words (spec 5). */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="hint" id={hintId(id)}>{hint}</p> : null}
      {error ? <FieldError id={errorId(id)} message={error} /> : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className="field-error" id={id}>
      <Icon icon={CircleAlert} />
      <span>{message}</span>
    </p>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ id, label, hint, error, className, ...inputProps }: TextFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={cx("input", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...inputProps}
      />
    </Field>
  );
}
```

`web/src/ui/Select.tsx`:

```tsx
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/** Native select with the prototype's chevron; wrap it in <Field> for label, hint and error. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select">
      <select className={cx("input", className)} {...rest}>
        {children}
      </select>
      <Icon icon={ChevronDown} />
    </span>
  );
}
```

`web/src/ui/CountBadge.tsx`:

```tsx
export interface CountBadgeProps {
  count: number;
  /** Full sentence for screen readers, e.g. "3 neue Treffer". */
  label: string;
}

export function CountBadge({ count, label }: CountBadgeProps) {
  return (
    <span className="count-badge">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
```

`web/src/ui/Notice.tsx`:

```tsx
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type NoticeTone = "info" | "warn" | "error";

const NOTICE_ICON: Record<NoticeTone, LucideIcon> = { info: Info, warn: TriangleAlert, error: CircleAlert };
const NOTICE_CLASS: Record<NoticeTone, string | null> = {
  info: null,
  warn: "notice-warn",
  error: "notice-error",
};

/** Inline banner; errors use crimson with an icon and words (spec 5). */
export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div className={cx("notice", NOTICE_CLASS[tone])} role={tone === "error" ? "alert" : undefined}>
      <Icon icon={NOTICE_ICON[tone]} />
      <div>{children}</div>
    </div>
  );
}
```

`web/src/ui/ScoreMeter.tsx`:

```tsx
"use client";

import { roundScore, scoreBand, type ScoreBand } from "@/domain/scoreBand";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "./cx";

// Vermilion is reserved for strong scores (spec 5); weak scores recede.
const BAND_CLASS: Record<ScoreBand, string | null> = { strong: "strong", possible: null, weak: "weak" };
export const BAND_LABEL: Record<ScoreBand, MessageKey> = {
  strong: "score.strong",
  possible: "score.possible",
  weak: "score.weak",
};

/** List score: a typographic numeral with its band word underneath. */
export function ScoreMeter({ score }: { score: number }) {
  const { t } = useI18n();
  const shown = roundScore(score);
  const band = scoreBand(shown);
  const word = t(BAND_LABEL[band]);
  return (
    <span className={cx("score", BAND_CLASS[band])} title={t("score.title", { score: shown, band: word })}>
      <span className="score-n">{shown}</span>
      <span className="score-w">{word}</span>
    </span>
  );
}
```

- [ ] **Step 5: Port the control styles**

`web/src/ui/styles/controls.css` (rules copied from the prototype's "controls" section; `.field-error` and `.input[aria-invalid]` are new and follow its crimson rule):

```css
/* Controls ported 1:1 from docs/prototype/clickdummy-editorial.html. */
@layer components {
  .ico { width: 16px; height: 16px; flex: none; }
  .ico-lg { width: 20px; height: 20px; }
  .spin { animation: spin 0.9s linear infinite; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    height: var(--ctl-h); padding: 0 14px; border-radius: var(--r-ctl);
    border: 1.5px solid var(--text); background: transparent; color: var(--text);
    font-size: var(--fs-13); font-weight: 600; line-height: 1; white-space: nowrap; cursor: pointer;
    transition: background-color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
    text-decoration: none;
  }
  .btn:hover { background: var(--hover); text-decoration: none; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
  .btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }
  .btn-ghost:hover { background: var(--hover); color: var(--text); }
  .btn-danger { color: var(--danger); border-color: currentColor; }
  .btn-ghost.btn-danger { border-color: transparent; }
  .btn-sm { height: var(--ctl-h-sm); padding: 0 10px; font-size: var(--fs-12); border-width: 1px; }
  .btn-icon { width: var(--ctl-h); padding: 0; }
  .btn-sm.btn-icon { width: var(--ctl-h-sm); }
  .btn[disabled], .btn[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
  .link { background: none; border: 0; padding: 0; color: var(--accent-text); cursor: pointer; font-weight: 600; text-align: left; display: inline-flex; gap: 4px; align-items: center; }
  .link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .row { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
  .row-between { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; }

  .input {
    width: 100%; height: var(--ctl-h); padding: 0 10px; border-radius: var(--r-ctl);
    border: 1px solid var(--line-strong); border-bottom-color: var(--text-3); background: var(--field); color: var(--text); font-size: var(--fs-13);
  }
  .input::placeholder { color: var(--text-3); }
  .input:focus-visible { outline-offset: 0; border-color: var(--focus); }
  .input[aria-invalid="true"] { border-color: var(--danger); }
  textarea.input { height: auto; min-height: 76px; padding: 8px 10px; line-height: 1.55; resize: vertical; }
  .select { position: relative; display: inline-flex; align-items: center; min-width: 0; max-width: 100%; }
  .select select { appearance: none; -webkit-appearance: none; padding-right: 30px; cursor: pointer; text-overflow: ellipsis; }
  .select .ico { position: absolute; right: 9px; pointer-events: none; color: var(--text-3); }
  .field { display: block; }
  .field + .field { margin-top: var(--s4); }
  .label { display: block; font-size: var(--fs-13); font-weight: 600; margin-bottom: 6px; color: var(--text); }
  .hint { font-size: var(--fs-12); color: var(--text-3); margin-top: 5px; line-height: 1.45; }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin-top: 6px; font-size: var(--fs-13); color: var(--danger); }
  .field-error .ico { margin-top: 2px; }
  .check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; padding: 4px 0; }
  .check input { margin: 3px 0 0; accent-color: var(--accent); width: 15px; height: 15px; flex: none; }

  .seg { display: inline-flex; padding: 0; gap: 0; border-radius: var(--r-ctl); border: 1.5px solid var(--text); overflow: hidden; max-width: 100%; }
  .seg button {
    height: calc(var(--ctl-h) - 3px); padding: 0 12px; border: 0; background: transparent; border-radius: 0;
    font-size: var(--fs-12); font-weight: 600; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  }
  .seg button + button { border-left: 1px solid var(--line-strong); }
  .seg button:hover { color: var(--text); background: var(--hover); }
  .seg button[aria-pressed="true"] { background: var(--text); color: var(--bg); }

  .chip {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: var(--r-pill);
    border: 1px solid var(--line-strong); background: var(--surface); font-size: var(--fs-12); font-weight: 600; color: var(--text-2); cursor: pointer;
  }
  .chip:hover { color: var(--text); background: var(--hover); }
  .chip[aria-pressed="true"] { border-color: var(--text); color: var(--bg); background: var(--text); }
  .tag { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; border-radius: var(--r-ctl); background: transparent; border: 1px solid var(--line-strong); font-size: var(--fs-12); font-weight: 500; color: var(--text); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 6px; border-radius: var(--r-pill); font-size: 12px; font-weight: 700; background: var(--accent); color: var(--on-accent); font-variant-numeric: tabular-nums; }
  .count-plain { font-size: var(--fs-12); color: var(--text-3); font-variant-numeric: tabular-nums; font-weight: 600; }

  .score { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 44px; }
  .score-n { font: 650 30px/0.86 var(--font-display); font-optical-sizing: auto; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
  .score-w { font-size: 11.5px; font-weight: 600; color: var(--text-2); line-height: 1; }
  .score.strong .score-n { color: var(--accent-text); }
  .score.weak .score-n { color: var(--text-3); font-weight: 450; }

  .progress { height: 4px; border-radius: 0; background: var(--line); overflow: hidden; }
  .progress > i { display: block; height: 100%; background: var(--accent); transition: width 300ms var(--ease); }

  .notice { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-ctl); background: var(--sunken); border-left: 3px solid var(--line-strong); font-size: var(--fs-13); color: var(--text-2); }
  .notice .ico { margin-top: 2px; }
  .notice-warn { background: var(--warn-soft); border-left-color: var(--warn); color: var(--text); }
  .notice-warn > .ico { color: var(--warn-text); }
  .notice-error { background: var(--danger-soft); border-left-color: var(--danger); color: var(--text); }
  .notice-error > .ico { color: var(--danger); }
  .t-warn { color: var(--warn-text); }
  .t-danger { color: var(--danger); }
  .t-ok { color: var(--ok); }

  /* Mobile: 44px hit targets, 16px inputs (no iOS zoom), spec 4.3 */
  @media (max-width: 767px) {
    .btn { height: 44px; padding: 0 14px; }
    .btn-sm { height: 36px; position: relative; }
    .btn-sm::after { content: ""; position: absolute; inset: -4px; }
    .btn-icon { width: 44px; }
    .btn-sm.btn-icon { width: 36px; }
    .input { height: 44px; font-size: 16px; }
    .seg button { height: 38px; }
    .score-n { font-size: 27px; }
  }
}
```

Then add the import to `web/app/globals.css` directly below `@import "../src/theme/base.css";`:

```css
@import "../src/ui/styles/controls.css";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/ui/controls.test.tsx`
Expected: PASS (scoreBand 8, controls 11).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 8: UI primitives, part 2 (page structure, tabs, stepper)

**Files:**
- Create: `web/src/ui/Masthead.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Tabs.tsx`, `Stepper.tsx` (under `web/src/ui/`), `web/src/ui/styles/layout.css`
- Modify: `web/app/globals.css` (add `@import "../src/ui/styles/layout.css";` below the controls import)
- Test: `web/tests/unit/ui/layout.test.tsx`

**Interfaces:**
- Consumes: `cx`, `Icon` (Task 7); `useI18n` (Task 3).
- Produces:
  - `Masthead({ title: string; number?: string; deck?: ReactNode; actions?: ReactNode; small?: boolean })` - renders the page `<h1>`.
  - `EmptyState({ icon: LucideIcon; title; children; actions? })`.
  - `PageSkeleton()` - loading state of a whole page (skeleton lines, no spinner; spec 6).
  - `TabItem<K>`, `Tabs<K>({ items, selected, onSelect, label, idPrefix })`, `TabPanel({ idPrefix, selected, children })`, `nextTabIndex(key, current, count): number | null` (`@/ui/Tabs`).
  - `StepItem { key; label; date? }`, `StepState`, `stepState(index, currentIndex)`, `Stepper({ steps, currentIndex, label })` - read-only (spec 4.2: "a read-only stepper plus Phase ändern"); phase changes go through the phase menu of phase 2.

**Note:** `A4Preview` (spec 2.3) is not built here; it belongs to the documents tab in phase 2, where the PDF embedding question (see the hand-off notes) is decided.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/ui/layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/ui/EmptyState";
import { Masthead } from "@/ui/Masthead";
import { PageSkeleton } from "@/ui/Skeleton";
import { Stepper } from "@/ui/Stepper";
import { nextTabIndex, TabPanel, Tabs, type TabItem } from "@/ui/Tabs";

type TabKey = "fit" | "docs" | "history";
const TAB_ITEMS: readonly TabItem<TabKey>[] = [
  { key: "fit", label: "Passung" },
  { key: "docs", label: "Unterlagen" },
  { key: "history", label: "Verlauf" },
];

function TabsHarness() {
  const [selected, setSelected] = useState<TabKey>("fit");
  return (
    <>
      <Tabs items={TAB_ITEMS} selected={selected} onSelect={setSelected} label="Bereiche" idPrefix="job" />
      <TabPanel idPrefix="job" selected={selected}>
        Inhalt {selected}
      </TabPanel>
    </>
  );
}

describe("Masthead", () => {
  it("renders the page heading with its section number hidden from screen readers", () => {
    render(<Masthead number="01" title="Eingang" deck="3 neue Treffer" />);
    expect(screen.getByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(screen.getByText("01")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("shows title, text and actions", () => {
    render(
      <EmptyState icon={Inbox} title="Alles gesichtet" actions={<button type="button">Quelle hinzufügen</button>}>
        Neue Treffer erscheinen nach dem nächsten Lauf.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Alles gesichtet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quelle hinzufügen" })).toBeInTheDocument();
  });
});

describe("PageSkeleton", () => {
  it("is a busy region with a translated label", () => {
    render(<PageSkeleton />);
    expect(screen.getByLabelText("Lädt …")).toHaveAttribute("aria-busy", "true");
  });
});

describe("Tabs", () => {
  it("selects a tab by click and links it to the panel", async () => {
    render(<TabsHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Unterlagen" }));
    expect(screen.getByRole("tab", { name: "Unterlagen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Unterlagen" })).toHaveTextContent("Inhalt docs");
  });

  it("moves selection and focus with the arrow keys", async () => {
    render(<TabsHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Passung" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Verlauf" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Verlauf" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("nextTabIndex", () => {
  it.each([
    ["ArrowRight", 2, 0],
    ["ArrowLeft", 0, 2],
    ["Home", 1, 0],
    ["End", 0, 2],
  ])("%s from %i goes to %i of three tabs", (key, current, target) => {
    expect(nextTabIndex(key, current, 3)).toBe(target);
  });

  it("ignores other keys", () => {
    expect(nextTabIndex("Enter", 1, 3)).toBeNull();
  });
});

describe("Stepper", () => {
  const STEPS = [
    { key: "OPEN", label: "Offen" },
    { key: "DRAFTED", label: "Vorgemerkt", date: "07.10." },
    { key: "APPLIED", label: "Beworben" },
  ];

  it("marks past, current and future phases", () => {
    render(<Stepper steps={STEPS} currentIndex={1} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.className)).toEqual(["step past", "step current", "step future"]);
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("is read-only", () => {
    render(<Stepper steps={STEPS} currentIndex={1} label="Phase der Bewerbung" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui/layout.test.tsx`
Expected: FAIL with `Failed to resolve import "@/ui/EmptyState"`.

- [ ] **Step 3: Implement the primitives**

`web/src/ui/Masthead.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface MastheadProps {
  title: string;
  /** Section number of the sequence (01 Eingang ...); decorative, so hidden from screen readers. */
  number?: string;
  deck?: ReactNode;
  actions?: ReactNode;
  small?: boolean;
}

/** Thick rule, section number, display title and a one-line deck, as in the prototype. */
export function Masthead({ title, number, deck, actions, small = false }: MastheadProps) {
  return (
    <header className={cx("mast", small && "mast-sm")}>
      <div className="mast-main">
        <h1 className="mast-title">
          {number ? <span className="mast-no" aria-hidden="true">{number}</span> : null}
          <span>{title}</span>
        </h1>
        {deck ? <p className="mast-deck">{deck}</p> : null}
      </div>
      {actions ? <div className="mast-actions">{actions}</div> : null}
    </header>
  );
}
```

`web/src/ui/EmptyState.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-ico" aria-hidden="true">
        <Icon icon={icon} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}
```

`web/src/ui/Skeleton.tsx`:

```tsx
"use client";

import { useI18n } from "@/i18n/useI18n";

/** Whole-page loading state: skeleton lines instead of a spinner (spec 6). */
export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div className="page" aria-busy="true" aria-label={t("loading")}>
      <div className="mast" />
      <span className="skeleton-line w-2/3" />
      <span className="skeleton-line w-1/2" />
      <span className="skeleton-line w-3/4" />
    </div>
  );
}
```

`web/src/ui/Tabs.tsx`:

```tsx
"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: string;
}

export interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
  label: string;
  idPrefix: string;
}

const ARROW_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };
const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
const panelId = (prefix: string) => `${prefix}-panel`;

/** Roving focus for the WAI-ARIA tabs pattern; null for keys the tablist does not handle. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = ARROW_STEP[key];
  return step === undefined ? null : (current + step + count) % count;
}

export function Tabs<K extends string>({ items, selected, onSelect, label, idPrefix }: TabsProps<K>) {
  const { listRef, onKeyDown } = useTabKeyboard(items, selected, onSelect);
  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <TabButton key={item.key} item={item} selected={item.key === selected} idPrefix={idPrefix} onSelect={onSelect} />
      ))}
    </div>
  );
}

function useTabKeyboard<K extends string>(items: readonly TabItem<K>[], selected: K, onSelect: (key: K) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.key === selected);
    const target = nextTabIndex(event.key, current, items.length);
    if (target === null) return;
    event.preventDefault();
    onSelect(items[target].key);
    focusTab(listRef.current, target);
  };
  return { listRef, onKeyDown };
}

interface TabButtonProps<K extends string> {
  item: TabItem<K>;
  selected: boolean;
  idPrefix: string;
  onSelect: (key: K) => void;
}

function TabButton<K extends string>({ item, selected, idPrefix, onSelect }: TabButtonProps<K>) {
  return (
    <button
      type="button"
      role="tab"
      className="tab"
      id={tabId(idPrefix, item.key)}
      aria-selected={selected}
      aria-controls={panelId(idPrefix)}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(item.key)}
    >
      {item.label}
    </button>
  );
}

/** Spec 4.3.7: on mobile the tab strip scrolls; keep the chosen tab in view. */
function focusTab(list: HTMLElement | null, index: number): void {
  const tab = list?.querySelectorAll<HTMLElement>('[role="tab"]')[index];
  tab?.focus();
  tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function TabPanel({ idPrefix, selected, children }: { idPrefix: string; selected: string; children: ReactNode }) {
  return (
    <div className="tabpanel" role="tabpanel" id={panelId(idPrefix)} aria-labelledby={tabId(idPrefix, selected)}>
      {children}
    </div>
  );
}
```

`web/src/ui/Stepper.tsx`:

```tsx
"use client";

import { useEffect, useRef, type RefObject } from "react";
import { cx } from "./cx";

export interface StepItem {
  key: string;
  label: string;
  date?: string;
}

export type StepState = "past" | "current" | "future";

export function stepState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) return "past";
  return index === currentIndex ? "current" : "future";
}

export interface StepperProps {
  steps: readonly StepItem[];
  currentIndex: number;
  label: string;
}

/** Read-only phase track: ink for done, vermilion for now. */
export function Stepper({ steps, currentIndex, label }: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useCenterCurrentStep(listRef, currentIndex);
  const columns = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` };
  return (
    <ol ref={listRef} className="stepper" aria-label={label} style={columns}>
      {steps.map((step, index) => (
        <StepEntry key={step.key} step={step} state={stepState(index, currentIndex)} />
      ))}
    </ol>
  );
}

function StepEntry({ step, state }: { step: StepItem; state: StepState }) {
  return (
    <li className={cx("step", state)} aria-current={state === "current" ? "step" : undefined}>
      <span className="step-label">{step.label}</span>
      <span className="step-date">{step.date ?? ""}</span>
    </li>
  );
}

/** Mobile shows the stepper as a horizontal scroller; centre the current phase without scrolling the page. */
function useCenterCurrentStep(listRef: RefObject<HTMLOListElement | null>, currentIndex: number): void {
  useEffect(() => {
    const list = listRef.current;
    const current = list?.children.item(currentIndex);
    if (!list || !(current instanceof HTMLElement)) return;
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.clientWidth) / 2;
  }, [listRef, currentIndex]);
}
```

- [ ] **Step 4: Port the layout styles**

`web/src/ui/styles/layout.css` (masthead, sections, empty state, tabs and stepper copied from the prototype; the stepper's `.step-btn` becomes `.step` because it is read-only; `.skeleton-line` and the mobile edge fade for tabs are new, spec 4.3.7):

```css
/* Page structure ported from docs/prototype/clickdummy-editorial.html. */
@layer components {
  .main { min-width: 0; }
  .page { max-width: 1160px; margin: 0 auto; padding: 40px var(--page-pad) 112px; }
  .page-narrow { max-width: 860px; }

  .mast { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap; border-top: var(--rule-w) solid var(--rule); padding-top: 14px; margin-bottom: 36px; }
  .mast-main { min-width: 0; flex: 1 1 420px; }
  .mast-title { display: flex; align-items: flex-start; gap: 12px; font: 720 clamp(40px, 5.2vw, 64px)/0.92 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.042em; overflow-wrap: anywhere; }
  .mast-no { font: 600 15px/1 var(--font-ui); letter-spacing: 0; font-variant-numeric: tabular-nums; color: var(--accent-text); padding-top: 0.3em; flex: none; }
  .mast-deck { margin-top: 14px; font-size: 17px; line-height: 1.4; color: var(--text-2); max-width: 60ch; }
  .mast-deck b { color: var(--text); font-weight: 600; }
  .mast-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .mast-sm .mast-title { font-size: clamp(40px, 4vw, 52px); }
  .mast-sm { margin-bottom: 18px; flex-wrap: nowrap; align-items: flex-start; }
  .mast-sm .mast-main { flex: 1 1 0; }
  .mast-sm .mast-deck { font-size: 15px; }

  .sec-title { font: 680 24px/1.15 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.025em; }
  .sec-title-sm { font: 650 17px/1.25 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.015em; }
  .section { padding: 28px 0; border-top: 1px solid var(--line); }
  .section:first-child { border-top: 0; padding-top: 0; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s3); margin-bottom: var(--s3); flex-wrap: wrap; }
  .prose { max-width: 66ch; color: var(--text-2); }

  .empty { padding: 48px 24px; text-align: left; max-width: 460px; margin: 0 auto; }
  .empty-ico { width: 40px; height: 40px; border-radius: 50%; background: var(--text); color: var(--bg); display: grid; place-items: center; margin-bottom: 18px; }
  .empty h2 { font: 700 30px/1.05 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.03em; margin-bottom: 10px; }
  .empty p { color: var(--text-2); font-size: var(--fs-14); }
  .empty .row { margin-top: 18px; }

  .skeleton-line { display: block; height: 14px; background: var(--sunken); border-radius: 2px; }
  .skeleton-line + .skeleton-line { margin-top: 12px; }

  .tabs { display: flex; gap: 0; margin-top: 36px; border-bottom: 1px solid var(--line-strong); overflow-x: auto; scrollbar-width: none; }
  .tab { height: 44px; padding: 0 2px; margin-right: 22px; border: 0; background: none; border-bottom: 3px solid transparent; margin-bottom: -1px; color: var(--text-2); font-weight: 600; font-size: 14.5px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; text-decoration: none; }
  .tab:hover { color: var(--text); text-decoration: none; }
  .tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
  .tabpanel { padding-top: 28px; }

  .stepper { list-style: none; margin: 34px 0 0; padding: 0; display: grid; gap: 0 4px; }
  .step { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px 6px 4px 0; min-height: 56px; color: var(--text-3); }
  .step::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--line); transition: background-color var(--t-mid) var(--ease); }
  .step-label { font-size: var(--fs-13); font-weight: 600; line-height: 1.2; hyphens: auto; -webkit-hyphens: auto; max-width: 100%; }
  .step-date { font-size: var(--fs-12); font-variant-numeric: tabular-nums; color: var(--text-3); line-height: 1.2; min-height: 1.2em; }
  .step.past { color: var(--text-2); }
  .step.past::before { background: var(--text); }
  .step.current { color: var(--text); }
  .step.current::before { background: var(--accent); height: 8px; top: -2px; }
  .step.current .step-label { font-weight: 700; color: var(--accent-text); }
  .step.current .step-date { color: var(--text-2); }

  @media (max-width: 767px) {
    .page { padding: 22px 16px 48px; }
    .mast { margin-bottom: 26px; padding-top: 12px; }
    .mast-title, .mast-sm .mast-title { font-size: 40px; gap: 8px; }
    .mast-no { font-size: 13px; }
    .mast-deck { font-size: 15px; margin-top: 10px; }
    .mast-main { flex-basis: 100%; }
    .tab { height: 46px; margin-right: 18px; }
    /* Edge fade marks the scrollable strip; it is a mask, not a decorative gradient. */
    .tabs { margin-left: -16px; margin-right: -16px; padding: 0 16px; mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent); }
    .stepper { display: flex; overflow-x: auto; gap: 0 4px; margin: 28px -16px 0; padding: 2px 16px 0; scrollbar-width: none; }
    .stepper li { flex: 0 0 auto; min-width: 96px; }
  }
}
```

Then add the import to `web/app/globals.css` below the controls import:

```css
@import "../src/ui/styles/layout.css";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui/layout.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 9: UI primitives, part 3 (dialog, drawer, popover, toasts)

**Files:**
- Create: `web/src/ui/ModalLayer.tsx`, `Dialog.tsx`, `Drawer.tsx`, `PanelHeader.tsx`, `Popover.tsx`, `toast.ts`, `ToastProvider.tsx` (under `web/src/ui/`), `web/src/ui/styles/overlay.css`
- Modify: `web/app/globals.css` (add `@import "../src/ui/styles/overlay.css";` below the layout import), `web/app/providers.tsx`
- Test: `web/tests/unit/support/render.tsx`, `web/tests/unit/ui/overlays.test.tsx`, `web/tests/unit/ui/toast.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Icon`, `cx` (Task 7); `useI18n` (Task 3).
- Produces:
  - `ModalLayer({ className, label, onClose, children })`, `useModalBehaviour(panelRef, onClose)`, `trapTab(event, panel)` (`@/ui/ModalLayer`). Focus goes to the first `[data-autofocus]` element, else the first focusable one.
  - `Dialog({ open, onClose, label, children })`, `Drawer({ open, onClose, label, variant?: "wide" | "narrow" | "sheet", children })`, `PanelHeader({ title, onClose })`.
  - `Popover({ open, onClose, placement: "up" | "down-right", label, children })` - must sit inside an element with class `pop-anchor` that also holds its trigger; outside clicks and Escape close it.
  - `ToastTone`, `ToastAction { label; onAction() }`, `ToastInput { message; tone?; action? }`, `MAX_VISIBLE_TOASTS = 2`, `TOAST_DURATION_MS = 6000`, `ACTION_TOAST_DURATION_MS = 10000`, `toastDuration(input)`, `pushToast(list, entry)` (`@/ui/toast`); `ToastProvider`, `useToast(): { show(input): void; dismiss(id): void }` (`@/ui/ToastProvider`).
  - Test helper `renderWithProviders(ui)` returning `{ queryClient, ...renderResult }` (`tests/unit/support/render.tsx`).

**Decision:** modal layers are portals with their own focus handling instead of native `<dialog>`, because jsdom does not implement `showModal()` and the prototype's scrim and trap behaviour is easy to port. Toasts follow spec 4.1, which overrides the prototype: at most 2 visible, 6 s by default, 10 s when they carry an action, timer paused on hover or focus.

- [ ] **Step 1: Write the test support and failing tests**

`web/tests/unit/support/render.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "@/ui/ToastProvider";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** Renders with the app's providers; a fresh query client per test keeps tests independent. */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...result };
}
```

`web/tests/unit/ui/overlays.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/ui/Dialog";
import { Popover } from "@/ui/Popover";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Suche">
        <button type="button">Erste</button>
        <input aria-label="Suchbegriff" data-autofocus />
        <button type="button">Letzte</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("moves focus to the autofocus element when it opens", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument();
    expect(screen.getByLabelText("Suchbegriff")).toHaveFocus();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Öffnen" })).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    screen.getByRole("button", { name: "Letzte" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Erste" })).toHaveFocus();
  });

  it("locks page scrolling while open", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Popover", () => {
  function renderPopover(onClose: () => void) {
    render(
      <div>
        <p>Außerhalb</p>
        <div className="pop-anchor">
          <button type="button">Menü</button>
          <Popover open onClose={onClose} placement="up" label="Benutzermenü">
            <button type="button">Abmelden</button>
          </Popover>
        </div>
      </div>,
    );
  }

  it("closes on a click outside its anchor", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.mouseDown(screen.getByText("Außerhalb"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open for clicks inside the anchor", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Abmelden" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Menü" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

`web/tests/unit/ui/toast.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_TOAST_DURATION_MS, TOAST_DURATION_MS, type ToastInput } from "@/ui/toast";
import { ToastProvider, useToast } from "@/ui/ToastProvider";

function Trigger({ input }: { input: ToastInput }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(input)}>
      zeigen
    </button>
  );
}

function renderTrigger(input: ToastInput) {
  render(
    <ToastProvider>
      <Trigger input={input} />
    </ToastProvider>,
  );
  return () => fireEvent.click(screen.getByRole("button", { name: "zeigen" }));
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toasts", () => {
  it("dismiss themselves after the default duration", () => {
    renderTrigger({ message: "Gespeichert" })();
    advance(TOAST_DURATION_MS - 1);
    expect(screen.getByText("Gespeichert")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
  });

  it("keep an action toast for at least 10 s", () => {
    const action = { label: "Rückgängig", onAction: vi.fn() };
    renderTrigger({ message: "Aussortiert", action })();
    advance(ACTION_TOAST_DURATION_MS - 1);
    expect(screen.getByText("Aussortiert")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
  });

  it("pause while hovered and resume with the remaining time", () => {
    renderTrigger({ message: "Gespeichert" })();
    advance(2_000);
    fireEvent.mouseEnter(screen.getByRole("status"));
    advance(TOAST_DURATION_MS * 2);
    expect(screen.getByText("Gespeichert")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("status"));
    advance(TOAST_DURATION_MS - 2_000);
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
  });

  it("show at most two at a time, dropping the oldest", () => {
    const show = renderTrigger({ message: "Meldung" });
    show();
    show();
    show();
    expect(screen.getAllByText("Meldung")).toHaveLength(2);
  });

  it("run the action and close when the action is clicked", () => {
    const action = { label: "Rückgängig", onAction: vi.fn() };
    renderTrigger({ message: "Aussortiert", action })();
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(action.onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
  });

  it("announce errors as alerts with a close button", () => {
    renderTrigger({ message: "Fehlgeschlagen", tone: "error" })();
    expect(screen.getByRole("alert")).toHaveTextContent("Fehlgeschlagen");
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui/overlays.test.tsx tests/unit/ui/toast.test.tsx`
Expected: FAIL with `Failed to resolve import "@/ui/Dialog"` (and the other modules).

- [ ] **Step 3: Implement the modal layer, dialog, drawer and popover**

`web/src/ui/ModalLayer.tsx`:

```tsx
"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
const AUTOFOCUS_SELECTOR = "[data-autofocus]";

export interface ModalLayerProps {
  className: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Scrim plus modal panel: focus moves in, Tab is trapped, Escape and the scrim close it. */
export function ModalLayer({ className, label, onClose, children }: ModalLayerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehaviour(panelRef, onClose);
  return (
    <>
      <div className="scrim anim-fade" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}

export function useModalBehaviour(panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => handleModalKey(event, panelRef.current, onClose));
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreScroll = lockBodyScroll();
    focusInitial(panelRef.current);
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      restoreScroll();
      returnFocus?.focus();
    };
  }, [panelRef]);
}

/** Wraps Tab and Shift+Tab at the panel edges and pulls stray focus back in. */
export function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const wrapToFirst = !event.shiftKey && active === last;
  const wrapToLast = event.shiftKey && active === first;
  if (!wrapToFirst && !wrapToLast && panel.contains(active)) return;
  event.preventDefault();
  (wrapToLast ? last : first).focus();
}

function handleModalKey(event: KeyboardEvent, panel: HTMLElement | null, onClose: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key === "Tab" && panel) trapTab(event, panel);
}

function focusInitial(panel: HTMLElement | null): void {
  if (!panel) return;
  const preferred = panel.querySelector<HTMLElement>(AUTOFOCUS_SELECTOR) ?? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (preferred ?? panel).focus();
}

function lockBodyScroll(): () => void {
  const previous = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = previous;
  };
}
```

`web/src/ui/Dialog.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalLayer } from "./ModalLayer";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Centred modal (global search, confirmations). Only rendered on the client after interaction. */
export function Dialog({ open, onClose, label, children }: DialogProps) {
  if (!open) return null;
  return createPortal(
    <ModalLayer className="dialog anim-pop" label={label} onClose={onClose}>
      {children}
    </ModalLayer>,
    document.body,
  );
}
```

`web/src/ui/Drawer.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalLayer } from "./ModalLayer";

export type DrawerVariant = "wide" | "narrow" | "sheet";

// "sheet" is the mobile bottom sheet of the prototype's "Mehr" menu.
const DRAWER_CLASS: Record<DrawerVariant, string> = {
  wide: "drawer anim-drawer",
  narrow: "drawer narrow anim-drawer",
  sheet: "drawer sheet anim-pop",
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  variant?: DrawerVariant;
  children: ReactNode;
}

export function Drawer({ open, onClose, label, variant = "wide", children }: DrawerProps) {
  if (!open) return null;
  return createPortal(
    <ModalLayer className={DRAWER_CLASS[variant]} label={label} onClose={onClose}>
      {children}
    </ModalLayer>,
    document.body,
  );
}
```

`web/src/ui/PanelHeader.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";

export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="panel-head">
      <h2 className="panel-title">{title}</h2>
      <Button variant="ghost" iconOnly icon={X} aria-label={t("dialog.close")} onClick={onClose} />
    </div>
  );
}
```

`web/src/ui/Popover.tsx`:

```tsx
"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";

export type PopoverPlacement = "up" | "down-right";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  placement: PopoverPlacement;
  label: string;
  children: ReactNode;
}

/** Non-modal panel anchored to its parent `.pop-anchor`, which also contains the trigger. */
export function Popover({ open, onClose, placement, label, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onClose);
  if (!open) return null;
  return (
    <div ref={ref} className={cx("popover", "anim-pop", placement)} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

function useDismiss(ref: RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void): void {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    // The anchor includes the trigger, so clicking the trigger toggles instead of closing twice.
    const onPointer = (event: MouseEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && event.target instanceof Node && !anchor.contains(event.target)) close();
    };
    const onKey = (event: KeyboardEvent) => (event.key === "Escape" ? close() : undefined);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
```

- [ ] **Step 4: Implement toasts**

`web/src/ui/toast.ts`:

```ts
export type ToastTone = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
}

export interface ToastEntry extends ToastInput {
  id: number;
}

// Spec 4.1: at most 2 stacked; toasts with an action (usually undo) stay at least 10 s.
export const MAX_VISIBLE_TOASTS = 2;
export const TOAST_DURATION_MS = 6_000;
export const ACTION_TOAST_DURATION_MS = 10_000;

export function toastDuration(input: ToastInput): number {
  return input.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS;
}

/** Appends a toast and drops the oldest beyond the visible limit. */
export function pushToast(list: readonly ToastEntry[], entry: ToastEntry): ToastEntry[] {
  return [...list, entry].slice(-MAX_VISIBLE_TOASTS);
}
```

`web/src/ui/ToastProvider.tsx`:

```tsx
"use client";

import { Check, CircleAlert, Info, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { pushToast, toastDuration, type ToastAction, type ToastEntry, type ToastInput, type ToastTone } from "./toast";

export interface ToastApi {
  show: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TONE_ICON: Record<ToastTone, LucideIcon> = { info: Info, success: Check, error: CircleAlert };
const TONE_ROLE: Record<ToastTone, "status" | "alert"> = { info: "status", success: "status", error: "alert" };

/** @throws Error when used outside <ToastProvider> (a wiring bug, not a runtime condition). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => setEntries((list) => list.filter((entry) => entry.id !== id)), []);
  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const entry: ToastEntry = { ...input, id: nextId.current };
    setEntries((list) => pushToast(list, entry));
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext value={api}>
      {children}
      <ToastStack entries={entries} onDismiss={dismiss} />
    </ToastContext>
  );
}

function ToastStack({ entries, onDismiss }: { entries: readonly ToastEntry[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {entries.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  const { paused, handlers } = usePauseOnInteraction();
  useToastTimer(entry, paused, onDismiss);
  const tone = entry.tone ?? "info";
  const dismiss = () => onDismiss(entry.id);
  return (
    <div className={cx("toast", tone === "error" && "err")} role={TONE_ROLE[tone]} {...handlers}>
      <Icon icon={TONE_ICON[tone]} className="lead" />
      <span className="msg">{entry.message}</span>
      {entry.action ? <ToastActionButton action={entry.action} onDone={dismiss} /> : null}
      <Button size="sm" variant="ghost" iconOnly icon={X} aria-label={t("toast.close")} onClick={dismiss} />
    </div>
  );
}

function ToastActionButton({ action, onDone }: { action: ToastAction; onDone: () => void }) {
  const run = () => {
    action.onAction();
    onDone();
  };
  return (
    <Button size="sm" variant="ghost" onClick={run}>
      {action.label}
    </Button>
  );
}

/** Spec 4.1: the timer pauses while the pointer or focus is on the toast. */
function usePauseOnInteraction() {
  const [paused, setPaused] = useState(false);
  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  return { paused, handlers: { onMouseEnter: pause, onMouseLeave: resume, onFocus: pause, onBlur: resume } };
}

function useToastTimer(entry: ToastEntry, paused: boolean, onDismiss: (id: number) => void): void {
  const remaining = useRef(toastDuration(entry));
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(entry.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, entry.id, onDismiss]);
}
```

`web/app/providers.tsx` (full file):

```tsx
"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/api/QueryProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/ToastProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <LanguageProvider>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryProvider>
  );
}
```

- [ ] **Step 5: Port the overlay styles**

`web/src/ui/styles/overlay.css` (scrim, drawer, panels, popover, tasks and toasts copied from the prototype; `.dialog`, `.drawer.sheet` and `.pop-caption/.pop-check` are new and replace the prototype's inline styles):

```css
/* Overlays ported from docs/prototype/clickdummy-editorial.html. */
@layer components {
  .scrim { position: fixed; inset: 0; background: var(--scrim); z-index: 50; }
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(var(--drawer-w, 900px), 100vw); background: var(--bg);
    border-left: var(--rule-w) solid var(--rule); box-shadow: var(--shadow-float); z-index: 51; overflow-y: auto; overscroll-behavior: contain;
  }
  .drawer.narrow { --drawer-w: 540px; }
  .drawer.sheet { top: auto; left: 0; width: 100vw; max-height: 85vh; border-left: 0; border-top: 1px solid var(--line); border-radius: var(--r-panel) var(--r-panel) 0 0; }
  .dialog {
    position: fixed; z-index: 51; top: 12vh; left: 0; right: 0; margin: 0 auto; width: min(640px, calc(100vw - 32px)); max-height: 76vh; overflow-y: auto;
    background: var(--bg); color: var(--text); border-top: var(--rule-w) solid var(--rule); border-radius: var(--r-panel); box-shadow: var(--shadow-float);
  }
  .panel-in { padding: 24px 28px 44px; }
  .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 22px; }
  .panel-title { font: 720 32px/1 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.035em; overflow-wrap: anywhere; }
  .panel-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }

  .pop-anchor { position: relative; }
  .popover {
    position: absolute; z-index: 60; min-width: 264px; background: var(--float); color: var(--text); border: 1px solid var(--line-strong);
    border-radius: var(--r-panel); box-shadow: var(--shadow-float); padding: 6px; font-size: var(--fs-13);
  }
  .popover.up { bottom: calc(100% + 6px); left: 0; }
  .popover.down-right { top: calc(100% + 4px); right: 0; }
  .pop-head { padding: 8px 10px 6px; font-weight: 700; font-size: var(--fs-13); }
  .pop-caption { padding: 4px 10px; }
  .pop-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 6px 10px; border: 0; background: none; border-radius: var(--r-ctl); text-align: left; cursor: pointer; color: var(--text); font-size: var(--fs-13); text-decoration: none; }
  .pop-item:hover { background: var(--hover); text-decoration: none; }
  .pop-item[aria-pressed="true"] { color: var(--accent-text); font-weight: 700; }
  .pop-check { margin-left: auto; }
  .pop-sep { height: 1px; background: var(--line); margin: 6px 4px; }
  .task { padding: 8px 10px; }
  .task + .task { border-top: 1px solid var(--line); }
  .task-title { display: flex; gap: 8px; align-items: center; font-weight: 600; }
  .task-sub { font-size: var(--fs-12); color: var(--text-3); margin: 3px 0 6px 24px; }
  .task .progress { margin-left: 24px; }

  .toasts { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 90; align-items: center; pointer-events: none; }
  .toast {
    --float: var(--inv-bg); --surface: var(--inv-bg); --bg: var(--inv-bg); --hover: var(--inv-hover); --line: var(--inv-line); --line-strong: var(--inv-line);
    --text: var(--inv-text); --text-2: var(--inv-text-2); --text-3: var(--inv-text-3); --accent-text: var(--inv-accent); --accent-soft: var(--inv-hover); --focus: var(--inv-accent);
    pointer-events: auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 300px; max-width: min(580px, calc(100vw - 32px));
    padding: 11px 10px 11px 14px; background: var(--float); color: var(--text); border-left: 5px solid var(--inv-accent); border-radius: var(--r-ctl);
    box-shadow: var(--shadow-float); font-size: var(--fs-13); font-weight: 500; animation: rise var(--t-mid) var(--ease);
  }
  .toast .msg { flex: 1 1 200px; }
  .toast .ico.lead { color: var(--accent-text); }
  .toast.err { border-left-color: var(--danger); }
  .toast.err .ico.lead { color: var(--text); }
  .toast .btn-ghost { color: var(--text); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--inv-line); }
  .toast .btn-icon { text-decoration: none; }

  .anim-drawer { animation: slide-in 240ms var(--ease); }
  .anim-fade { animation: fade var(--t-fast) var(--ease); }
  .anim-pop { animation: rise var(--t-fast) var(--ease); }

  @media (max-width: 767px) {
    .drawer, .drawer.narrow { width: 100vw; border-left: 0; }
    .dialog { top: 16px; }
    .panel-in { padding: 18px 16px 40px; }
    .panel-title { font-size: 28px; }
    /* Above the bottom bar; two toasts plus the bar stay under a quarter of the screen (spec 4.3.7). */
    .toasts { bottom: calc(78px + env(safe-area-inset-bottom)); }
    .toast { min-width: 0; width: calc(100vw - 32px); }
  }
}
```

Then add the import to `web/app/globals.css` below the layout import:

```css
@import "../src/ui/styles/overlay.css";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui`
Expected: PASS (overlays 7, toast 6, plus Tasks 7 and 8).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

### Task 10: App shell, routes and placeholder pages

**Files:**
- Create under `web/src/features/shell/`: `navigation.ts`, `useCurrentUser.ts`, `useNavCounts.ts`, `useLogout.ts`, `useLanguageSwitch.ts`, `useServerLanguageSync.ts`, `RealtimeProvider.tsx`, `PageError.tsx`, `Sidebar.tsx`, `ActivityButton.tsx`, `ActivityPanel.tsx`, `ThemeButton.tsx`, `PreferenceOptions.tsx`, `UserMenu.tsx`, `BottomBar.tsx`, `MoreSheet.tsx`, `GlobalSearch.tsx`, `AppShell.tsx`, `shell.css`
- Create: `web/src/features/placeholder/PlaceholderPage.tsx`, `web/src/features/placeholder/NotFoundView.tsx`
- Create: `web/app/(app)/layout.tsx`, `web/app/(app)/inbox/page.tsx`, `web/app/(app)/applications/page.tsx`, `web/app/(app)/jobs/[id]/page.tsx`, `web/app/(app)/sources/page.tsx`, `web/app/(app)/companies/page.tsx`, `web/app/(app)/profile/page.tsx`, `web/app/(app)/settings/page.tsx`, `web/app/not-found.tsx`
- Modify: `web/app/globals.css` (add `@import "../src/features/shell/shell.css";` below the overlay import)
- Test: `web/tests/unit/features/shell.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2-9: `useTheme`, `THEME_PREFERENCES`, `useI18n`, `LANGUAGES`, `formatTime`, `queryKeys`, `fetchCurrentUser`, `logout`, `fetchJobCounts`, `openMatchCount`, `fetchPlatforms`, `countFailingPlatforms`, `fetchLanguagePreference`, `saveLanguagePreference`, `ApiError`, `describeError`, `LOGIN_PATH`, `useActivity`, `progressPercent`, `openRealtime`, `RealtimeDeps`, UI primitives.
- Produces:
  - `NavKey`, `NavItem`, `MAIN_NAV`, `BOTTOM_BAR_NAV`, `MORE_NAV`, `SETTINGS_HREF`, `SETTINGS_NUMBER`, `ACCOUNT_HREF`, `navNumber(key)`, `isActivePath(pathname, href)`, `isMoreActive(pathname)`, `initialOf(username)` (`@/features/shell/navigation`).
  - `useCurrentUser()` (query `["me"]`), `NavCounts { inbox; sourceErrors }`, `useNavCounts(enabled)`, `useLogout()`, `useLanguageSwitch()`, `useServerLanguageSync()`.
  - `AppShell({ children })` used by `app/(app)/layout.tsx`; `activityLabel(running, t)`; `isTypingTarget(target)`; `PlaceholderPage({ titleKey, number? })`; `NotFoundView()`.
  - Routes: `/inbox`, `/applications`, `/jobs/[id]`, `/sources`, `/companies`, `/profile`, `/settings`, plus a translated 404.

**Scope notes (recorded in the hand-off):** the Bewerbungen "due" count needs `domain/nextStep` and the applications list, so its badge is wired in phase 4 (`NavCounts` gets a `due` field then). On `/jobs/[id]` no nav item is active until phase 2 knows the job's status (Eingang for `OPEN`, otherwise Bewerbungen). The global search dialog opens with `/` and has no results yet (phase 7); on mobile there is no `/` key, so phase 7 adds a search entry to the "Mehr" sheet.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/shell.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ActivityPanel } from "@/features/shell/ActivityPanel";
import { activityLabel } from "@/features/shell/ActivityButton";
import { GlobalSearch, isTypingTarget } from "@/features/shell/GlobalSearch";
import { initialOf, isActivePath, isMoreActive } from "@/features/shell/navigation";
import { NavBadge } from "@/features/shell/Sidebar";
import { translatorFor } from "@/i18n/translate";
import { EMPTY_ACTIVITY } from "@/realtime/activity";

const t = translatorFor("de");

describe("navigation", () => {
  it("treats nested paths as active", () => {
    expect(isActivePath("/sources", "/sources")).toBe(true);
    expect(isActivePath("/sources/3", "/sources")).toBe(true);
  });

  it("does not match a path that only shares a prefix", () => {
    expect(isActivePath("/inbox-archive", "/inbox")).toBe(false);
  });

  it("marks Mehr active on profile and settings pages", () => {
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/inbox")).toBe(false);
  });

  it("derives the avatar initial from the username", () => {
    expect(initialOf(" admin")).toBe("A");
  });
});

describe("activityLabel", () => {
  it.each([
    [0, "Aktivität"],
    [1, "1 Aufgabe läuft"],
    [3, "3 Aufgaben laufen"],
  ])("%i running tasks read %s", (running, label) => {
    expect(activityLabel(running, t)).toBe(label);
  });
});

describe("NavBadge", () => {
  it("shows new matches on the inbox", () => {
    render(<NavBadge itemKey="inbox" counts={{ inbox: 3, sourceErrors: 0 }} />);
    expect(screen.getByText("3 neue Treffer")).toBeInTheDocument();
  });

  it("shows failing sources as text", () => {
    render(<NavBadge itemKey="sources" counts={{ inbox: 0, sourceErrors: 1 }} />);
    expect(screen.getByText("1 Fehler")).toBeInTheDocument();
  });

  it("renders nothing for zero counts", () => {
    const { container } = render(<NavBadge itemKey="inbox" counts={{ inbox: 0, sourceErrors: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ActivityPanel", () => {
  it("describes a running crawl step by step", () => {
    const running = [{ id: "c1", source: "www.stepstone.de", step: "collecting" as const, done: 5, total: 12 }];
    render(<ActivityPanel activity={{ running, lastFinished: null }} />);
    expect(screen.getByText("www.stepstone.de durchsuchen")).toBeInTheDocument();
    expect(screen.getByText("Links sammeln: 5 von 12")).toBeInTheDocument();
  });

  it("says when nothing runs", () => {
    render(<ActivityPanel activity={EMPTY_ACTIVITY} />);
    expect(screen.getByText("Keine laufenden Aufgaben.")).toBeInTheDocument();
  });
});

describe("GlobalSearch", () => {
  it("opens with the / key", async () => {
    render(<GlobalSearch />);
    await userEvent.keyboard("/");
    expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stellen und Firmen durchsuchen")).toHaveFocus();
  });

  it("does not open while typing in a field", async () => {
    render(
      <>
        <input aria-label="Notiz" />
        <GlobalSearch />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Notiz"), "a/b");
    expect(screen.getByLabelText("Notiz")).toHaveValue("a/b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    render(<GlobalSearch />);
    await userEvent.keyboard("/");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("isTypingTarget", () => {
  it("recognises editable elements", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(editor)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/shell.test.tsx`
Expected: FAIL with `Failed to resolve import "@/features/shell/ActivityPanel"`.

- [ ] **Step 3: Navigation config and data hooks**

`web/src/features/shell/navigation.ts`:

```ts
import { Briefcase, Globe, Inbox, SlidersHorizontal, User, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/i18n/de";

export type NavKey = "inbox" | "applications" | "sources" | "profile";

export interface NavItem {
  key: NavKey;
  number: string;
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}

// Numbered like the prototype: the product is a sequence (find, triage, apply). Spec 4.1.
export const MAIN_NAV: readonly NavItem[] = [
  { key: "inbox", number: "01", href: "/inbox", labelKey: "nav.inbox", icon: Inbox },
  { key: "applications", number: "02", href: "/applications", labelKey: "nav.applications", icon: Briefcase },
  { key: "sources", number: "03", href: "/sources", labelKey: "nav.sources", icon: Globe },
  { key: "profile", number: "04", href: "/profile", labelKey: "nav.profile", icon: User },
];

export const SETTINGS_HREF = "/settings";
export const SETTINGS_NUMBER = "05";
export const ACCOUNT_HREF = "/settings?section=account";

// The mobile bottom bar shows the first three; Profil and Einstellungen live under "Mehr".
const BOTTOM_BAR_SIZE = 3;
export const BOTTOM_BAR_NAV = MAIN_NAV.slice(0, BOTTOM_BAR_SIZE);
export const MORE_NAV: readonly Omit<NavItem, "key" | "number">[] = [
  { href: "/profile", labelKey: "nav.profile", icon: User },
  { href: SETTINGS_HREF, labelKey: "nav.settings", icon: SlidersHorizontal },
];

export function navNumber(key: NavKey): string {
  return MAIN_NAV.find((item) => item.key === key)?.number ?? "";
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_NAV.some((item) => isActivePath(pathname, item.href));
}

export function initialOf(username: string): string {
  return username.trim().charAt(0).toUpperCase();
}
```

`web/src/features/shell/useCurrentUser.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/api/auth";
import { queryKeys } from "@/api/queryKeys";

export function useCurrentUser() {
  // The user only changes through login or logout, and both reset the cache.
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchCurrentUser, staleTime: Infinity });
}
```

`web/src/features/shell/useNavCounts.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJobCounts, openMatchCount } from "@/api/jobs";
import { countFailingPlatforms, fetchPlatforms } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";

export interface NavCounts {
  inbox: number;
  sourceErrors: number;
}

/** Badge numbers of the main navigation; realtime invalidates both queries after crawls. */
export function useNavCounts(enabled: boolean): NavCounts {
  const counts = useQuery({ queryKey: queryKeys.jobCounts, queryFn: fetchJobCounts, enabled });
  const platforms = useQuery({ queryKey: queryKeys.platforms, queryFn: fetchPlatforms, enabled });
  return { inbox: openMatchCount(counts.data), sourceErrors: countFailingPlatforms(platforms.data ?? []) };
}
```

`web/src/features/shell/useLogout.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { logout } from "@/api/auth";
import { LOGIN_PATH } from "@/api/session";

export function useLogout(): () => void {
  const queryClient = useQueryClient();
  const router = useRouter();
  // onSettled: even if the server is unreachable, the user asked to leave; drop all cached data.
  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      router.replace(LOGIN_PATH);
    },
  });
  return () => mutation.mutate();
}
```

`web/src/features/shell/useLanguageSwitch.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { saveLanguagePreference } from "@/api/settings";
import type { Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** Switches the UI at once and stores the choice on the server (it also sets the AI output language). */
export function useLanguageSwitch(): (language: Language) => void {
  const { setLanguage, t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: saveLanguagePreference,
    onSuccess: (_result, language) => queryClient.setQueryData(queryKeys.languagePreference, language),
    onError: () => toast.show({ tone: "error", message: t("error.languageNotSaved") }),
  });
  return (language) => {
    setLanguage(language);
    mutation.mutate(language);
  };
}
```

`web/src/features/shell/useServerLanguageSync.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { queryKeys } from "@/api/queryKeys";
import { fetchLanguagePreference } from "@/api/settings";
import type { Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";

/** After login the server preference wins over the browser default; later switches go through useLanguageSwitch. */
export function useServerLanguageSync(): void {
  const { language, setLanguage } = useI18n();
  const { data } = useQuery({ queryKey: queryKeys.languagePreference, queryFn: fetchLanguagePreference, staleTime: Infinity });
  // An effect event, so a local switch does not re-run the sync and revert to the old server value.
  const adopt = useEffectEvent((serverLanguage: Language) => {
    if (serverLanguage !== language) setLanguage(serverLanguage);
  });
  useEffect(() => {
    if (data) adopt(data);
  }, [data]);
}
```

`web/src/features/shell/RealtimeProvider.tsx`:

```tsx
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { openRealtime } from "@/realtime/openRealtime";
import { useToast } from "@/ui/ToastProvider";

/** One WebSocket per tab for the signed-in user (spec 2.3). */
export function RealtimeProvider({ userId, children }: { userId: number; children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const reportBackgroundError = useEffectEvent(() =>
    toast.show({ tone: "error", message: t("toast.backgroundError") }),
  );
  useEffect(() => {
    const deps = { queryClient, now: Date.now, onGlobalError: () => reportBackgroundError() };
    const connection = openRealtime(userId, deps);
    return () => connection.close();
  }, [queryClient, userId]);
  return children;
}
```

`web/src/features/shell/PageError.tsx`:

```tsx
"use client";

import { RotateCcw } from "lucide-react";
import { describeError } from "@/api/describeError";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";

/** Error state with retry (spec 6: message plus retry, never raw server text). */
export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <Notice tone="error">{describeError(error, t)}</Notice>
      <Button className="mt-4" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Sidebar, activity, preferences and user menu**

`web/src/features/shell/Sidebar.tsx`:

```tsx
"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/api/auth";
import { useI18n } from "@/i18n/useI18n";
import { CountBadge } from "@/ui/CountBadge";
import { Icon } from "@/ui/Icon";
import { ActivityButton } from "./ActivityButton";
import { isActivePath, MAIN_NAV, SETTINGS_HREF, type NavItem, type NavKey } from "./navigation";
import { ThemeButton } from "./ThemeButton";
import { useNavCounts, type NavCounts } from "./useNavCounts";
import { UserMenu } from "./UserMenu";

/** Desktop sidebar: always ink, large numbered navigation (prototype "shell"). */
export function Sidebar({ user }: { user: CurrentUser | undefined }) {
  const { t } = useI18n();
  const counts = useNavCounts(user !== undefined);
  return (
    <aside className="sidebar" aria-label={t("shell.sidebar")}>
      <div className="brand">
        <span className="brand-word">{t("app.name")}</span>
        <span className="brand-mark" aria-hidden="true" />
      </div>
      <nav className="nav" aria-label={t("nav.main")}>
        {MAIN_NAV.map((item) => (
          <NavLink key={item.key} item={item} counts={counts} />
        ))}
      </nav>
      <SidebarFoot user={user} />
    </aside>
  );
}

function NavLink({ item, counts }: { item: NavItem; counts: NavCounts }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  return (
    <Link href={item.href} aria-current={isActivePath(pathname, item.href) ? "page" : undefined}>
      <span className="nav-no" aria-hidden="true">
        {item.number}
      </span>
      <span className="nav-label">{t(item.labelKey)}</span>
      <NavBadge itemKey={item.key} counts={counts} />
    </Link>
  );
}

export function NavBadge({ itemKey, counts }: { itemKey: NavKey; counts: NavCounts }) {
  const { t } = useI18n();
  if (itemKey === "inbox" && counts.inbox > 0) {
    return <CountBadge count={counts.inbox} label={t("nav.newMatches", { count: counts.inbox })} />;
  }
  if (itemKey === "sources" && counts.sourceErrors > 0) {
    return <span className="count-plain t-danger">{t("nav.sourceErrors", { count: counts.sourceErrors })}</span>;
  }
  return null;
}

function SidebarFoot({ user }: { user: CurrentUser | undefined }) {
  const { t } = useI18n();
  const active = isActivePath(usePathname() ?? "", SETTINGS_HREF);
  return (
    <div className="sidebar-foot">
      <ActivityButton enabled={user !== undefined} />
      <ThemeButton />
      <Link className="side-btn" href={SETTINGS_HREF} aria-current={active ? "page" : undefined}>
        <Icon icon={SlidersHorizontal} />
        <span>{t("nav.settings")}</span>
      </Link>
      {user ? <UserMenu user={user} /> : null}
    </div>
  );
}
```

`web/src/features/shell/ActivityButton.tsx`:

```tsx
"use client";

import { Activity, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useActivity } from "@/realtime/useActivity";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { ActivityPanel } from "./ActivityPanel";

/** Fixed activity label (spec 4.3.6): "Aktivität" when idle, "2 Aufgaben laufen" while busy. */
export function activityLabel(running: number, t: Translate): string {
  if (running === 0) return t("activity.label");
  return running === 1 ? t("activity.runningOne") : t("activity.runningMany", { count: running });
}

export function ActivityButton({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const activity = useActivity(enabled);
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-anchor">
      <ActivityTrigger running={activity.running.length} open={open} onToggle={() => setOpen(!open)} />
      <Popover open={open} onClose={() => setOpen(false)} placement="up" label={t("activity.heading")}>
        <ActivityPanel activity={activity} />
      </Popover>
    </div>
  );
}

function ActivityTrigger({ running, open, onToggle }: { running: number; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const busy = running > 0;
  return (
    <button type="button" className={cx("side-btn", busy && "activity-live")} aria-expanded={open} onClick={onToggle}>
      {/* The spinner is the one moving indicator the spec allows: a running crawl. */}
      <Icon icon={busy ? LoaderCircle : Activity} className={busy ? "spin" : undefined} />
      <span>{activityLabel(running, t)}</span>
    </button>
  );
}
```

`web/src/features/shell/ActivityPanel.tsx`:

```tsx
"use client";

import { LoaderCircle } from "lucide-react";
import type { MessageKey } from "@/i18n/de";
import { formatTime } from "@/i18n/formatTime";
import { useI18n } from "@/i18n/useI18n";
import { progressPercent, type ActivityOutcome, type ActivityState, type ActivityStep, type ActivityTask, type FinishedTask } from "@/realtime/activity";
import { Icon } from "@/ui/Icon";

const STEP_LABEL: Record<ActivityStep, MessageKey> = {
  starting: "activity.step.starting",
  collecting: "activity.step.collecting",
  extracting: "activity.step.extracting",
  analysing: "activity.step.analysing",
};

const OUTCOME_LABEL: Record<ActivityOutcome, MessageKey> = {
  completed: "activity.finished.completed",
  failed: "activity.finished.failed",
  cancelled: "activity.finished.cancelled",
};

/** Step-based progress text for background tasks (spec 4.3.6); shared by popover and mobile sheet. */
export function ActivityPanel({ activity }: { activity: ActivityState }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="pop-head">{t("activity.heading")}</div>
      {activity.running.length === 0 ? (
        <IdleActivity lastFinished={activity.lastFinished} />
      ) : (
        activity.running.map((task) => <RunningTask key={task.id} task={task} />)
      )}
    </div>
  );
}

function RunningTask({ task }: { task: ActivityTask }) {
  const { t } = useI18n();
  const source = task.source || t("activity.unknownSource");
  return (
    <div className="task">
      <div className="task-title">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{t("activity.crawlTitle", { source })}</span>
      </div>
      <div className="task-sub">{t(STEP_LABEL[task.step], { done: task.done, total: task.total })}</div>
      <div className="progress">
        <i style={{ width: `${progressPercent(task)}%` }} />
      </div>
    </div>
  );
}

function IdleActivity({ lastFinished }: { lastFinished: FinishedTask | null }) {
  const { t, language } = useI18n();
  return (
    <div className="task">
      <div className="muted">{t("activity.none")}</div>
      {lastFinished ? (
        <div className="small faint mt-1">
          {t(OUTCOME_LABEL[lastFinished.outcome], {
            source: lastFinished.source || t("activity.unknownSource"),
            time: formatTime(lastFinished.finishedAt, language),
          })}
        </div>
      ) : null}
    </div>
  );
}
```

`web/src/features/shell/ThemeButton.tsx`:

```tsx
"use client";

import { useI18n } from "@/i18n/useI18n";
import { useTheme } from "@/theme/useTheme";
import { Icon } from "@/ui/Icon";
import { THEME_ICON, THEME_LABEL } from "./PreferenceOptions";

/** Sidebar shortcut from the prototype: cycles light, dark, system. */
export function ThemeButton() {
  const { t } = useI18n();
  const { preference, cycle } = useTheme();
  return (
    <button type="button" className="side-btn" onClick={cycle} title={t("theme.cycle")}>
      <Icon icon={THEME_ICON[preference]} />
      <span>{t("theme.label")}</span>
      <span className="end small faint">{t(THEME_LABEL[preference])}</span>
    </button>
  );
}
```

`web/src/features/shell/PreferenceOptions.tsx`:

```tsx
"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/i18n/de";
import { LANGUAGES, type Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/theme";
import { useTheme } from "@/theme/useTheme";
import { Icon } from "@/ui/Icon";
import { Seg } from "@/ui/Seg";
import { useLanguageSwitch } from "./useLanguageSwitch";

export const THEME_ICON: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };
export const THEME_LABEL: Record<ThemePreference, MessageKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};
const LANGUAGE_LABEL: Record<Language, MessageKey> = { de: "language.de", en: "language.en" };

interface OptionItemProps {
  pressed: boolean;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
}

function OptionItem({ pressed, label, onSelect, icon }: OptionItemProps) {
  return (
    <button type="button" className="pop-item" aria-pressed={pressed} onClick={onSelect}>
      {icon ? <Icon icon={icon} /> : null}
      {label}
      {pressed ? <Icon icon={Check} className="pop-check" /> : null}
    </button>
  );
}

/** Popover list of the user menu. */
export function LanguageOptions() {
  const { t, language } = useI18n();
  const switchLanguage = useLanguageSwitch();
  return (
    <div role="group" aria-label={t("language.label")}>
      <div className="small faint pop-caption">{t("language.label")}</div>
      {LANGUAGES.map((option) => (
        <OptionItem key={option} pressed={option === language} label={t(LANGUAGE_LABEL[option])} onSelect={() => switchLanguage(option)} />
      ))}
    </div>
  );
}

export function ThemeOptions() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  return (
    <div role="group" aria-label={t("theme.label")}>
      <div className="small faint pop-caption">{t("theme.label")}</div>
      {THEME_PREFERENCES.map((option) => (
        <OptionItem key={option} pressed={option === preference} label={t(THEME_LABEL[option])} icon={THEME_ICON[option]} onSelect={() => setPreference(option)} />
      ))}
    </div>
  );
}

/** Segmented versions for the mobile "Mehr" sheet, as in the prototype. */
export function PreferenceSegs() {
  const { t, language } = useI18n();
  const switchLanguage = useLanguageSwitch();
  const { preference, setPreference } = useTheme();
  const themeOptions = THEME_PREFERENCES.map((value) => ({ value, label: t(THEME_LABEL[value]) }));
  const languageOptions = LANGUAGES.map((value) => ({ value, label: t(LANGUAGE_LABEL[value]) }));
  return (
    <div className="flex flex-col gap-3">
      <Seg options={themeOptions} value={preference} onChange={setPreference} label={t("theme.label")} />
      <Seg options={languageOptions} value={language} onChange={switchLanguage} label={t("language.label")} />
    </div>
  );
}
```

`web/src/features/shell/UserMenu.tsx`:

```tsx
"use client";

import { Ellipsis, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CurrentUser } from "@/api/auth";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { ACCOUNT_HREF, initialOf } from "./navigation";
import { LanguageOptions, ThemeOptions } from "./PreferenceOptions";
import { useLogout } from "./useLogout";

/** Account, language, theme and logout (spec 4.1). */
export function UserMenu({ user }: { user: CurrentUser }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-anchor">
      <button type="button" className="side-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">
          {initialOf(user.username)}
        </span>
        <span>{user.username}</span>
        <Icon icon={Ellipsis} className="end" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} placement="up" label={t("user.menu")}>
        <UserMenuPanel user={user} onNavigate={() => setOpen(false)} />
      </Popover>
    </div>
  );
}

function UserMenuPanel({ user, onNavigate }: { user: CurrentUser; onNavigate: () => void }) {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <>
      <div className="pop-head">
        {user.username}
        <div className="small faint font-normal">{t(user.is_admin ? "user.roleAdmin" : "user.roleMember")}</div>
      </div>
      <div className="pop-sep" />
      <Link className="pop-item" href={ACCOUNT_HREF} onClick={onNavigate}>
        <Icon icon={User} />
        {t("user.account")}
      </Link>
      <UserMenuPreferences />
      <button type="button" className="pop-item" onClick={logout}>
        <Icon icon={LogOut} />
        {t("user.logout")}
      </button>
    </>
  );
}

function UserMenuPreferences() {
  return (
    <>
      <div className="pop-sep" />
      <LanguageOptions />
      <div className="pop-sep" />
      <ThemeOptions />
      <div className="pop-sep" />
    </>
  );
}
```

- [ ] **Step 5: Bottom bar, "Mehr" sheet, global search and the shell**

`web/src/features/shell/BottomBar.tsx`:

```tsx
"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { CountBadge } from "@/ui/CountBadge";
import { Icon } from "@/ui/Icon";
import { MoreSheet } from "./MoreSheet";
import { BOTTOM_BAR_NAV, isActivePath, isMoreActive, type NavItem } from "./navigation";
import { useNavCounts } from "./useNavCounts";

/** Mobile navigation (below 768 px the sidebar is hidden). */
export function BottomBar({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const counts = useNavCounts(signedIn);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <nav className="bottombar" aria-label={t("nav.main")}>
      {BOTTOM_BAR_NAV.map((item) => (
        <BottomBarLink key={item.key} item={item} active={isActivePath(pathname, item.href)} badge={item.key === "inbox" ? counts.inbox : 0} />
      ))}
      <MoreButton active={isMoreActive(pathname)} onOpen={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} signedIn={signedIn} />
    </nav>
  );
}

function MoreButton({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="bb-item" aria-current={active ? "page" : undefined} onClick={onOpen}>
      <Icon icon={Menu} size="lg" />
      <span>{t("nav.more")}</span>
    </button>
  );
}

function BottomBarLink({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  const { t } = useI18n();
  return (
    <Link className="bb-item" href={item.href} aria-current={active ? "page" : undefined}>
      <Icon icon={item.icon} size="lg" />
      {badge > 0 ? <CountBadge count={badge} label={t("nav.newMatches", { count: badge })} /> : null}
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
```

`web/src/features/shell/MoreSheet.tsx`:

```tsx
"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/useI18n";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { Icon } from "@/ui/Icon";
import { PanelHeader } from "@/ui/PanelHeader";
import { ActivityPanel } from "./ActivityPanel";
import { MORE_NAV } from "./navigation";
import { PreferenceSegs } from "./PreferenceOptions";
import { useLogout } from "./useLogout";

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
}

/** Mobile "Mehr": profile, settings, activity, appearance, language and logout. */
export function MoreSheet({ open, onClose, signedIn }: MoreSheetProps) {
  const { t } = useI18n();
  return (
    <Drawer open={open} onClose={onClose} label={t("nav.more")} variant="sheet">
      <div className="panel-in">
        <PanelHeader title={t("nav.more")} onClose={onClose} />
        <MoreLinks onNavigate={onClose} />
        <MoreBody signedIn={signedIn} />
      </div>
    </Drawer>
  );
}

function MoreLinks({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="nav nav-sheet" aria-label={t("nav.more")}>
      {MORE_NAV.map((item) => (
        <Link key={item.href} href={item.href} onClick={onNavigate}>
          <Icon icon={item.icon} />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

function MoreBody({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const activity = useActivity(signedIn);
  const logout = useLogout();
  return (
    <>
      <hr className="div" />
      <ActivityPanel activity={activity} />
      <hr className="div" />
      <PreferenceSegs />
      <hr className="div" />
      <Button variant="ghost" icon={LogOut} onClick={logout}>
        {t("user.logout")}
      </Button>
    </>
  );
}
```

`web/src/features/shell/GlobalSearch.tsx`:

```tsx
"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Dialog } from "@/ui/Dialog";
import { TextField } from "@/ui/Field";
import { PanelHeader } from "@/ui/PanelHeader";

const SEARCH_SHORTCUT_KEY = "/";
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const CONTENT_EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

/** True for elements where "/" must type a slash instead of opening search. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.closest(CONTENT_EDITABLE_SELECTOR) !== null;
}

/** Spec 4.1: "/" opens a dialog that searches jobs and companies (results arrive in phase 7). */
export function GlobalSearch() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useSlashShortcut(() => setOpen(true));
  return (
    <Dialog open={open} onClose={() => setOpen(false)} label={t("search.label")}>
      <div className="panel-in">
        <PanelHeader title={t("search.label")} onClose={() => setOpen(false)} />
        <TextField id="global-search" type="search" label={t("search.inputLabel")} autoComplete="off" data-autofocus />
        <p className="hint">{t("search.hint")}</p>
      </div>
    </Dialog>
  );
}

function useSlashShortcut(onTrigger: () => void): void {
  const trigger = useEffectEvent(onTrigger);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const modified = event.metaKey || event.ctrlKey || event.altKey;
      if (event.key !== SEARCH_SHORTCUT_KEY || modified || isTypingTarget(event.target)) return;
      event.preventDefault();
      trigger();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}
```

`web/src/features/shell/AppShell.tsx`:

```tsx
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CurrentUser } from "@/api/auth";
import { ApiError } from "@/api/errors";
import { PageSkeleton } from "@/ui/Skeleton";
import { BottomBar } from "./BottomBar";
import { GlobalSearch } from "./GlobalSearch";
import { PageError } from "./PageError";
import { RealtimeProvider } from "./RealtimeProvider";
import { Sidebar } from "./Sidebar";
import { useCurrentUser } from "./useCurrentUser";
import { useServerLanguageSync } from "./useServerLanguageSync";

/** Frame of every signed-in page: sidebar (desktop), bottom bar (mobile), global search. */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useCurrentUser();
  return (
    <div className="app">
      <Sidebar user={session.data} />
      <main className="main" id="main">
        <ShellContent session={session}>{children}</ShellContent>
      </main>
      <BottomBar signedIn={session.isSuccess} />
      <GlobalSearch />
    </div>
  );
}

const isAuthError = (error: unknown) => error instanceof ApiError && error.code === "UNAUTHENTICATED";

function ShellContent({ session, children }: { session: UseQueryResult<CurrentUser>; children: ReactNode }) {
  if (session.data) return <SignedIn user={session.data}>{children}</SignedIn>;
  // An expired session is already redirecting to /login; keep the skeleton instead of flashing an error.
  if (session.isError && !isAuthError(session.error)) {
    return <PageError error={session.error} onRetry={() => void session.refetch()} />;
  }
  return <PageSkeleton />;
}

function SignedIn({ user, children }: { user: CurrentUser; children: ReactNode }) {
  useServerLanguageSync();
  return <RealtimeProvider userId={user.id}>{children}</RealtimeProvider>;
}
```

- [ ] **Step 6: Placeholder pages, 404 and routes**

`web/src/features/placeholder/PlaceholderPage.tsx`:

```tsx
"use client";

import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";

/** Phase 1 stand-in for a route; later phases replace it with the real screen. */
export function PlaceholderPage({ titleKey, number }: { titleKey: MessageKey; number?: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <Masthead number={number} title={t(titleKey)} deck={t("placeholder.deck")} />
    </div>
  );
}
```

`web/src/features/placeholder/NotFoundView.tsx`:

```tsx
"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/api/session";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";

export function NotFoundView() {
  const { t } = useI18n();
  const back = (
    <Link className="btn" href={DEFAULT_AFTER_LOGIN_PATH}>
      {t("notFound.back")}
    </Link>
  );
  return (
    <div className="page">
      <EmptyState icon={SearchX} title={t("notFound.title")} actions={back}>
        {t("notFound.text")}
      </EmptyState>
    </div>
  );
}
```

`web/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

`web/app/(app)/inbox/page.tsx`:

```tsx
import { navNumber } from "@/features/shell/navigation";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function InboxPage() {
  return <PlaceholderPage titleKey="nav.inbox" number={navNumber("inbox")} />;
}
```

`web/app/(app)/applications/page.tsx`:

```tsx
import { navNumber } from "@/features/shell/navigation";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function ApplicationsPage() {
  return <PlaceholderPage titleKey="nav.applications" number={navNumber("applications")} />;
}
```

`web/app/(app)/sources/page.tsx`:

```tsx
import { navNumber } from "@/features/shell/navigation";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function SourcesPage() {
  return <PlaceholderPage titleKey="nav.sources" number={navNumber("sources")} />;
}
```

`web/app/(app)/profile/page.tsx`:

```tsx
import { navNumber } from "@/features/shell/navigation";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function ProfilePage() {
  return <PlaceholderPage titleKey="nav.profile" number={navNumber("profile")} />;
}
```

`web/app/(app)/settings/page.tsx`:

```tsx
import { SETTINGS_NUMBER } from "@/features/shell/navigation";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function SettingsPage() {
  return <PlaceholderPage titleKey="nav.settings" number={SETTINGS_NUMBER} />;
}
```

`web/app/(app)/companies/page.tsx` (not in the main nav, so no number; spec 4.2):

```tsx
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function CompaniesPage() {
  return <PlaceholderPage titleKey="nav.companies" />;
}
```

`web/app/(app)/jobs/[id]/page.tsx`:

```tsx
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";

export default function JobPage() {
  return <PlaceholderPage titleKey="page.job" />;
}
```

`web/app/not-found.tsx`:

```tsx
import { NotFoundView } from "@/features/placeholder/NotFoundView";

export default function NotFound() {
  return <NotFoundView />;
}
```

`navigation.ts` imports `lucide-react` only and has no `"use client"`, so the server route files may import `navNumber` from it.

- [ ] **Step 7: Port the shell styles**

`web/src/features/shell/shell.css` (prototype "app shell" and "mobile bottom bar" sections; `.nav-sheet` replaces the prototype's inline 48 px rows):

```css
/* App shell ported from docs/prototype/clickdummy-editorial.html. */
@layer components {
  .app { display: grid; grid-template-columns: var(--sidebar-w) minmax(0,1fr); min-height: 100vh; min-height: 100dvh; }
  /* Sidebar and bottom bar are always ink: they re-map the tokens for everything inside. */
  .sidebar, .bottombar {
    --surface: var(--sb-raised); --float: var(--sb-raised); --hover: var(--sb-raised); --line: var(--sb-line); --line-strong: var(--sb-line);
    --text: var(--sb-text); --text-2: var(--sb-text-2); --text-3: var(--sb-text-3); --accent: var(--sb-accent); --accent-text: var(--sb-accent);
    --focus: var(--sb-accent); --on-accent: var(--sb-bg); --bg: var(--sb-bg);
    background: var(--sb-bg); color: var(--sb-text);
  }
  .sidebar { position: sticky; top: 0; height: 100vh; height: 100dvh; display: flex; flex-direction: column; gap: var(--s1); padding: 22px 0 14px; z-index: 30; }
  :root[data-mode="dark"] .sidebar { border-right: 1px solid var(--sb-line); }
  .brand { display: flex; align-items: baseline; gap: 8px; padding: 0 22px 30px; }
  .brand-word { font: 700 23px/1 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.035em; }
  .brand-mark { width: 9px; height: 9px; background: var(--accent); flex: none; align-self: center; }
  .nav { display: flex; flex-direction: column; }
  .nav a { position: relative; display: grid; grid-template-columns: 26px minmax(0,1fr) auto; align-items: baseline; gap: 4px; padding: 9px 22px 10px; color: var(--text-2); text-decoration: none; transition: color var(--t-fast) var(--ease); }
  .nav-no { font: 600 12px/1 var(--font-ui); font-variant-numeric: tabular-nums; color: var(--text-3); }
  .nav-label { font: 600 25px/1.05 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.03em; }
  .nav a:hover { color: var(--text); }
  .nav a[aria-current="page"] { color: var(--text); }
  .nav a[aria-current="page"] .nav-no { color: var(--accent); }
  .nav a[aria-current="page"]::before { content: ""; position: absolute; left: 0; top: 8px; bottom: 9px; width: 5px; background: var(--accent); }
  .nav a .count-badge, .nav a .count-plain { align-self: center; }
  .nav a .t-danger { color: var(--sb-accent); }
  .nav-sheet a { align-items: center; height: 48px; padding: 0; }
  .sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 1px; border-top: 1px solid var(--line); padding: 10px 10px 0; }
  .side-btn { display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; padding: 0 12px; border-radius: var(--r-ctl); border: 0; background: none; color: var(--text-2); font-size: var(--fs-13); font-weight: 500; cursor: pointer; text-align: left; text-decoration: none; }
  .side-btn:hover { background: var(--hover); color: var(--text); text-decoration: none; }
  .side-btn[aria-current="page"] { color: var(--text); background: var(--hover); box-shadow: inset 3px 0 0 var(--accent); }
  .side-btn .end { margin-left: auto; }
  .activity-live { color: var(--text); }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--text); color: var(--bg); display: grid; place-items: center; font-size: 10px; font-weight: 700; flex: none; }
  .bottombar { display: none; }

  @media (max-width: 767px) {
    .app { grid-template-columns: minmax(0,1fr); }
    .sidebar { display: none; }
    .main { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
    .bottombar { display: grid; grid-template-columns: repeat(4, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; padding-bottom: env(safe-area-inset-bottom); }
    .bb-item { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 62px; border: 0; background: none; color: var(--text-2); font-size: 11.5px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .bb-item[aria-current="page"] { color: var(--text); }
    .bb-item[aria-current="page"]::before { content: ""; position: absolute; top: 0; left: 22%; right: 22%; height: 4px; background: var(--accent); }
    .bb-item .count-badge { position: absolute; top: 7px; left: calc(50% + 6px); min-width: 18px; height: 17px; font-size: 10.5px; padding: 0 5px; }
  }
}
```

Then add the import to `web/app/globals.css` below the overlay import:

```css
@import "../src/features/shell/shell.css";
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/shell.test.tsx`
Expected: PASS, 16 tests.

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green; the build lists `/inbox`, `/applications`, `/jobs/[id]`, `/sources`, `/companies`, `/profile`, `/settings`.

### Task 11: Login page

**Files:**
- Create: `web/src/features/auth/credentials.ts`, `web/src/features/auth/LoginForm.tsx`, `web/src/features/auth/LoginScreen.tsx`, `web/src/features/auth/auth.css`
- Create: `web/app/login/page.tsx`
- Modify: `web/app/globals.css` (add `@import "../src/features/auth/auth.css";` below the shell import)
- Test: `web/tests/unit/features/login.test.tsx`

**Interfaces:**
- Consumes: `login`, `Credentials` (Task 5); `ApiError`, `describeError`, `safeNextPath` (Task 4); `TextField`, `Button`, `Notice`, `Masthead` (Tasks 7, 8); `renderWithProviders`, `createFakeFetch` (test support).
- Produces: `/login` route; `readCredentials(form)`, `validateCredentials(credentials): FieldErrors`, `loginErrorMessage(error, t)` (`@/features/auth/credentials`); `LoginForm`, `LoginScreen`.

**Decision:** the prototype labels the first field "E-Mail", but `POST /auth/login` authenticates a **username** (OAuth2 form field `username`, inventory A.1). The field is labelled "Benutzername". Empty fields are caught in the browser (the server's 422 text is English and generic). After success the user goes to `safeNextPath(?next)`, i.e. back to where the session ended, never off-site.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/login.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateCredentials } from "@/features/auth/credentials";
import { LoginForm } from "@/features/auth/LoginForm";
import { createFakeFetch, jsonResponse, type RecordedCall, type Responder } from "../support/fakeFetch";
import { renderWithProviders } from "../support/render";

// next/navigation needs the App Router at runtime; it is the framework boundary here.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function stubApi(responder: Responder): RecordedCall[] {
  const fake = createFakeFetch(responder);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

async function submit(username: string, password: string) {
  renderWithProviders(<LoginForm />);
  if (username) await userEvent.type(screen.getByLabelText("Benutzername"), username);
  if (password) await userEvent.type(screen.getByLabelText("Passwort"), password);
  await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

describe("LoginForm", () => {
  it("asks for both fields before calling the server", async () => {
    const calls = stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("", "");
    expect(screen.getAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it("shows a German message for wrong credentials, not the server text", async () => {
    stubApi(() => jsonResponse(401, { detail: "Incorrect username or password" }));
    await submit("admin", "falsch");
    expect(await screen.findByRole("alert")).toHaveTextContent("Benutzername oder Passwort ist falsch.");
    expect(screen.queryByText(/Incorrect/)).not.toBeInTheDocument();
  });

  it("asks the user to wait when rate limited", async () => {
    stubApi(() => jsonResponse(429, { error: "Rate limit exceeded: 5 per 1 minute" }));
    await submit("admin", "falsch");
    expect(await screen.findByRole("alert")).toHaveTextContent("Zu viele Anfragen, bitte kurz warten.");
  });

  it("returns to the page in ?next after a successful login", async () => {
    navigation.search = "next=%2Fsources%3Fquelle%3D3";
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("admin", "geheim");
    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/sources?quelle=3"));
  });

  it("goes to the inbox when ?next points to another site", async () => {
    navigation.search = "next=%2F%2Fevil.example";
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("admin", "geheim");
    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/inbox"));
  });
});

describe("validateCredentials", () => {
  it("trims nothing from the password but requires both values", () => {
    expect(validateCredentials({ username: "admin", password: " " })).toEqual({});
    expect(validateCredentials({ username: "", password: "" })).toEqual({
      username: "login.required",
      password: "login.required",
    });
  });
});
```

The `if` lines live in the `submit` helper, not in a test body, so the tests themselves stay free of control flow.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/login.test.tsx`
Expected: FAIL with `Failed to resolve import "@/features/auth/credentials"`.

- [ ] **Step 3: Implement the form logic and components**

`web/src/features/auth/credentials.ts`:

```ts
import type { Credentials } from "@/api/auth";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

export type CredentialField = keyof Credentials;
export type FieldErrors = Partial<Record<CredentialField, MessageKey>>;

/** Usernames are trimmed (copy-paste whitespace); passwords are taken exactly as typed. */
export function readCredentials(form: HTMLFormElement): Credentials {
  const data = new FormData(form);
  return { username: String(data.get("username") ?? "").trim(), password: String(data.get("password") ?? "") };
}

export function validateCredentials(credentials: Credentials): FieldErrors {
  const errors: FieldErrors = {};
  if (credentials.username === "") errors.username = "login.required";
  if (credentials.password === "") errors.password = "login.required";
  return errors;
}

/** On the login form a 401 means wrong credentials, not an expired session. */
export function loginErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.code === "UNAUTHENTICATED") return t("login.failed");
  return describeError(error, t);
}
```

`web/src/features/auth/LoginForm.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login } from "@/api/auth";
import { safeNextPath } from "@/api/session";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { loginErrorMessage, readCredentials, validateCredentials, type CredentialField, type FieldErrors } from "./credentials";

interface LoginField {
  name: CredentialField;
  type: "text" | "password";
  labelKey: MessageKey;
  autoComplete: string;
}

const LOGIN_FIELDS: readonly LoginField[] = [
  { name: "username", type: "text", labelKey: "login.username", autoComplete: "username" },
  { name: "password", type: "password", labelKey: "login.password", autoComplete: "current-password" },
];

export function LoginForm() {
  const { t } = useI18n();
  const { fieldErrors, onSubmit, mutation } = useLoginForm();
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <CredentialFields errors={fieldErrors} />
      {mutation.isError ? <Notice tone="error">{loginErrorMessage(mutation.error, t)}</Notice> : null}
      <Button type="submit" variant="primary" busy={mutation.isPending} className="auth-submit">
        {t("login.submit")}
      </Button>
    </form>
  );
}

function CredentialFields({ errors }: { errors: FieldErrors }) {
  const { t } = useI18n();
  return LOGIN_FIELDS.map((field) => {
    const errorKey = errors[field.name];
    return (
      <TextField
        key={field.name}
        id={`login-${field.name}`}
        name={field.name}
        type={field.type}
        label={t(field.labelKey)}
        autoComplete={field.autoComplete}
        error={errorKey && t(errorKey)}
      />
    );
  });
}

function useLoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mutation = useMutation({ mutationFn: login, onSuccess: () => router.replace(next) });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const credentials = readCredentials(event.currentTarget);
    const errors = validateCredentials(credentials);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) mutation.mutate(credentials);
  };
  return { fieldErrors, onSubmit, mutation };
}
```

`web/src/features/auth/LoginScreen.tsx`:

```tsx
"use client";

import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { LoginForm } from "./LoginForm";

/** Split screen from the prototype: ink brand side, form on paper. */
export function LoginScreen() {
  const { t } = useI18n();
  return (
    <div className="auth">
      <AuthSide />
      <main className="auth-main">
        <div className="auth-box">
          <Masthead title={t("login.title")} small />
          <LoginForm />
        </div>
      </main>
    </div>
  );
}

function AuthSide() {
  const { t } = useI18n();
  return (
    <div className="auth-side">
      <div>
        <p className="auth-word">
          {t("app.name")
            .split(" ")
            .map((word) => (
              <span key={word} className="block">
                {word}
              </span>
            ))}
        </p>
        <p className="auth-deck">{t("app.description")}</p>
      </div>
      <p className="small auth-foot">{t("login.foot")}</p>
    </div>
  );
}
```

`web/app/login/page.tsx` (`useSearchParams` needs a Suspense boundary for static rendering):

```tsx
import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/LoginScreen";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
```

- [ ] **Step 4: Port the login styles**

`web/src/features/auth/auth.css` (prototype "auth" section; the accent full stop moves from markup into `::after` because it is decoration; `.auth-form` and `.auth-submit` replace inline styles):

```css
/* Login screen ported from docs/prototype/clickdummy-editorial.html. */
@layer components {
  .auth { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
  .auth-side { --text: var(--sb-text); --text-2: var(--sb-text-2); --accent-text: var(--sb-accent); background: var(--sb-bg); color: var(--sb-text); padding: 48px; display: flex; flex-direction: column; justify-content: space-between; }
  .auth-word { font: 760 clamp(56px, 8vw, 120px)/0.86 var(--font-display); font-optical-sizing: auto; letter-spacing: -0.055em; }
  .auth-word > span:last-child::after { content: "."; color: var(--accent-text); }
  .auth-deck { font-size: 16px; color: var(--text-2); max-width: 34ch; margin-top: 22px; }
  .auth-foot { color: var(--sb-text-3); }
  .auth-main { display: grid; place-items: center; padding: 32px 24px; }
  .auth-box { width: min(380px, 100%); }
  .auth-form { margin-top: 22px; }
  .auth-form .notice { margin-top: var(--s4); }
  .auth-submit { width: 100%; margin-top: 22px; }

  @media (max-width: 767px) {
    .auth { grid-template-columns: 1fr; }
    .auth-side { padding: 28px 16px 26px; }
    .auth-word { font-size: 56px; }
    .auth-deck { margin-top: 12px; font-size: 14px; }
    .auth-foot { display: none; }
    .auth-main { place-items: start center; padding: 28px 16px; }
  }
}
```

Then add the import to `web/app/globals.css` below the shell import:

```css
@import "../src/features/auth/auth.css";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/login.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green; the build lists `/login`.

### Task 12: Playwright smoke suite (mocked API, both themes, 1440 / 390 / 375)

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/tests/e2e/support/constants.ts`, `web/tests/e2e/support/mockApi.ts`, `web/tests/e2e/support/fixtures.ts`, `web/tests/e2e/support/page.ts`
- Test: `web/tests/e2e/login.spec.ts`, `web/tests/e2e/shell.spec.ts`
- Output (gitignored): `web/tests/e2e/__screenshots__/*.png`

**Interfaces:**
- Consumes: the built app (`pnpm test:e2e` builds with `NEXT_PUBLIC_API_URL=http://localhost:3101/mock-api`), `THEME_STORAGE_KEY` (Task 2).
- Produces: `mockApi(page, routes): Promise<ApiLog>` with `ApiLog { requests: string[]; unexpected: string[] }` and route keys like `"GET /me"` (query strings ignored); `collectConsoleErrors(page)`, `saveScreenshot(page, name)`, `horizontalOverflow(page)`; fixtures `ADMIN_USER`, `AUTHENTICATED_ROUTES`, `LOGIN_OK`, `UNAUTHORIZED`. Later phases add their journeys on top of these helpers.

**Decision:** the API base for e2e is a path on the app's own origin (`/mock-api`), so the browser needs no CORS and `page.route` fulfils every call before it reaches the Next server; `page.routeWebSocket` accepts `/mock-api/ws` without a server. An API call without a fixture is answered with 404 and recorded in `unexpected`, and every test asserts that list is empty, so fixtures cannot silently drift. The installed Chromium headless shell 1248 matches `@playwright/test` 1.64.0; `env.sh` provides `PLAYWRIGHT_BROWSERS_PATH`, `LD_LIBRARY_PATH` and `FONTCONFIG_FILE`. Contrast checks on token pairs (spec 5, 7) belong to the phase 8 QA pass; phase 1 relies on the prototype's computed values recorded in `tokens.css`.

- [ ] **Step 1: Configuration and support**

`web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT } from "./tests/e2e/support/constants";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    // German is the product default; the browser locale drives the first-visit language.
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // next start warns that standalone output prefers server.js; it serves the same build.
    command: `pnpm exec next start -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

`web/tests/e2e/support/constants.ts`:

```ts
export const E2E_PORT = 3101;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
// Must match NEXT_PUBLIC_API_URL in the "test:e2e" script of package.json.
export const MOCK_API_PREFIX = "/mock-api";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 375, height: 812 },
} as const;

export const SCREENSHOT_SIZES = [
  ["1440", VIEWPORTS.desktop],
  ["390", VIEWPORTS.mobile],
] as const;

export const COLOR_SCHEMES = ["light", "dark"] as const;
```

`web/tests/e2e/support/mockApi.ts`:

```ts
import type { Page, Request, Route } from "@playwright/test";
import { MOCK_API_PREFIX } from "./constants";

export interface MockResponse {
  status?: number;
  body: unknown;
}

/** Keys are "METHOD /path" without query string, e.g. "GET /jobs/counts". */
export type MockRoutes = Readonly<Record<string, MockResponse>>;

export interface ApiLog {
  requests: string[];
  unexpected: string[];
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

export async function mockApi(page: Page, routes: MockRoutes): Promise<ApiLog> {
  const log: ApiLog = { requests: [], unexpected: [] };
  await page.route(`**${MOCK_API_PREFIX}/**`, (route) => fulfil(route, routes, log));
  // Accept the realtime socket without a server; later phases push events through this handler.
  await page.routeWebSocket(new RegExp(`${MOCK_API_PREFIX}/ws$`), () => undefined);
  return log;
}

function routeKey(request: Request): string {
  const { pathname } = new URL(request.url());
  return `${request.method()} ${pathname.slice(pathname.indexOf(MOCK_API_PREFIX) + MOCK_API_PREFIX.length)}`;
}

async function fulfil(route: Route, routes: MockRoutes, log: ApiLog): Promise<void> {
  const key = routeKey(route.request());
  log.requests.push(key);
  const response = routes[key];
  if (!response) log.unexpected.push(key);
  await route.fulfill({
    status: response ? (response.status ?? HTTP_OK) : HTTP_NOT_FOUND,
    json: response ? response.body : { detail: "not mocked" },
  });
}
```

`web/tests/e2e/support/fixtures.ts`:

```ts
import type { MockResponse, MockRoutes } from "./mockApi";

export const ADMIN_USER = { id: 1, username: "admin", is_admin: true };
export const LOGIN_OK: MockResponse = { body: { status: "ok" } };
export const UNAUTHORIZED: MockResponse = { status: 401, body: { detail: "Could not validate credentials" } };

/** Shapes after backend phase 0 (B6 counts, B9 last_run); one source fails, one crawl runs. */
export const AUTHENTICATED_ROUTES: MockRoutes = {
  "GET /me": { body: ADMIN_USER },
  "GET /settings": { body: { role: "Backend-Entwickler", language: "de" } },
  "GET /jobs/counts": { body: { status_counts: { OPEN: 3, DRAFTED: 1, APPLIED: 2 }, domain_counts: [] } },
  "GET /platforms": {
    body: [
      { id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs/kotlin", last_run: { error: null } },
      { id: 2, name: "Indeed", url: "https://de.indeed.com/jobs?q=kotlin", last_run: { error: "Seite nicht erreichbar" } },
    ],
  },
  "GET /scraper/crawl-status": {
    body: {
      jobs: [{ job_id: "crawl-1", platform: "https://www.stepstone.de/jobs/kotlin", status: "crawling", total: 12, scraping_completed: 5 }],
    },
  },
};
```

`web/tests/e2e/support/page.ts`:

```ts
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const SCREENSHOT_DIR = fileURLToPath(new URL("../__screenshots__/", import.meta.url));

/** Console errors and uncaught exceptions; spec 7 requires none per journey. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Full-page PNG for the visual review against the prototype (not a pixel baseline). */
export async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SCREENSHOT_DIR}${name}.png`, fullPage: true });
}

/** Pixels the document is wider than the viewport; 0 means no horizontal scroll. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
```

- [ ] **Step 2: Write the login specs**

`web/tests/e2e/login.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../../src/theme/theme";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { AUTHENTICATED_ROUTES, LOGIN_OK } from "./support/fixtures";
import { mockApi } from "./support/mockApi";
import { collectConsoleErrors, horizontalOverflow, saveScreenshot } from "./support/page";

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`login renders at ${size}px in ${scheme} mode`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const api = await mockApi(page, {});
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-mode", scheme);
      await saveScreenshot(page, `login-${size}-${scheme}`);
      expect(errors).toEqual([]);
      expect(api.unexpected).toEqual([]);
    });
  }
}

test("logs in and lands on the inbox", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const api = await mockApi(page, { ...AUTHENTICATED_ROUTES, "POST /auth/login": LOGIN_OK });
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("qa-admin");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/inbox`);
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  expect(errors).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

test("shows a German message for wrong credentials", async ({ page }) => {
  await mockApi(page, { "POST /auth/login": { status: 401, body: { detail: "Incorrect username or password" } } });
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("falsch");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("alert")).toHaveText("Benutzername oder Passwort ist falsch.");
});

test("returns to the requested page after login", async ({ page }) => {
  await mockApi(page, { ...AUTHENTICATED_ROUTES, "POST /auth/login": LOGIN_OK });
  await page.goto("/login?next=%2Fsources");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("qa-admin");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Quellen" })).toBeVisible();
});

test("ignores an off-site next parameter", async ({ page }) => {
  await mockApi(page, { ...AUTHENTICATED_ROUTES, "POST /auth/login": LOGIN_OK });
  await page.goto("/login?next=%2F%2Fevil.example");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("qa-admin");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/inbox`);
});

test("applies a stored dark theme before first paint", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, "dark");
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.setAttribute("data-first-mode", document.documentElement.dataset.mode ?? "");
    });
  }, THEME_STORAGE_KEY);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-first-mode", "dark");
});

test("has no horizontal scroll at 375 px", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/login");
  expect(await horizontalOverflow(page)).toBe(0);
});
```

- [ ] **Step 3: Write the shell specs**

`web/tests/e2e/shell.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { COLOR_SCHEMES, E2E_BASE_URL, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { AUTHENTICATED_ROUTES, UNAUTHORIZED } from "./support/fixtures";
import { mockApi } from "./support/mockApi";
import { collectConsoleErrors, horizontalOverflow, saveScreenshot } from "./support/page";

const PLACEHOLDER_ROUTES = [
  ["/applications", "Bewerbungen"],
  ["/sources", "Quellen"],
  ["/profile", "Profil"],
  ["/settings", "Einstellungen"],
  ["/companies", "Firmen"],
  ["/jobs/job-1", "Stelle"],
] as const;

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`shell renders at ${size}px in ${scheme} mode`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const api = await mockApi(page, AUTHENTICATED_ROUTES);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
      await expect(nav.getByRole("link", { name: /Eingang/ })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: /Eingang/ })).toContainText("3");
      await saveScreenshot(page, `shell-${size}-${scheme}`);
      expect(errors).toEqual([]);
      expect(api.unexpected).toEqual([]);
    });
  }
}

test("sidebar shows failing sources and the running crawl", async ({ page }) => {
  await mockApi(page, AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await expect(page.getByText("1 Fehler")).toBeVisible();
  await page.getByRole("button", { name: "1 Aufgabe läuft" }).click();
  await expect(page.getByText("Links sammeln: 5 von 12")).toBeVisible();
});

for (const [path, heading] of PLACEHOLDER_ROUTES) {
  test(`${path} shows its placeholder page`, async ({ page }) => {
    const api = await mockApi(page, AUTHENTICATED_ROUTES);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });
}

test("redirects to login when the session cannot be restored", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await mockApi(page, { "GET /me": UNAUTHORIZED, "POST /auth/refresh": UNAUTHORIZED });
  await page.goto("/inbox");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/login?next=%2Finbox`);
  // The browser itself logs the two expected 401 responses; anything else is a defect.
  expect(errors.filter((text) => !text.includes("401"))).toEqual([]);
});

test("opens global search with / and closes it with Escape", async ({ page }) => {
  await mockApi(page, AUTHENTICATED_ROUTES);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Suche" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Suche" })).toBeHidden();
});

test("switches the language from the user menu and stores it", async ({ page }) => {
  const api = await mockApi(page, {
    ...AUTHENTICATED_ROUTES,
    "POST /language-preference": { body: { status: "ok", language: "en" } },
  });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await page.getByRole("button", { name: "admin" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  expect(api.requests).toContain("POST /language-preference");
});

test("has no horizontal scroll at 375 px", async ({ page }) => {
  await mockApi(page, AUTHENTICATED_ROUTES);
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Eingang" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});
```

The `for` loops generate one test per size, scheme or route (data-driven parametrisation); the test bodies themselves contain no control flow.

- [ ] **Step 4: Run the suite**

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: the build succeeds, then `25 passed` (login: 4 renders + 6 journeys; shell: 4 renders + 1 sidebar + 6 placeholders + 4 journeys). If the run fails, open `$QA/web/test-results/**/trace.zip` with `"$QA"/webrun.sh pnpm exec playwright show-trace <path>` or read the error context printed by the list reporter; fix the app, not the assertion.

- [ ] **Step 5: Copy the screenshots back for review**

Run: `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/`
Expected: 8 PNGs (`login-1440-light.png`, `login-1440-dark.png`, `login-390-light.png`, `login-390-dark.png`, `shell-1440-light.png`, `shell-1440-dark.png`, `shell-390-light.png`, `shell-390-dark.png`). They are gitignored; the reviewer compares them with `node "$QA"/shot.mjs "$REPO"/docs/prototype/clickdummy-editorial.html "$QA"/editorial-1440.png 1440` (and `390`), looking at the sidebar, the masthead and the login split screen.

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green. (`pnpm build` rebuilds with the production placeholder after the e2e build.)

### Task 13: Docker image, compose service and README

**Files:**
- Create: `web/Dockerfile`, `web/Dockerfile.dev`, `web/.dockerignore`, `web/env.sh`, `web/README.md`
- Modify: `docker-compose.yml` (new service, `ALLOWED_ORIGINS` default), `docker-compose.dev.yml` (dev override, `ALLOWED_ORIGINS` default), `.env.example`

**Interfaces:**
- Consumes: `pnpm build` with `output: "standalone"` and the `APP_API_URL` placeholder from `.env.production` (Task 1).
- Produces: compose service `ai-job-agent-web` on host port 3001; runtime variable `APP_API_URL` (default `http://localhost:8002`); optional `ASSET_DIR` (default `./.next/static`).

**Decision:** same mechanism as the old frontend (spec 2.2: "`env.sh`, `APP_API_URL` placeholder replaced at container start"), simplified and fixed: it replaces exactly the token `APP_API_URL` instead of every variable with an `APP_` prefix, fails instead of running `continue` outside a loop when the directory is missing, and touches only `*.js` files. The build uses the public npm registry through Corepack (spec 2.4: no committed `.npmrc`). Node 22 (Node 20 is end-of-life).

- [ ] **Step 1: Write the runtime injection script and test it first**

`web/env.sh`:

```sh
#!/bin/sh
# Container entrypoint. Production bundles contain the literal APP_API_URL (from .env.production);
# this swaps it for the runtime value so one image works against any API host, then starts the server.
set -eu

PLACEHOLDER="APP_API_URL"
: "${APP_API_URL:?APP_API_URL must be set to the public API base URL, e.g. http://localhost:8002}"
ASSET_DIR="${ASSET_DIR:-./.next/static}"

if [ ! -d "$ASSET_DIR" ]; then
  echo "env.sh: asset directory '$ASSET_DIR' not found" >&2
  exit 1
fi

echo "env.sh: replacing $PLACEHOLDER with $APP_API_URL in $ASSET_DIR"
find "$ASSET_DIR" -type f -name '*.js' -exec sed -i "s|${PLACEHOLDER}|${APP_API_URL}|g" {} +

exec "$@"
```

Run (fake bundle in the scratchpad):

```bash
T="$(mktemp -d -p "$QA/..")" && mkdir -p "$T/.next/static/chunks" && printf 'const u="APP_API_URL";' > "$T/.next/static/chunks/a.js"
(cd "$T" && APP_API_URL=http://localhost:8002 sh "$REPO/web/env.sh" cat .next/static/chunks/a.js)
(cd "$T" && env -u APP_API_URL sh "$REPO/web/env.sh" true; echo "exit=$?")
```

Expected: first command prints `env.sh: replacing ...` and `const u="http://localhost:8002";`; second prints `APP_API_URL must be set ...` and `exit=2` (any non-zero).

- [ ] **Step 2: Verify a production build carries the placeholder**

Run: `"$QA"/webrun.sh sh -c 'pnpm build && grep -rl "APP_API_URL" .next/static | head -3 && test -f .next/standalone/server.js && echo standalone-ok'`
Expected: at least one chunk path and `standalone-ok`.

- [ ] **Step 3: Dockerfiles**

`web/Dockerfile`:

```dockerfile
# Production image: Next.js standalone server, API URL injected at start by env.sh.
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack installs the pnpm version pinned in package.json ("packageManager").
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .env.production sets NEXT_PUBLIC_API_URL=APP_API_URL, the placeholder env.sh replaces.
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# env.sh rewrites these files at start, so the runtime user must own them.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY env.sh /docker-entrypoint.sh
# Strip CR in case the file was checked out on Windows with CRLF line endings.
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod 755 /docker-entrypoint.sh
USER nextjs
EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

`web/Dockerfile.dev`:

```dockerfile
# Development image: next dev with the source mounted from the host (docker-compose.dev.yml).
FROM node:22-alpine
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
EXPOSE 3001
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
```

`web/.dockerignore`:

```
node_modules
.next
test-results
playwright-report
tests/e2e/__screenshots__
*.tsbuildinfo
next-env.d.ts
Dockerfile*
```

- [ ] **Step 4: Compose and `.env.example`**

In `docker-compose.yml`, change the server's origin default (line `- ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3000}`) to:

```yaml
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:3001}
```

and add after the `ai-job-agent-frontend` service (before `volumes:`):

```yaml
  # New UI (frontend redesign) next to the old one until the cutover (spec 2.1).
  ai-job-agent-web:
    build: ./web
    ports:
      - "3001:3001"
    environment:
      - APP_API_URL=${APP_API_URL:-http://localhost:8002}
    container_name: ai-job-agent-web
    hostname: ai-job-agent-web
    depends_on:
      - ai-job-agent-server
```

In `docker-compose.dev.yml`, change the server's `ALLOWED_ORIGINS` line the same way:

```yaml
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:3001}
```

and add after the `ai-job-agent-frontend` override:

```yaml
  ai-job-agent-web:
    build:
      context: ./web
      dockerfile: Dockerfile.dev
    environment:
      - NEXT_PUBLIC_API_URL=${APP_API_URL:-http://localhost:8002}
    volumes:
      - ./web:/app
      - /app/node_modules
      - /app/.next
```

In `.env.example`, replace `ALLOWED_ORIGINS=http://localhost:3000` with:

```
# 3000 = current UI, 3001 = new UI (web/) during the frontend redesign
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

- [ ] **Step 5: Validate the compose files**

Docker is not available in this container, so parse and assert with PyYAML (from the private registry via `PIP_INDEX_URL` in `env.sh`):

```bash
. "$QA"/env.sh && pip install --quiet pyyaml==6.0.3 && python - <<'PY'
import yaml
repo = "/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer"
base = yaml.safe_load(open(f"{repo}/docker-compose.yml"))["services"]
dev = yaml.safe_load(open(f"{repo}/docker-compose.dev.yml"))["services"]
origin = lambda service: next(e for e in service["environment"] if e.startswith("ALLOWED_ORIGINS"))
assert base["ai-job-agent-web"]["build"] == "./web"
assert base["ai-job-agent-web"]["ports"] == ["3001:3001"]
assert "http://localhost:3001" in origin(base["ai-job-agent-server"])
assert dev["ai-job-agent-web"]["build"]["dockerfile"] == "Dockerfile.dev"
assert "http://localhost:3001" in origin(dev["ai-job-agent-server"])
print("compose ok")
PY
```

Expected: `compose ok`. On a machine with Docker, also run `docker compose config --quiet` and `docker compose build ai-job-agent-web` (expected: exit 0); note in the hand-off that this was not possible in the container.

- [ ] **Step 6: README**

`web/README.md`:

````markdown
# Job Agent web UI (`web/`)

The new interface of the AI Job Agent, built next to the old `frontend/` until the cutover
(see `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md`). Next.js 16 App Router,
React 19, TypeScript strict, Tailwind CSS v4, TanStack Query.

## Quick start

Requirements: Node 22.12 or newer and pnpm 10 (`corepack enable` installs the pinned version).

```bash
cd web
pnpm install
pnpm dev            # http://localhost:3001, talks to the API at NEXT_PUBLIC_API_URL
```

Start the backend first (`docker compose up ai-job-agent-server`, API on http://localhost:8002) and
log in with the admin account. The API must allow the origin `http://localhost:3001`
(`ALLOWED_ORIGINS`, already the compose default).

With Docker: `docker compose up ai-job-agent-web` (production image) or
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up ai-job-agent-web` (hot reload).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on port 3001 |
| `pnpm build` | Production build (`.next/standalone`) with the `APP_API_URL` placeholder |
| `pnpm start` | Serves the last build on port 3001 |
| `pnpm lint` | ESLint (zero warnings) and Prettier check |
| `pnpm format` | Prettier write |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` (also checks DE/EN dictionary parity) |
| `pnpm test` | Vitest unit tests (`tests/unit`) |
| `pnpm test:e2e` | Builds against a mocked API and runs Playwright (`tests/e2e`); screenshots land in `tests/e2e/__screenshots__/` (gitignored) |

## Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | build and dev | `.env.development`: `http://localhost:8002`; `.env.production`: `APP_API_URL` | REST base URL; the WebSocket URL is derived from it (`http` -> `ws`, `/ws`) |
| `APP_API_URL` | Docker runtime (`env.sh`) | `http://localhost:8002` (compose) | Replaces the `APP_API_URL` placeholder in the client bundles at container start |
| `ASSET_DIR` | Docker runtime (`env.sh`) | `./.next/static` | Directory whose `*.js` files `env.sh` rewrites |
| `PORT` | Docker runtime | `3001` | Port of the standalone server |

For a local production run without Docker, build with a real URL:
`NEXT_PUBLIC_API_URL=http://localhost:8002 pnpm build && pnpm start`.

## Structure

- `app/` - routes only: root layout, providers, `login/`, `(app)/` pages behind the shell.
- `src/api/` - `client.ts` (cookies, single-flight refresh on 401, error normaliser), one module per resource, query keys.
- `src/realtime/` - one WebSocket per tab, user/job filter, reconnect with backoff, cache updates.
- `src/i18n/` - `de.ts` (source of truth), `en.ts`, `useI18n()`.
- `src/theme/` - Editorial tokens, fonts (self-hosted from `@fontsource`), light/dark/system.
- `src/ui/` - design-system primitives; `src/features/` - screens per area.

## Registry note

The repository has no `.npmrc`; installs use the public npm registry. Inside a dev
container that only reaches a private registry, so set `npm_config_registry` in the environment there.
````

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green (Prettier also checks `README.md`).

### Task 14: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/ui-context.md`, `context/architecture.md`

**Interfaces:**
- Consumes: the test counts printed by the last checkpoint (`pnpm test` summary line `Tests  N passed`) and by `pnpm test:e2e` (`25 passed`).
- Produces: up-to-date context for phase 2.

- [ ] **Step 1: Collect the numbers**

Run: `"$QA"/webrun.sh pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: two summary lines; use the `Tests` count (about 190) as `<unit count>` below.

- [ ] **Step 2: Update `context/progress-tracker.md`**

Replace the Phase line of section 1 with:

```markdown
**Phase:** Frontend redesign - phase 1 (new app scaffold in `web/`, port 3001) done; next is phase 2 (job page with all tabs).
```

Add this row at the end of the Status Board table (replace `<unit count>` with the number from Step 1):

```markdown
| **Frontend Redesign - Phase 1 (`web/` scaffold)** | ✅ Completed (`web/**`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`) | Next 16 + React 19 + Tailwind v4 app next to the old UI on port 3001 (compose service `ai-job-agent-web`): Editorial tokens and self-hosted fonts, UI primitives, typed DE/EN i18n, API client (single-flight refresh, 4-shape error normaliser, zod-validated responses), realtime (user/job filter, backoff, cache mapping), TanStack Query, shell, login, placeholder routes. <unit count> unit tests and 25 Playwright tests (mocked API) green. |
```

Add to section 4 (ADRs):

```markdown
* **Server state via TanStack Query (frontend redesign):** the only state library in `web/`. WebSocket events update or invalidate query caches in one place (`web/src/realtime/applyEvent.ts`); UI state lives in components or the URL. Why: hand-written caches were the main source of stale state in the old UI.
* **Frontend redesign - recorded deviations:** (1) no `/api/v1` prefix, UUID ids or unified error envelope; the client normalises the existing shapes (`{detail: string}`, `{detail: [...]}`, 429 `{error}`, scraper `200 + {status: "error"}`) into one `ApiError`. Why: large cross-cutting backend change not needed for the redesign. (2) No committed `.npmrc` with a private registry; Docker builds use the public registry, the dev container sets it via the environment. Why: private project, builds must work for anyone. (3) Node 22 instead of Node 20 (end-of-life; Vitest 5 and jsdom 30 need 22). (4) Prototype component CSS is ported as global `@layer components` classes; Tailwind utilities (mapped to the tokens via `@theme inline`) are used for layout. Why: 1:1 fidelity with the prototype and token re-mapping inside the ink sidebar and toasts. (5) Login field is "Benutzername", not the prototype's "E-Mail", because the API authenticates usernames.
```

Add to section 5 (Open Questions) only the items still unresolved when phase 1 ends:

```markdown
* **`template_ready` payload (B3):** the spec defines the event but not its fields; the client accepts `{type, user_id}` and invalidates all templates. Confirm with phase 0 before phase 6 (template upload live state).
* **A4 PDF preview (phase 2):** the API sends `X-Frame-Options: DENY` on `/jobs/{id}/documents/{doc}/view`, so the preview cannot embed it in an iframe. Options: fetch the PDF and show it from a `blob:` URL, or relax the header for `/view` to `frame-ancestors` of the UI origins.
```

- [ ] **Step 3: Update `context/ui-context.md`**

Insert directly below the first heading (`## 🎨 UI Context & Design System (Token-Optimized)`):

```markdown
> Sections 1-7 below describe the **legacy UI in `frontend/`** (until the cutover, phase 9). The new app in `web/` follows the design system in section 0.

### 0. Design system of the new app (`web/`, frontend redesign)

- **Source of truth:** `docs/prototype/clickdummy-editorial.html` ("Editorial"). Spec: `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md`.
- **Tokens:** `web/src/theme/tokens.css`, copied from the prototype (`:root` and `:root[data-mode="dark"]`). Paper and ink, one vermilion signal (`--accent`), crimson errors (`--danger`), stage colours `--st-*`, printed-proof colours, ink sidebar `--sb-*`, inverse toasts `--inv-*`. Radii 3/4 px (`--r-ctl`, `--r-panel`), rule width 4 px (3 px on mobile). Theme switch: `data-mode` on `<html>`, preference light/dark/system in localStorage `ajp-theme`, set before first paint by an inline script.
- **Tailwind v4:** `app/globals.css` maps tokens with `@theme inline` (`bg-surface`, `bg-sunken`, `text-ink`, `text-muted`, `text-faint`, `text-accent`, `text-accent-text`, `border-line`, `bg-st-applied`, `rounded-ctl`, `text-13`, ...). The default palette is removed (`--color-*: initial`), so `indigo-*` and friends do not exist. Use utilities for layout and spacing; use the primitives for controls.
- **Type:** Bricolage Grotesque (variable, `opsz` + `wght`) for titles and meaningful numerals (`.display`, `.mast-title`, `.score-n`), Hanken Grotesk 400/500/600 for UI (body 14.5 px, meta 12-13 px), Source Serif 4 only for A4 documents. Self-hosted via `next/font/local` from `@fontsource`.
- **Primitives (`web/src/ui/`):** `Button` (default/primary/ghost/danger, sm, icon-only, busy), `Tag`, `Chip`, `Seg`, `Field`/`TextField`, `Select`, `CountBadge`, `Notice` (info/warn/error), `ScoreMeter` (bands: Stark >= 80, Möglich >= 60, Schwach), `Masthead` (rule, number, display title, deck), `EmptyState`, `PageSkeleton`, `Tabs`/`TabPanel`, read-only `Stepper`, `Dialog`, `Drawer` (wide/narrow/sheet), `PanelHeader`, `Popover`, toasts via `useToast()`. Icons: `lucide-react` through `Icon` (stroke 1.75).
- **Shell:** ink sidebar 252 px with numbered nav (01 Eingang, 02 Bewerbungen, 03 Quellen, 04 Profil), Einstellungen, activity label with "Im Hintergrund" popover, user menu (account, language, theme, logout). Below 768 px: bottom bar (Eingang, Bewerbungen, Quellen, Mehr). `/` opens global search.
- **Hard rules (spec 5):** no gradients, glassmorphism, indigo/purple, emoji, sparkle or rainbow icons, pulsing dots (the crawl spinner is the one allowed motion indicator). Vermilion only for the next move, the active nav item, strong scores and primary buttons. Errors: crimson plus icon plus words. Text contrast >= 4.5:1, control borders >= 3:1. Hit targets >= 44 px on mobile, meta text >= 13 px where it carries meaning, visible focus rings, no nested interactive elements.
- **Toasts:** inverse ink pill, at most 2, 6 s (10 s with an action such as undo), paused on hover/focus.
- **States:** loading = skeleton (no whole-page spinners), empty = copy from the prototype, error = message plus retry (`describeError`, never raw server text).
- **i18n:** `useI18n()` from `@/i18n/useI18n`; keys are flat dotted strings in `web/src/i18n/de.ts` (source of truth) and `en.ts` (`Record<MessageKey, string>`, a missing key fails `tsc`). No hard-coded UI text, also not in metadata.
```

- [ ] **Step 4: Update `context/architecture.md`**

In section 1, below the `**Frontend:**` bullet, add:

```markdown
  - **Frontend redesign (in progress):** new app in `web/` (Next.js 16, React 19, Tailwind v4, TanStack Query), compose service `ai-job-agent-web` on port 3001, built as a standalone server whose API URL is injected at start by `web/env.sh`. Replaces `frontend/` at the cutover (phase 9).
```

In section 2, after the `frontend/app/` block, add:

```markdown
* `web/` — New Next.js application (frontend redesign):
  - `app/`: thin routes (`login/`, `(app)/` behind the shell).
  - `src/api/`: `client.ts` (cookie auth, single-flight refresh, error normaliser to `ApiError`), one module per resource, `queryKeys.ts`.
  - `src/realtime/`: one WebSocket per tab, events validated with zod and filtered by user and known job ids, mapped onto the query cache.
  - `src/i18n/`, `src/theme/`, `src/ui/`, `src/features/`: dictionaries, tokens and fonts, primitives, screens.
```

- [ ] **Step 5: Final checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build' && "$QA"/webrun.sh pnpm test:e2e`
Expected: all green, `25 passed`. Then copy the screenshots back as in Task 12 Step 5 for the phase review.

---

## Self-Review

**Spec coverage (phase 1 row: "tooling, tokens, fonts, ui primitives, i18n, api client, realtime, query setup, shell, login, compose service"):**

| Spec item | Task |
|---|---|
| 2.1 `web/`, Next 16, React 19, TS strict, Tailwind v4, pnpm 10 pinned, lockfile, port 3001 | 1, 13 |
| 2.3 structure (`app/` thin, `src/api`, `domain`, `realtime`, `i18n`, `ui`, `features`, `theme`, `tests/unit`, `tests/e2e`) | 1-12 |
| 2.3 TanStack Query as only state library | 5, 6 (activity as a query), 14 (ADR) |
| 2.3 lucide 1.75, fonts via `next/font/local` from `@fontsource`, API base from one config module, WS URL derived | 7, 2, 1 |
| 2.4 standards and recorded deviations | Global Constraints, 1 (lint rules), 14 |
| 4.1 sidebar, numbered nav with counts, Einstellungen, activity label with "Zuletzt fertig", user menu (account, language, theme, logout), bottom bar, `/` search, toasts | 10, 9 (toasts) |
| 4.2 `/login` as in the prototype; routes exist | 11, 10 |
| 4.3.5 a11y (focus rings, 44 px targets, focusable links) | 7, 8, 10 (CSS ported with mobile targets), 9 (focus trap) |
| 5 tokens, `@theme` mapping, hard rules | 2, 14 |
| 6 query keys, realtime filter + backoff + refetch on reconnect, apiFetch refresh/normaliser/redirect, states | 4, 5, 6, 10 (skeleton, error + retry) |
| 7 unit tests (apiFetch, realtime filter, i18n parity type + runtime), e2e with mocked API, screenshots 1440/390 both themes, no console errors, no horizontal scroll at 375 | 3, 4, 6, 12 |
| 8 "shell screenshot matches the prototype" | 12 Step 5 (reviewer comparison) |
| Compose service, `ALLOWED_ORIGINS`, Dockerfile + `env.sh`, README | 13 |

Deferred on purpose (noted in tasks and hand-off): `A4Preview` (phase 2), Bewerbungen due badge (phase 4), job-page nav highlighting (phase 2), global search results and mobile entry (phase 7), contrast assertions in e2e (phase 8), `?job=<id>` legacy redirect (phase 9, it only matters on the old port).

**Placeholder scan:** no TBD/TODO; every code step has full code. `<unit count>` in Task 14 is filled from a command given in Step 1.

**Type consistency:** `ApiClient.request(path, schema, init)` is used with that signature in Tasks 5 and 6; `queryKeys.*` names match between `queryKeys.ts`, `applyEvent.ts`, `knownJobs.ts`, `useActivity.ts` and the shell hooks; `ActivityState`/`ActivityTask` fields (`id, source, step, done, total`) match between reducer, panel and tests; `NavCounts { inbox, sourceErrors }` matches `NavBadge`, `BottomBar` and tests; `ToastInput { message, tone?, action? }` matches `RealtimeProvider`, `useLanguageSwitch` and tests.

**Review Focus:** each of the five items has a named test in its owning task (Tasks 10, 4 + 12, 4 + 6, 4, 2 + 12).
