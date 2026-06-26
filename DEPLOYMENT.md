# 产康运营管理平台 - 部署指南

## 目录
- [环境要求](#环境要求)
- [本地开发](#本地开发)
- [Docker部署](#docker部署)
- [阿里云部署](#阿里云部署)
- [CI/CD配置](#cicd配置)
- [监控与维护](#监控与维护)

## 环境要求

### 本地开发
- Node.js >= 20.x
- npm 或 bun
- Git

### Docker部署
- Docker >= 24.0
- Docker Compose >= 2.20

### 阿里云部署
- 阿里云ECS实例 (建议2核4G以上)
- 已安装Docker和Docker Compose
- 安全组入方向开放 TCP 80
- （可选）域名和SSL证书；本次部署采用 IP 访问，无需域名

## 快速部署（IP 访问，无域名）

适用于本次"已有阿里云 ECS、暂无域名、HTTP 访问"场景。

### 1. ECS 前置条件
- 已安装 Docker Engine 与 Docker Compose v2（`docker compose version` 可输出版本号）
- 安全组入方向放行 TCP 80；系统防火墙放行 80（`firewall-cmd --add-port=80/tcp --permanent && firewall-cmd --reload` 或 `ufw allow 80`）
- MySQL(3306)/Redis(6379) 仅绑 127.0.0.1，不对外
- 建议规格 ≥ 2C4G；2G 内存实例请先配置 2G swap

### 2. 上传代码到 ECS
```bash
# 方式一：服务器上 git clone（推荐）
ssh root@<ECS_IP>
cd /opt
git clone <repo_url> chankang && cd chankang

# 方式二：本地 scp 整个目录
scp -r ./daima root@<ECS_IP>:/opt/chankang
```

### 3. 配置环境变量
```bash
cd /opt/chankang
cp .env.production .env
vi .env   # 填入 DB_ROOT_PASSWORD / DB_PASSWORD / REDIS_PASSWORD / JWT_SECRET 真实值
```
- `JWT_SECRET` 用 `openssl rand -hex 32` 生成
- 所有密码建议 ≥ 16 位随机字符串

### 4. 一键部署
```bash
chmod +x deploy.sh
./deploy.sh prod
```
脚本会自动构建并启动 mysql / redis / backend / frontend 四个容器，首次启动后端会自动种入管理员账号 `admin / admin123`。

### 5. 访问验证
- 浏览器打开 `http://<ECS公网IP>/` → 登录页
- 用 `admin / admin123` 登录 → 进入主应用
- `curl http://<ECS_IP>/api/health` 应返回 `{"status":"healthy",...}`

### 6. 登录后立即改密
登录后到「系统设置」修改 admin 密码（或调用 `PUT /api/auth/password`）。



## 本地开发

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑.env文件配置开发环境变量
```

### 3. 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:5173

## Docker部署

### 1. 快速启动
```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 环境变量配置
复制环境变量模板并编辑：
```bash
cp .env.example .env
```

主要配置项：
- `DB_ROOT_PASSWORD`: 数据库root密码
- `DB_PASSWORD`: 应用数据库密码
- `JWT_SECRET`: JWT密钥(生产环境必须修改)

### 3. 数据库初始化
首次启动会自动执行 `init.sql` 初始化数据库。

手动导入：
```bash
docker exec -i chankang-mysql mysql -uroot -p$DB_ROOT_PASSWORD chankang_platform < init.sql
```

## 阿里云部署

### 1. ECS服务器准备

#### 1.1 安装Docker
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 1.2 配置防火墙
开放必要端口：
- 80 (HTTP)
- 443 (HTTPS)
- 22 (SSH)
- 3306 (MySQL，建议仅内网)

#### 1.3 配置swap(小内存实例)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. 阿里云容器镜像服务(ACR)配置

#### 2.1 开通服务
访问 [容器镜像服务控制台](https://cr.console.aliyun.com/) 开通服务。

#### 2.2 创建命名空间和仓库
- 命名空间: chankang
- 仓库类型: 私有
- 创建镜像仓库: chankang-frontend

#### 2.3 登录ACR
```bash
docker login --username=<ACR用户名> registry.cn-hangzhou.aliyuncs.com
```

### 3. 配置CI/CD

#### 3.1 GitHub Secrets配置
在GitHub仓库设置中添加以下Secrets：

| Secret名称 | 说明 | 示例 |
|-----------|------|------|
| `ALIYUN_ACR_REGISTRY` | ACR仓库地址 | `registry.cn-hangzhou.aliyuncs.com` |
| `ALIYUN_ACR_USERNAME` | ACR用户名 | `xxx@aliyun.com` |
| `ALIYUN_ACR_PASSWORD` | ACR密码 | `xxxxxx` |
| `ALIYUN_ECS_HOST` | ECS公网IP | `47.1xx.xx.xx` |
| `ALIYUN_ECS_USER` | ECS登录用户 | `root` |
| `ALIYUN_ECS_SSH_KEY` | SSH私钥 | (完整的私钥内容) |

#### 3.2 配置SSH密钥
在ECS上生成SSH密钥对(如不存在)：
```bash
ssh-keygen -t rsa -b 4096 -C "github-actions"
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
```

将私钥(`id_rsa`)内容添加到GitHub Secret `ALIYUN_ECS_SSH_KEY`。

#### 3.3 触发部署
```bash
# 推送到main/master分支触发自动部署
git push origin main
```

### 4. 手动部署到ECS

#### 4.1 上传部署文件
```bash
scp docker-compose.yml root@<ECS_IP>:/opt/chankang/
scp Dockerfile root@<ECS_IP>:/opt/chankang/
scp -r nginx root@<ECS_IP>:/opt/chankang/
```

#### 4.2 执行部署脚本
```bash
ssh root@<ECS_IP>
cd /opt/chankang
chmod +x deploy.sh
./deploy.sh prod
```

## CI/CD配置

### 工作流程
1. 代码推送到main/master分支
2. GitHub Actions自动触发
3. 前端构建和类型检查
4. 构建Docker镜像并推送到ACR
5. SSH连接到ECS
6. 拉取新镜像并重启服务
7. 健康检查确认部署成功

### 查看部署状态
在GitHub仓库的Actions标签页查看部署状态和日志。

## 监控与维护

### 查看服务状态
```bash
docker-compose ps
```

### 查看日志
```bash
# 所有服务
docker-compose logs -f

# 特定服务
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f mysql
```

### 数据备份
```bash
# 备份数据库
docker exec chankang-mysql mysqldump -uroot -p$DB_ROOT_PASSWORD chankang_platform > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i chankang-mysql mysql -uroot -p$DB_ROOT_PASSWORD chankang_platform < backup_20250625.sql
```

### 更新服务
```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
docker-compose up -d --build
```

### 常见问题

#### 1. 端口被占用
```bash
# 查看端口占用
sudo netstat -tlnp | grep :80
# 停止占用进程
sudo kill <PID>
```

#### 2. 数据库连接失败
检查MySQL容器状态和网络配置：
```bash
docker-compose logs mysql
docker network inspect chankang_chankang-network
```

#### 3. 镜像拉取失败
检查ACR登录状态：
```bash
docker login registry.cn-hangzhou.aliyuncs.com
```

## 安全建议

1. **定期更新**：保持系统和依赖包最新
2. **强密码**：使用复杂密码并定期更换
3. **HTTPS**：配置SSL证书启用HTTPS
4. **防火墙**：只开放必要端口
5. **备份**：定期备份数据库
6. **监控**：配置告警监控异常情况
7. **日志**：收集和分析应用日志

## 支持

如遇到问题，请：
1. 检查日志文件
2. 查看GitHub Actions运行记录
3. 联系技术支持团队