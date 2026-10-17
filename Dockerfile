# syntax=docker/dockerfile:1
# Music Room API (NestJS). Multi-stage, non-root, healthcheck. Spec §13.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
# prisma generate reads prisma.config.ts, which requires DATABASE_URL to be set.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN npx prisma generate && npx nest build && npm prune --omit=dev
# Edge TTS voices (Python edge-tts, pinned in tts-requirements.txt) into /app/.python.
RUN apk add --no-cache python3 py3-pip && npm run tts:install

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
WORKDIR /app
RUN apk add --no-cache python3 && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/.python ./.python
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health > /dev/null || exit 1
# Migrations run before the server listens (spec §13).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
