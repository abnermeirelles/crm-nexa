# =============================================================================
# CRM Nexa — Dockerfile da API NestJS
# =============================================================================
# Multi-stage:
#   1. base    — Node + pnpm + corepack
#   2. deps    — instala todas as workspace deps com cache de lockfile
#   3. build   — compila packages/shared, gera Prisma client, builda API
#   4. runtime — runtime minimo, non-root, com /health
# =============================================================================

FROM node:22-slim AS base
ENV CI=true
# debian-slim ja tem libssl3 + glibc — Prisma engine roda nativamente
# (schema.prisma tem binaryTargets debian-openssl-3.0.x).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.0.4 --activate
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: deps — cacheado por mudancas em package.json/pnpm-lock
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 3: build
# -----------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/api ./apps/api

RUN pnpm -F @crm-nexa/shared build \
  && pnpm -F @crm-nexa/database db:generate \
  && pnpm -F @crm-nexa/api build

# Remove dev deps mas preserva o Prisma client gerado
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 4: runtime — apenas o necessario para `node dist/main.js`
# -----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    API_PORT=3001

# Copia node_modules (root + workspaces) com symlinks preservados pelo pnpm,
# alem de artefatos buildados.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/database/src ./packages/database/src
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

USER node
WORKDIR /app/apps/api
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
