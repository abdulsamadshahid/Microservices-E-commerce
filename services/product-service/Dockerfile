# Multi-stage Dockerfile for Product Service
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install all dependencies (including TypeScript compiler)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and build
COPY src/ ./src/
RUN npm run build

# Prune development dependencies
RUN npm prune --omit=dev

# Production Runtime
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=4001

# Run as non-root user
USER node

# Copy production dependencies and compiled JavaScript
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health/live || exit 1

CMD ["node", "dist/index.js"]
