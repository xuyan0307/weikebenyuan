#!/bin/bash

# 产康运营管理平台 - 部署脚本
# 用法: ./deploy.sh prod

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=${1:-prod}
COMPOSE_FILE="docker-compose.prod.yml"

echo -e "${GREEN}=== 产康运营管理平台部署 ===${NC}"
echo -e "${YELLOW}环境: $ENV${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}错误: Docker Compose v2 未安装${NC}"
    exit 1
fi

if [ ! -f .env ]; then
    if [ -f .env.production ]; then
        echo -e "${YELLOW}未发现 .env，从 .env.production 复制...${NC}"
        cp .env.production .env
        echo -e "${RED}请编辑 .env 填入真实密码与 JWT_SECRET 后重新运行 ./deploy.sh prod${NC}"
        exit 1
    else
        echo -e "${RED}错误: .env 与 .env.production 均不存在${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}停止现有服务...${NC}"
docker compose -f $COMPOSE_FILE down || true

echo -e "${YELLOW}构建并启动服务（首次会拉取/构建镜像，请耐心等待）...${NC}"
docker compose -f $COMPOSE_FILE up -d --build

echo -e "${YELLOW}等待服务就绪...${NC}"
sleep 15

echo -e "${GREEN}=== 服务状态 ===${NC}"
docker compose -f $COMPOSE_FILE ps

echo -e "${YELLOW}执行健康检查...${NC}"
FE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")
BE=$(docker exec chankang-backend wget -q -O- http://localhost:3000/health 2>/dev/null && echo "ok" || echo "fail")

if [ "$FE" = "200" ]; then
    echo -e "${GREEN}✓ 前端 (nginx) 正常${NC}"
else
    echo -e "${RED}✗ 前端异常 (HTTP $FE)${NC}"
fi

if [ "$BE" = "ok" ] || echo "$BE" | grep -q healthy; then
    echo -e "${GREEN}✓ 后端 API 正常${NC}"
else
    echo -e "${YELLOW}⚠ 后端尚未就绪，可稍后用 docker logs chankang-backend 查看${NC}"
fi

PUBLIC_IP=$(curl -s --max-time 3 http://100.100.100.200/latest/meta-data/public-ipv4 || curl -s --max-time 3 ifconfig.me || echo "<ECS公网IP>")

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo -e "${YELLOW}访问地址: http://${PUBLIC_IP}${NC}"
echo -e "${YELLOW}默认账号: admin / admin123（请登录后立即修改）${NC}"
echo -e "${YELLOW}查看日志: docker compose -f $COMPOSE_FILE logs -f${NC}"
