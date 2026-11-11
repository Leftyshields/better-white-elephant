# Production image for the game API (Express + Socket.io) on Cloud Run.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim

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
