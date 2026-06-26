# 阶段1: 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制package文件
COPY package.json bun.lock ./

# 安装依赖（使用bun或npm）
RUN apk add --no-cache python3 make g++ && \
    npm install

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# 阶段2: 生产运行阶段
FROM nginx:alpine AS production

# 安装必要的工具
RUN apk add --no-cache curl

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制nginx配置
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# 创建非root用户
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser && \
    chown -R appuser:appuser /usr/share/nginx/html && \
    chown -R appuser:appuser /var/cache/nginx && \
    chown -R appuser:appuser /var/log/nginx && \
    chown -R appuser:appuser /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appuser /var/run/nginx.pid

# 暴露端口
EXPOSE 80

# 切换到非root用户
USER appuser

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]