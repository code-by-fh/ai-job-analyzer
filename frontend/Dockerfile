FROM node:20.18-alpine AS base

# 1. Abhängigkeiten installieren
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Builder: App bauen
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 3. Runner: Produktions-Image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# System-User anlegen & Hilfstools installieren
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache dos2unix sed

# Dateien aus dem Builder kopieren
COPY --from=builder /app/public ./public

# WICHTIG: Wir kopieren erst alles und setzen dann die Rechte
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Skript für Environment-Variablen vorbereiten
COPY env.sh /docker-entrypoint.sh
RUN dos2unix /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# FEHLERBEHEBUNG: Sicherstellen, dass der User im .next Ordner schreiben darf (für sed)
RUN chown -R nextjs:nodejs /app/.next && chmod -R 755 /app/.next

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]