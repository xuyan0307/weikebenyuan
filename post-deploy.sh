# 部署完成后执行的命令

# 1. 创建备份目录
mkdir -p backups
mkdir -p nginx/ssl

# 2. 设置脚本执行权限
chmod +x deploy.sh

# 3. 初始化数据库(首次部署)
# docker exec -i chankang-mysql mysql -uroot -p$DB_ROOT_PASSWORD chankang_platform < init.sql

# 4. 创建数据库备份定时任务(cron)
# 0 2 * * * cd /opt/chankang && ./backup.sh

# 5. 检查服务状态
# docker-compose ps