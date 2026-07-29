ARG NODE_IMAGE_VERSION="22-alpine"
ARG PNPM_VERSION="10.10.0"

# Install dependencies only when needed
FROM node:${NODE_IMAGE_VERSION} AS deps
ARG PNPM_VERSION
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@${PNPM_VERSION}
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:${NODE_IMAGE_VERSION} AS builder
ARG BUILD_VERSION="local"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"

RUN printf '%s\n' "$BUILD_VERSION" > .build-version \
    && npm run build-docker

# Production image, copy all the files and run next
FROM node:${NODE_IMAGE_VERSION} AS runner
ARG PNPM_VERSION
ARG BUILD_VERSION="local"
WORKDIR /app

ARG NODE_OPTIONS

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=$NODE_OPTIONS
ENV BUILD_VERSION=$BUILD_VERSION

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN set -x \
    && apk add --no-cache curl \
    && npm install -g pnpm@${PNPM_VERSION}

COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/generated ./generated

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV HOSTNAME=0.0.0.0

CMD ["pnpm", "start-docker"]
