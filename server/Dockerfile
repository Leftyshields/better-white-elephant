# Production image for the game API (Express + Socket.io) on Cloud Run.
# Digests resolved from registry-1.docker.io on 2026-11-11.
FROM node:20-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c

WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY . .

USER nodejs

# Cloud Run sets PORT (default 8080).
EXPOSE 8080

CMD ["node", "server.js"]
