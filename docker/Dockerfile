# syntax=docker/dockerfile:1.7

# The runtime is chosen HERE and nowhere else.
#
# ADR 0002 commits us to Bun while keeping Node one line away. `--build-arg RUNTIME=node`
# switches the whole image, and CI runs the test suite under both on every PR — so the
# fallback is continuously verified rather than discovered under pressure.
ARG RUNTIME=bun
ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=22

# ---------- dependencies ----------
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN bun run build

# ---------- production dependencies only ----------
FROM oven/bun:${BUN_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- runtime: bun ----------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime-bun
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
# Never run as root. A container escape should not start from uid 0.
USER bun
EXPOSE 3000
ENTRYPOINT ["bun", "run"]
CMD ["dist/main.js"]

# ---------- runtime: node (the verified fallback) ----------
FROM node:${NODE_VERSION}-alpine AS runtime-node
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["dist/main.js"]

FROM runtime-${RUNTIME} AS final
# Workers are this same image with a different command:
#   docker run <image> dist/worker.js
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
