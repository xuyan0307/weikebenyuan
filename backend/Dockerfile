FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json

USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
