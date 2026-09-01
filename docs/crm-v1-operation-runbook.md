# HuakeyCRM v1.0 生产运维手册

> **文档类型**: Production Operation Runbook
> **版本**: v1.0
> **生效日期**: 2026-08-06
> **适用范围**: HuakeyCRM v1.0 生产环境
> **维护人**: Production Operations Engineer

---

## 1. 系统架构说明

### 1.1 访问链路

```
员工电脑（浏览器）
   ↓
crm.huakey.local（DNS 解析）
   ↓ 192.168.0.200:443
DSM Nginx 反向代理（443, HTTPS）
   ↓ 127.0.0.1:8443
Docker CRM Nginx（8443, HTTPS）
   ↓ 127.0.0.1:5000
Docker CRM App（Express 4.22.2）
   ↓
MySQL 8.0.46 + Redis
```

### 1.2 容器架构

| 容器 | 镜像 | 端口 | 用途 |
|------|------|------|------|
| huakey-app | node:18-alpine | 5000 | Express 后端 |
| huakey-nginx | nginx:alpine | 8443 | Docker Nginx |
| huakey-mysql | mysql:8.0 | 3306 | 数据库 |
| huakey-redis | redis:alpine | 6379 | 缓存 |

### 1.3 网络拓扑

```
员工电脑 (192.168.0.x)
   ↓ HTTP/HTTPS
NAS (192.168.0.200)
├── DSM Nginx (443) ← crm.huakey.local 证书
├── Docker Network (huakey-net)
│   ├── huakey-nginx (8443) ← server.crt
│   ├── huakey-app (5000)
│   ├── huakey-mysql (3306)
│   └── huakey-redis (6379)
└── DSM DNS Server (53) ← huakey.local 区域
```

### 1.4 关键路径

| 项目 | 路径 |
|------|------|
| CRM Stack | `/volume1/docker/crm-stack/` |
| docker-compose | `/volume1/docker/crm-stack/docker-compose.synology.yml` |
| .env | `/volume1/docker/crm-stack/.env` |
| .env.secrets | `/volume1/docker/crm-stack/.env.secrets` |
| SSL 证书 | `/volume1/docker/crm-stack/nginx/certs/` |
| 备份目录 | `/volume1/docker/crm-stack/database/backups/` |
| 上传文件 | Docker volume `crm-stack_app-uploads` |

---

## 2. 日常检查清单

### 2.1 每日检查（建议 09:00）

#### 2.1.1 Docker 容器状态

```bash
# SSH 登录 NAS
ssh nas-crm

# 检查容器状态（期望全部 Up + healthy）
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep huakey
```

**预期输出**:
```
huakey-app     Up X minutes (healthy)
huakey-nginx   Up X hours (healthy)
huakey-mysql   Up X hours (healthy)
huakey-redis   Up X hours (healthy)
```

**异常处理**:
- 容器未运行: `docker compose -f docker-compose.synology.yml up -d <container>`
- 容器不健康: 查看 `docker logs huakey-<container> --tail 50`

#### 2.1.2 NAS 磁盘空间

```bash
df -h /volume1
```

**预期**: 可用空间 > 10GB

**异常处理**: 清理旧备份 `find /volume1/docker/crm-stack/database/backups -mtime +30 -delete`

#### 2.1.3 数据库状态

```bash
curl -sk https://crm.huakey.local/api/v1/health | python3 -m json.tool
```

**预期**:
```json
{
  "code": 200,
  "data": {
    "status": "ok",
    "db": true,
    "redis": true
  }
}
```

**异常处理**:
- `db: false`: 检查 MySQL 容器 `docker logs huakey-mysql --tail 50`
- `redis: false`: 检查 Redis 容器 `docker logs huakey-redis --tail 50`

#### 2.1.4 备份日志

```bash
# MySQL 备份日志
tail -20 /volume1/docker/crm-stack/database/backups/backup.log

# Uploads 备份日志
tail -20 /volume1/docker/crm-stack/database/backups/uploads-backup.log

# Config 备份日志
tail -20 /volume1/docker/crm-stack/database/backups/config-backup.log
```

**预期**: 日志显示 "备份完成"，无 ERROR

#### 2.1.5 每日检查清单模板

| 检查项 | 预期 | 实际 | 状态 |
|--------|------|------|------|
| 4 容器全部 healthy | Up + healthy | ___ | ☐ |
| API Health 200 | status=ok | ___ | ☐ |
| MySQL 备份成功 | backup.log 无 ERROR | ___ | ☐ |
| Uploads 备份成功 | uploads-backup.log 无 ERROR | ___ | ☐ |
| Config 备份成功 | config-backup.log 无 ERROR | ___ | ☐ |
| 磁盘空间 > 10GB | df -h | ___ | ☐ |

---

## 3. 常见故障处理

### 3.1 故障：无法访问 CRM

#### 排查步骤

```
步骤 1: DNS 解析检查
   ↓
步骤 2: 网络连通检查
   ↓
步骤 3: NAS 状态检查
   ↓
步骤 4: Docker 状态检查
   ↓
步骤 5: Nginx 状态检查
```

#### 详细操作

**步骤 1: DNS 解析**

```bash
# 在员工电脑执行
nslookup crm.huakey.local
# 预期: 192.168.0.200

# 如失败: 检查 DNS 设置或 hosts 文件
# Windows: C:\Windows\System32\drivers\etc\hosts
# 添加: 192.168.0.200 crm.huakey.local
```

**步骤 2: 网络连通**

```bash
# 在员工电脑执行
ping 192.168.0.200
# 预期: 通

# 如失败: 检查网络连接、VPN、防火墙
```

**步骤 3: NAS 状态**

```bash
ssh nas-crm "echo OK"
# 如失败: 检查 NAS 是否开机、网络是否正常
```

**步骤 4: Docker 状态**

```bash
ssh nas-crm "docker ps | grep huakey"
# 预期: 4 个容器全部 Up

# 如容器未运行:
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml up -d"
```

**步骤 5: Nginx 状态**

```bash
# DSM Nginx
ssh nas-crm "sudo nginx -t"

# Docker Nginx
ssh nas-crm "docker logs huakey-nginx --tail 20"

# 如 Nginx 配置错误:
ssh nas-crm "sudo nginx -t && sudo nginx -s reload"
```

### 3.2 故障：员工无法登录

#### 排查步骤

```
步骤 1: 用户状态检查
   ↓
步骤 2: 密码检查
   ↓
步骤 3: must_change_password 检查
   ↓
步骤 4: 权限检查
```

#### 详细操作

**步骤 1: 用户状态**

```bash
ssh nas-crm
source /volume1/docker/crm-stack/.env.secrets
echo "SELECT id, username, status, must_change_password FROM sys_user WHERE username='<用户名>';" | docker exec -i huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm
```

**预期**: `status=1`（已激活）

**异常**:
- `status=0`: 账号已禁用，联系管理员启用
- 用户不存在: 账号未创建

**步骤 2: 密码检查**

如用户忘记密码，管理员重置（见 3.3）

**步骤 3: must_change_password 检查**

```bash
# 检查是否需要强制改密
# must_change_password=1: 首次登录需改密，跳转 /change-password
# 如改密失败: 检查 /auth/force-change-password 接口
```

**步骤 4: 权限检查**

```bash
# 检查用户角色
echo "SELECT u.username, r.code, r.name FROM sys_user u JOIN sys_role r ON u.role_id=r.id WHERE u.username='<用户名>';" | docker exec -i huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm
```

**步骤 5: 登录限流检查**

```bash
# 如频繁登录失败被限流
redis-cli -h 192.168.0.200 -p 6379 KEYS "ratelimit:*"
# 清空限流:
redis-cli -h 192.168.0.200 -p 6379 EVAL "return redis.call('del', unpack(redis.call('keys', 'ratelimit:*')))" 0
```

### 3.3 故障：忘记密码

#### 处理流程

```
员工报告忘记密码
   ↓
管理员验证员工身份
   ↓
管理员重置密码（POST /user/reset-password 或 SQL）
   ↓
系统设置 must_change_password=1
   ↓
通知员工新临时密码（独立渠道）
   ↓
员工首次登录
   ↓
强制修改密码
   ↓
完成
```

#### 方式一：API 重置（v1.0.1 后可用）

```bash
curl -sk -X POST https://crm.huakey.local/api/v1/user/reset-password \
  -H "Cookie: token=<admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"id": <user_id>, "new_password": "TempPass123"}'
```

#### 方式二：SQL 重置（当前可用）

```bash
ssh nas-crm
source /volume1/docker/crm-stack/.env.secrets

# 生成 bcrypt hash（在 Node 容器中执行）
HASH=$(docker exec huakey-app node -e "console.log(require('bcryptjs').hashSync('TempPass123', 10))")

# 更新密码 + 强制改密
echo "UPDATE sys_user SET password='$HASH', must_change_password=1 WHERE id=<user_id>;" | docker exec -i huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm
```

**注意**: PowerShell 会吞掉 `$` 字符，必须通过文件执行，不能内联。

---

## 4. 备份恢复流程

### 4.1 备份策略概览

引用 [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md)

| 备份类型 | 频率 | 脚本 | 保留 |
|----------|------|------|------|
| MySQL | 每日 02:00 | mysql-backup.sh | 7 天 + 4 周 |
| Uploads | 每日 02:30 | uploads-backup.sh | 7 天 |
| Config | 每日 02:45 | config-backup.sh | 7 天 |
| 验证 | 每日 03:00 | restore-test.sh | - |

### 4.2 MySQL 恢复

```bash
# 1. 找到备份文件
ls -la /volume1/docker/crm-stack/database/backups/huakey_crm_*.sql.gz

# 2. 解压并恢复
RESTORE_DATE="20260806"
BACKUP_FILE="/volume1/docker/crm-stack/database/backups/huakey_crm_${RESTORE_DATE}.sql.gz"

source /volume1/docker/crm-stack/.env.secrets
gunzip -c "$BACKUP_FILE" | docker exec -i huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm

# 3. 验证
echo "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL;" | docker exec -i huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm
```

### 4.3 Uploads 恢复

```bash
# 1. 找到备份文件
ls -la /volume1/docker/crm-stack/database/backups/uploads/

# 2. 恢复
RESTORE_DATE="20260806"
BACKUP_FILE="/volume1/docker/crm-stack/database/backups/uploads/uploads_${RESTORE_DATE}.tar.gz"

# 获取 volume 路径
VOLUME_PATH=$(docker volume inspect crm-stack_app-uploads --format '{{.Mountpoint}}')

# 恢复
tar -xzf "$BACKUP_FILE" -C "$VOLUME_PATH/"

# 3. 验证
find "$VOLUME_PATH" -type f | wc -l
```

### 4.4 Config 恢复

引用 [crm-v1-config-restore.md](./crm-v1-config-restore.md)

```bash
# 1. 找到备份文件
ls -la /volume1/docker/crm-stack/database/backups/config/

# 2. 解压
RESTORE_DATE="20260806"
BACKUP_FILE="/volume1/docker/crm-stack/database/backups/config/config_${RESTORE_DATE}.tar.gz"
RESTORE_DIR="/tmp/config-restore"
mkdir -p "$RESTORE_DIR"
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"

# 3. 恢复配置
STACK_DIR="/volume1/docker/crm-stack"
cp "$RESTORE_DIR/.env" "$STACK_DIR/"
cp "$RESTORE_DIR/.env.secrets" "$STACK_DIR/"
cp "$RESTORE_DIR/docker-compose.synology.yml" "$STACK_DIR/"
cp -r "$RESTORE_DIR/nginx/"* "$STACK_DIR/nginx/"
cp "$RESTORE_DIR/dsm-nginx/http.crm-huakey-local.conf" /usr/local/etc/nginx/conf.d/

# 4. 恢复权限
chmod 600 "$STACK_DIR/.env" "$STACK_DIR/.env.secrets"
chmod 644 "$STACK_DIR/nginx/certs/"*.crt
chmod 600 "$STACK_DIR/nginx/certs/"*.key

# 5. 重启服务
cd "$STACK_DIR"
docker compose -f docker-compose.synology.yml restart
sudo nginx -s reload

# 6. 清理
rm -rf "$RESTORE_DIR"
```

---

## 5. 发布流程

### 5.1 版本发布流程

```
开发环境开发
   ↓
测试环境验证（单元测试 + 集成测试）
   ↓
代码审查（Code Review）
   ↓
备份生产环境（MySQL + Config）
   ↓
构建新镜像（docker compose build --no-cache）
   ↓
重启容器（docker compose up -d app）
   ↓
健康检查验证
   ↓
功能验证
   ↓
监控观察（24 小时）
   ↓
发布完成
```

### 5.2 发布前检查清单

- [ ] 代码已通过 Code Review
- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] ESLint 无错误
- [ ] 备份 MySQL 数据库
- [ ] 备份配置文件
- [ ] 准备回滚方案

### 5.3 发布命令

```bash
# 1. 备份生产
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh"
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/config-backup.sh"

# 2. 拉取新代码
ssh nas-crm "cd /volume1/docker/crm-stack && git pull origin main"

# 3. 构建新镜像
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml build --no-cache app"

# 4. 重启
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml up -d app"

# 5. 健康检查
sleep 10
curl -sk https://crm.huakey.local/api/v1/health
```

### 5.4 回滚流程

```bash
# 1. 回滚代码
ssh nas-crm "cd /volume1/docker/crm-stack && git revert <commit-hash>"

# 2. 重新构建
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml build --no-cache app"

# 3. 重启
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml up -d app"

# 4. 验证
curl -sk https://crm.huakey.local/api/v1/health
```

### 5.5 回滚触发条件

| 条件 | 动作 |
|------|------|
| app 容器 1 分钟内未 healthy | 立即回滚 |
| 登录接口 5xx 错误率 > 5% | 立即回滚 |
| 现有用户无法登录 | 立即回滚 |

---

## 6. 监控告警

### 6.1 监控指标

| 指标 | 阈值 | 检查频率 |
|------|------|----------|
| 容器状态 | 必须 healthy | 每 1 分钟 |
| API Health | 必须 200 | 每 5 分钟 |
| 磁盘空间 | > 10GB 可用 | 每小时 |
| MySQL 连接 | db: true | 每 5 分钟 |
| Redis 连接 | redis: true | 每 5 分钟 |
| 备份成功 | 每日有新备份 | 每日 |

### 6.2 告警方式

| 级别 | 方式 | 响应时间 |
|------|------|----------|
| P0 紧急 | 电话 + 短信 | 15 分钟内 |
| P1 重要 | 短信 | 1 小时内 |
| P2 普通 | 邮件 | 4 小时内 |

---

## 7. 紧急联系方式

| 角色 | 职责 | 联系方式 |
|------|------|----------|
| 系统管理员 | 生产环境运维 | (待填写) |
| 数据库管理员 | 数据库相关 | (待填写) |
| 网络管理员 | 网络相关 | (待填写) |
| 开发负责人 | 代码相关 | (待填写) |

---

## 8. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-user-management-and-security-policy.md](./crm-v1-user-management-and-security-policy.md) | 用户管理与安全策略 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |
| [crm-v1-config-restore.md](./crm-v1-config-restore.md) | 配置恢复流程 |
| [crm-v1-final-production-acceptance-report.md](./crm-v1-final-production-acceptance-report.md) | 生产验收报告 |
| [crm-v1-internal-domain-deployment.md](./crm-v1-internal-domain-deployment.md) | 内网域名部署 |
