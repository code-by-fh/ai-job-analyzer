# Production image: Next.js standalone server, API URL injected at start by env.sh.
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# "corepack install" fetches the pnpm version pinned in package.json ("packageManager"), the
# single source of that version.
RUN corepack install && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .env.production sets NEXT_PUBLIC_API_URL=APP_API_URL, the placeholder env.sh replaces.
RUN corepack install && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# env.sh rewrites these files at every start, so the runtime user must own them.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Pristine copy with the placeholder: root-owned, so the runtime user cannot alter it; env.sh renders from it on every start.
COPY --from=builder /app/.next/static ./static-template
COPY env.sh /docker-entrypoint.sh
# Strip CR in case the file was checked out on Windows with CRLF line endings.
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod 755 /docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
