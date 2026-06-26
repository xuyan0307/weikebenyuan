# 产康运营管理平台 - 快速启动指南

## 📦 项目结构

```
chankang-platform/
├── frontend/                  # 前端React应用
│   ├── src/                  # 源代码
│   │   ├── components/       # 组件
│   │   ├── pages/           # 页面
│   │   ├── hooks/           # 自定义hooks
│   │   └── data/            # 数据(包括mockData.ts)
│   ├── public/              # 静态资源
│   ├── Dockerfile          # 前端Docker配置
│   └── package.json        # 前端依赖
├── backend/                 # 后端API服务
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── controllers/    # 控制器
│   │   ├── models/         # 数据模型
│   │   ├── middleware/     # 中间件
│   │   ├── config/         # 配置
│   │   └── utils/          # 工具函数
│   ├── Dockerfile          # 后端Docker配置
│   ├── tsconfig.json       # TypeScript配置
│   └── package.json        # 后端依赖
├── nginx/                  # Nginx配置
│   └── nginx.conf          # Nginx主配置
├── .github/                # GitHub Actions
│   └── workflows/
│       └── deploy.yml      # CI/CD配置
├── docker-compose.yml      # 开发环境编排
├── docker-compose.prod.yml # 生产环境编排
├── init.sql               # 数据库初始化脚本
├── deploy.sh              # 部署脚本
├── backup.sh              # 备份脚本
├── .env.example           # 环境变量模板
└── DEPLOYMENT.md          # 详细部署文档
```

## 🚀 快速开始

### 1. 本地开发

```bash
# 安装前端依赖
npm install

# 启动前端开发服务器
npm run dev

# 访问 http://localhost:5173
```

### 2. Docker部署

```bash
# 复制环境变量配置
cp .env.example .env

# 编辑.env文件，配置必要的环境变量
nano .env

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

## 🔧 阿里云部署准备

### GitHub Secrets配置

在GitHub仓库设置中添加以下Secrets：

| Secret | 说明 | 必填 |
|--------|------|------|
| `ALIYUN_ACR_REGISTRY` | 阿里云镜像仓库地址 | ✅ |
| `ALIYUN_ACR_USERNAME` | ACR用户名 | ✅ |
| `ALIYUN_ACR_PASSWORD` | ACR密码 | ✅ |
| `ALIYUN_ECS_HOST` | ECS公网IP | ✅ |
| `ALIYUN_ECS_USER` | ECS登录用户名 | ✅ |
| `ALIYUN_ECS_SSH_KEY` | SSH私钥 | ✅ |

### ECS服务器初始化

```bash
# 1. SSH登录ECS
ssh root@<ECS_IP>

# 2. 安装Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 3. 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 4. 创建项目目录
mkdir -p /opt/chankang
cd /opt/chankang

# 5. 克隆代码(或上传文件)
git clone <your-repo-url> .

# 6. 配置环境变量
cp .env.example .env
nano .env

# 7. 启动服务
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 默认账号

- **用户名**: admin
- **密码**: 需要在首次部署后通过数据库设置

## 🔍 健康检查

```bash
# 前端健康检查
curl http://localhost/health

# 后端健康检查
curl http://localhost:3000/health

# 数据库连接检查
docker exec chankang-mysql mysqladmin ping
```

## 📝 常用命令

```bash
# 查看所有服务状态
docker-compose ps

# 查看特定服务日志
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f mysql

# 重启服务
docker-compose restart

# 停止所有服务
docker-compose down

# 停止并删除卷
docker-compose down -v

# 备份数据库
./backup.sh

# 进入MySQL容器
docker exec -it chankang-mysql mysql -uroot -p
```

## 🐛 故障排查

### 服务无法启动

```bash
# 查看服务日志
docker-compose logs <service_name>

# 检查端口占用
sudo netstat -tlnp | grep :80
```

### 数据库连接失败

```bash
# 检查MySQL容器状态
docker ps | grep mysql

# 查看MySQL日志
docker-compose logs mysql

# 进入MySQL容器测试连接
docker exec -it chankang-mysql mysql -uroot -p
```

### CI/CD部署失败

1. 检查GitHub Actions日志
2. 验证GitHub Secrets配置
3. 确认ECS SSH密钥正确
4. 检查ACR仓库权限

## 📚 更多信息

- 详细部署文档: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 项目README: [README.md](./README.md)

## 🆘 获取帮助

遇到问题？
1. 查看部署日志
2. 检查健康检查状态
3. 联系技术支持团队