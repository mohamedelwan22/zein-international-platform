# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Zain International Trading — production image (T117)
#
#   deps    → frozen pnpm install
#   builder → prisma client + `next build` (standalone output)
#   runner  → minimal runtime, non-root, signal-aware, health-checked
#
# BUILD-TIME DATABASE: with Cache Components the production build executes
# cached content loaders, so `next build` needs a reachable, MIGRATED database
# (and, for a complete prerender, seeded rows). Supply it through the
# `build_env` BuildKit secret (see `docker/.env.build.example`); it is consumed
# only inside the builder stage and never reaches the final image or its
# metadata. CI does this against its seeded service container.
# ---------------------------------------------------------------------------

ARG NODE_IMAGE=node:24-alpine
ARG PNPM_VERSION=11.2.2

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
# pnpm-workspace.yaml carries `allowBuilds` (sharp, prisma, swc, esbuild, …).
# Omitting it makes pnpm 11 fail the install with ERR_PNPM_IGNORED_BUILDS.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Resilient install: registry fetches in CI/build can be slow, so allow a long
# per-request timeout and a modest concurrency instead of failing on the
# default socket timeout.
RUN pnpm install --frozen-lockfile --fetch-timeout 600000 --network-concurrency 4

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment is supplied as a BuildKit secret (never as ARG/ENV,
# so it is absent from image metadata and layer history). The file contains:
#   DATABASE_URL=<migrated database for the prerender>
#   AUTH_SECRET=<any >=32 char build placeholder>
#   S3_ACCESS_KEY / S3_SECRET_KEY / S3_ENDPOINT / S3_BUCKET / S3_REGION
#   NEXT_PUBLIC_SITE_URL
#   Optional: LOG_LEVEL, MAP_PROVIDER
ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=secret,id=build_env,required=true \
    set -a && . /run/secrets/build_env && set +a \
    && pnpm db:generate \
    && pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache openssl dumb-init \
    && addgroup -g 1001 -S zein \
    && adduser -u 1001 -S -G zein -H -s /sbin/nologin zein

# Standalone server + assets. `public/` holds only the approved logo/hero.
COPY --from=builder --chown=zein:zein /app/.next/standalone ./
COPY --from=builder --chown=zein:zein /app/.next/static ./.next/static
COPY --from=builder --chown=zein:zein /app/public ./public

# Migration + backup tooling is intentionally NOT in this image: the one-shot
# `migrate` service in docker/compose.prod.yml uses the builder stage, which
# carries the Prisma CLI. This keeps the runtime image small and read-only.

USER zein:zein
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
