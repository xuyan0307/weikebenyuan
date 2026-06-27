#!/bin/bash

# 数据库备份脚本
# 使用方法: ./backup.sh

set -e

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# 配置
BACKUP_DIR="./backups"
DB_CONTAINER="chankang-mysql"
DB_NAME="chankang_platform"
DB_USER="${DB_USER:-chankang}"
RETENTION_DAYS=30

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/chankang_backup_$TIMESTAMP.sql"
BACKUP_FILE_COMPRESSED="$BACKUP_FILE.gz"

echo "开始备份数据库..."

# 备份数据库
docker exec "$DB_CONTAINER" mysqldump -u"$DB_USER" -p"${DB_PASSWORD}" \
  --single-transaction --routines --triggers "$DB_NAME" > "$BACKUP_FILE"

# 压缩备份文件
gzip "$BACKUP_FILE"

echo "备份完成: $BACKUP_FILE_COMPRESSED"

# 删除旧备份
echo "清理超过 $RETENTION_DAYS 天的旧备份..."
find "$BACKUP_DIR" -name "chankang_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# 显示备份文件列表
echo "当前备份文件:"
ls -lh "$BACKUP_DIR" | grep chankang_backup

echo "备份完成！"
