# syntax=docker/dockerfile:1

FROM node:24.21.0-bookworm-slim AS deps
WORKDIR /app

ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24.21.0-bookworm-slim AS builder
WORKDIR /app

ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM node:24.21.0-bookworm-slim AS prod-deps
WORKDIR /app

ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm prune --prod

FROM node:24.21.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HUSKY=0
# Dates of the meal planner are computed in the household's time zone.
ENV TZ=Europe/Paris
# Session cookies + calendar history cache live here (mount a volume).
ENV COOKIDOO_COOKIE_FILE=/app/data/.cookidoo-session.json
ENV CALENDAR_CACHE_FILE=/app/data/calendar-history.json

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

# npm is bundled in the base image but unused at runtime (only `node dist/main`
# runs here); dropping it removes its bundled vulnerable `tar` dependency.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000

CMD ["node", "dist/main"]
