# Job Agent frontend (`frontend/`)

The web interface of the AI Job Agent
(design: `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md`). Next.js 16 App Router,
React 19, TypeScript strict, Tailwind CSS v4, TanStack Query.

## Quick start

Requirements: Node 22.12 or newer and pnpm 10 (`corepack enable` installs the pinned version).

```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:3000, talks to the API at NEXT_PUBLIC_API_URL
```

Start the backend first (`docker compose up ai-job-agent-server`, API on http://localhost:8002) and
log in with the admin account. The API must allow the origin `http://localhost:3000`
(`ALLOWED_ORIGINS`, the compose default).

With Docker: `docker compose up ai-job-agent-frontend` (production image) or
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up ai-job-agent-frontend` (hot reload).

## Scripts

| Script           | What it does                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev server on port 3000                                                                                                      |
| `pnpm build`     | Production build (`.next/standalone`) with the `APP_API_URL` placeholder                                                     |
| `pnpm start`     | `next start` on port 3000; serves the last build but warns because the build is standalone output (see below)                |
| `pnpm lint`      | ESLint (zero warnings) and Prettier check                                                                                    |
| `pnpm format`    | Prettier write                                                                                                               |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` (also checks DE/EN dictionary parity)                                                        |
| `pnpm test`      | Vitest unit tests (`tests/unit`)                                                                                             |
| `pnpm test:e2e`  | Builds against a mocked API and runs Playwright (`tests/e2e`); screenshots land in `tests/e2e/__screenshots__/` (gitignored) |

## Environment variables

| Variable              | Used by                   | Default                                                                       | Purpose                                                                                                                                |
| --------------------- | ------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | build and dev             | `.env.development`: `http://localhost:8002`; `.env.production`: `APP_API_URL` | REST base URL; the WebSocket URL is derived from it (`http` -> `ws`, `/ws`)                                                            |
| `APP_API_URL`         | Docker runtime (`env.sh`) | `http://localhost:8002` (compose)                                             | Replaces the `APP_API_URL` placeholder in the client bundles at container start; allowed characters: letters, digits, `:/._~%?#=&+-[]` |
| `ASSET_DIR`           | Docker runtime (`env.sh`) | `./.next/static`                                                              | Directory whose `*.js` files `env.sh` rewrites                                                                                         |
| `TEMPLATE_DIR`        | Docker runtime (`env.sh`) | `./static-template`                                                           | Pristine, read-only copy of the bundles; copied over `ASSET_DIR` on every start                                                        |
| `PORT`                | Docker runtime            | `3000`                                                                        | Port of the standalone server                                                                                                          |

`APP_API_URL` may only contain letters, digits and `:/._~%?#=&+-[]` (brackets for IPv6 hosts such
as `http://[::1]:8002`; no `@`, so no credentials); `env.sh` refuses to start otherwise, because the
value is written into a JavaScript string.

For a local production run without Docker, build with a real URL and start the standalone server
the same way the image does (it does not serve `.next/static` from its original place, so copy it
next to the server first):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8002 pnpm build
cp -R .next/static .next/standalone/.next/static
PORT=3000 node .next/standalone/server.js
```

## Structure

- `app/` - routes only: root layout, providers, `login/`, `(app)/` pages behind the shell.
- `src/api/` - `client.ts` (cookies, single-flight refresh on 401, error normaliser; JSON, form and multipart bodies, `requestBlob` for downloads), one module per resource, query keys.
- `src/realtime/` - one WebSocket per tab, user/job filter, reconnect with backoff, cache updates.
- `src/i18n/` - `de.ts` (source of truth), `en.ts`, `useI18n()`, time and date formatting (`formatTime.ts`, `formatDate.ts`; API timestamps without offset are UTC).
- `src/theme/` - Editorial tokens, fonts (self-hosted from `@fontsource`), light/dark/system.
- `src/ui/` - design-system primitives; `src/features/` - screens per area.

## Registry note

The repository has no `.npmrc`; installs use the public npm registry. Inside a dev
container that only reaches a private registry, so set `npm_config_registry` in the environment there.
