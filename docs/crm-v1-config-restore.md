# HuakeyCRM v1.0 配置文件恢复流程

> **文档状态**: COMPLETED
> **编制日期**: 2026-08-06
> **适用场景**: 灾难恢复、配置回滚、NAS 迁移
> **备份来源**: `/volume1/docker/crm-stack/database/backups/config/config_YYYYMMDD.tar.gz`

---

## 1. 概述

本文档定义 HuakeyCRM 生产配置文件的完整恢复流程，包括证书恢复、环境变量恢复、Docker Compose 恢复和权限恢复。

### 1.1 恢复前置条件

- NAS 系统可正常启动
- Docker Container Manager 已安装
- 拥有 root 权限（或 sudo）
- 备份文件存在且可读

---

## 2. 恢复步骤

### 2.1 步骤一：确认备份文件

```bash
# 列出可用备份
ls -la /volume1/docker/crm-stack/database/backups/config/

# 验证备份文件完整性
tar -tzf /volume1/docker/crm-stack/database/backups/config/config_YYYYMMDD.tar.gz | head -20
```

### 2.2 步骤二：创建临时恢复目录

```bash
RESTORE_DATE="YYYYMMDD"  # 替换为实际备份日期
BACKUP_FILE="/volume1/docker/crm-stack/database/backups/config/config_${RESTORE_DATE}.tar.gz"
RESTORE_DIR="/tmp/config-restore-${RESTORE_DATE}"

mkdir -p "$RESTORE_DIR"
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"
```

### 2.3 步骤三：恢复环境变量

```bash
STACK_DIR="/volume1/docker/crm-stack"

# 恢复 .env（公开配置）
cp "$RESTORE_DIR/.env" "$STACK_DIR/.env"
chmod 600 "$STACK_DIR/.env"

# 恢复 .env.secrets（敏感配置）
cp "$RESTORE_DIR/.env.secrets" "$STACK_DIR/.env.secrets"
chmod 600 "$STACK_DIR/.env.secrets"
```

### 2.4 步骤四：恢复 Docker Compose 配置

```bash
# 恢复 docker-compose.synology.yml
cp "$RESTORE_DIR/docker-compose.synology.yml" "$STACK_DIR/docker-compose.synology.yml"
```

### 2.5 步骤五：恢复 SSL 证书

```bash
# 创建证书目录（如不存在）
mkdir -p "$STACK_DIR/nginx/certs"

# 恢复域名证书（DSM Nginx 使用）
cp "$RESTORE_DIR/nginx/certs/crm.huakey.local.crt" "$STACK_DIR/nginx/certs/"
cp "$RESTORE_DIR/nginx/certs/crm.huakey.local.key" "$STACK_DIR/nginx/certs/"

# 恢复 IP 证书（Docker Nginx 使用）
cp "$RESTORE_DIR/nginx/certs/server.crt" "$STACK_DIR/nginx/certs/"
cp "$RESTORE_DIR/nginx/certs/server.key" "$STACK_DIR/nginx/certs/"

# 设置证书权限
chmod 644 "$STACK_DIR/nginx/certs/"*.crt
chmod 600 "$STACK_DIR/nginx/certs/"*.key
```

### 2.6 步骤六：恢复 Nginx 配置

```bash
# 恢复 Docker Nginx 配置
cp "$RESTORE_DIR/nginx/nginx.conf" "$STACK_DIR/nginx/nginx.conf"

# 恢复 DSM Nginx 反代配置
cp "$RESTORE_DIR/dsm-nginx/http.crm-huakey-local.conf" /usr/local/etc/nginx/conf.d/

# 重新加载 DSM Nginx
sudo nginx -t && sudo systemctl reload nginx 2>/dev/null || sudo synoservicectl --reload nginx
```

### 2.7 步骤七：恢复备份脚本

```bash
mkdir -p "$STACK_DIR/deploy/backup"
cp "$RESTORE_DIR/deploy/backup/"*.sh "$STACK_DIR/deploy/backup/"
chmod +x "$STACK_DIR/deploy/backup/"*.sh
```

### 2.8 步骤八：权限恢复

```bash
# 敏感文件权限
chmod 600 "$STACK_DIR/.env" "$STACK_DIR/.env.secrets"

# 证书权限
chmod 644 "$STACK_DIR/nginx/certs/"*.crt
chmod 600 "$STACK_DIR/nginx/certs/"*.key

# 脚本权限
chmod +x "$STACK_DIR/deploy/backup/"*.sh

# 验证权限
ls -la "$STACK_DIR/.env" "$STACK_DIR/.env.secrets"
ls -la "$STACK_DIR/nginx/certs/"
```

### 2.9 步骤九：重启服务

```bash
cd "$STACK_DIR"

# 重启 Docker 服务（使用恢复的配置）
docker compose -f docker-compose.synology.yml down
docker compose -f docker-compose.synology.yml up -d

# 验证容器状态
docker ps --filter name=huakey-
```

### 2.10 步骤十：验证恢复

```bash
# 验证 API 健康
curl -sk https://crm.huakey.local/api/v1/health

# 验证 HTTPS 证书
openssl s_client -connect 192.168.0.200:443 -servername crm.huakey.local </dev/null 2>/dev/null | openssl x509 -noout -subject -dates

# 清理临时目录
rm -rf /tmp/config-restore-*
```

---

## 3. 权限恢复清单

| 文件 | 期望权限 | 说明 |
|------|----------|------|
| `.env` | 600 | 含环境配置 |
| `.env.secrets` | 600 | 含密码 |
| `nginx/certs/*.crt` | 644 | 证书公开 |
| `nginx/certs/*.key` | 600 | 私钥保密 |
| `deploy/backup/*.sh` | 755 | 脚本可执行 |
| 备份目录 `config/` | 700 | 仅 root 可访问 |
| 备份文件 `config_*.tar.gz` | 600 | 仅 root 可读写 |

---

## 4. 恢复验证清单

- [ ] `.env` 已恢复，权限 600
- [ ] `.env.secrets` 已恢复，权限 600
- [ ] `docker-compose.synology.yml` 已恢复
- [ ] SSL 证书已恢复（4 个文件）
- [ ] Nginx 配置已恢复（Docker + DSM）
- [ ] 备份脚本已恢复，权限 755
- [ ] Docker 容器已重启
- [ ] API Health 返回 200
- [ ] HTTPS 证书有效
- [ ] 临时恢复目录已清理

---

## 5. 一键恢复脚本

```bash
#!/bin/bash
# 快速恢复脚本（需 root 权限）
set -eu

RESTORE_DATE="${1:-}"
if [ -z "$RESTORE_DATE" ]; then
  echo "Usage: $0 YYYYMMDD"
  exit 1
fi

STACK_DIR="/volume1/docker/crm-stack"
BACKUP_FILE="${STACK_DIR}/database/backups/config/config_${RESTORE_DATE}.tar.gz"
RESTORE_DIR="/tmp/config-restore-${RESTORE_DATE}"

echo "=== 恢复配置备份: ${RESTORE_DATE} ==="

# 1. 解压备份
mkdir -p "$RESTORE_DIR"
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"

# 2. 恢复文件
cp "$RESTORE_DIR/.env" "$STACK_DIR/"
cp "$RESTORE_DIR/.env.secrets" "$STACK_DIR/"
cp "$RESTORE_DIR/docker-compose.synology.yml" "$STACK_DIR/"
cp -r "$RESTORE_DIR/nginx/"* "$STACK_DIR/nginx/"
cp "$RESTORE_DIR/dsm-nginx/http.crm-huakey-local.conf" /usr/local/etc/nginx/conf.d/
mkdir -p "$STACK_DIR/deploy/backup"
cp "$RESTORE_DIR/deploy/backup/"*.sh "$STACK_DIR/deploy/backup/"

# 3. 恢复权限
chmod 600 "$STACK_DIR/.env" "$STACK_DIR/.env.secrets"
chmod 644 "$STACK_DIR/nginx/certs/"*.crt
chmod 600 "$STACK_DIR/nginx/certs/"*.key
chmod +x "$STACK_DIR/deploy/backup/"*.sh

# 4. 重启服务
cd "$STACK_DIR"
docker compose -f docker-compose.synology.yml restart

# 5. 清理
rm -rf "$RESTORE_DIR"

echo "=== 恢复完成，请验证服务状态 ==="
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-config-backup-audit.md](./crm-v1-config-backup-audit.md) | 配置备份审计 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |
| [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) | 群晖定时任务 |
