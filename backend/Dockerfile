FROM node:20-alpine AS builder

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com/

COPY backend/package*.json ./
RUN npm ci --include=dev

COPY backend/ .
COPY init.sql ./init.sql
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache su-exec && \
    addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/init.sql ./init.sql
COPY --chown=root:root backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
