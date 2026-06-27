# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./

RUN apk add --no-cache python3 make g++ && \
    npm ci --include=dev

COPY . .

RUN npm run build

# Runtime stage
FROM nginx:alpine AS production

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser && \
    chown -R appuser:appuser /usr/share/nginx/html && \
    chown -R appuser:appuser /var/cache/nginx && \
    chown -R appuser:appuser /var/log/nginx && \
    chown -R appuser:appuser /etc/nginx/conf.d && \
    chown appuser:appuser /etc/nginx/nginx.conf && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appuser /var/run/nginx.pid

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
