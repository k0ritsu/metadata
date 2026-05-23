FROM node:24.16.0-alpine AS base

FROM base AS builder
WORKDIR /app

COPY package*json ./
RUN npm ci

COPY scripts scripts
COPY src src
COPY tsconfig*.json ./
RUN NODE_ENV=production npm run build && \
  npm prune --production

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json package.json

USER nodejs

CMD ["node", "--import", "./dist/modules/import.js", "./dist/main.js"]