FROM oven/bun:1.4.2 AS bunbin
FROM node:22-bookworm AS build
COPY --from=bunbin /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY vendor ./vendor
COPY prisma ./prisma
RUN bun install
COPY --chown=node:node . .
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx && bun run build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
