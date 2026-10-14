# Multi-stage Dockerfile for Product Service
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --production

COPY . .

# Production Runtime
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=4001

# Run as non-root user
USER node

COPY --chown=node:node --from=builder /usr/src/app ./

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health/live || exit 1

CMD ["node", "src/index.js"]
