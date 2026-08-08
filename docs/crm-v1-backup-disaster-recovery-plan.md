# HuakeyCRM v1 备份与灾备方案（Backup & Disaster Recovery Plan）

> **文档类型**: Backup & Disaster Recovery Plan
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS 生产部署（/volume1/docker/crm-stack）
> **状态**: READY — 备份脚本已部署，恢复演练已验证通过

---

## 1. 生产架构概览

### 1.1 当前部署拓扑

```
用户浏览器
   ↓ HTTPS 8443
huakey-nginx（nginx:alpine，SSL 反代）
   ↓ HTTP 5000（内部网络）
huakey-app（前端 + 后端一体化）
   ↓
huakey-mysql（MySQL 8.0）+ huakey-redis（Redis 7）
```

### 1.2 容器与数据卷

| 容器 | 镜像 | 数据卷 | 用途 |
|------|------|--------|------|
| huakey-mysql | mysql:8.0 | `mysql-data`（named volume） | 业务数据库 |
| huakey-redis | redis:7-alpine | 无持久化（allkeys-lru） | 缓存/会话 |
| huakey-app | 自构建 | `app-uploads`、`app-logs` | 应用 + 上传文件 |
| huakey-nginx | nginx:alpine | certs（bind mount） | HTTPS 反代 |

### 1.3 关键路径

| 路径 | 说明 |
|------|------|
| `/volume1/docker/crm-stack/` | 部署根目录 |
| `/volume1/docker/crm-stack/.env.secrets` | 敏感凭据（密码、JWT、密钥） |
| `/volume1/docker/crm-stack/.env` | 非敏感配置 |
| `/volume1/docker/crm-stack/database/backups/` | 备份输出目录 |
| `/volume1/docker/crm-stack/deploy/backup/mysql-backup.sh` | 备份脚本 |
| `/volume1/docker/crm-stack/deploy/backup/restore-test.sh` | 恢复演练脚本 |

---

## 2. 备份策略

### 2.1 备份目标

| 数据类型 | 备份方式 | 频率 | 保留期 | RPO |
|----------|----------|------|--------|-----|
| MySQL 数据库（`huakey_crm`） | mysqldump（逻辑备份） | 每日 02:00 | 7 天日备 + 4 周周备 | 24h |
| 上传文件（`app-uploads` 卷） | 文件复制（规划中） | 每日 02:30 | 7 天 | 24h |
| 配置文件（compose/.env） | 文件复制（规划中） | 每周日 03:00 | 4 周 | 7d |

> **当前阶段**：MySQL 数据库备份已实现并验证。上传文件与配置文件备份为后续扩展项。

### 2.2 备份工具与方式

- **工具**：`mysqldump`（MySQL 容器内置，无需额外安装）
- **执行方式**：NAS 宿主机 DSM 任务计划 → `docker exec huakey-mysql mysqldump`
- **不依赖** backup 容器（原 docker-compose 中的 backup 服务已废弃，产出空文件）

### 2.3 mysqldump 关键参数

| 参数 | 作用 |
|------|------|
| `--single-transaction` | InnoDB 一致性快照，不锁表 |
| `--routines` | 备份存储过程/函数 |
| `--triggers` | 备份触发器 |
| `--events` | 备份事件调度 |
| `--quick` | 大表流式输出，不占用内存 |
| `--no-tablespaces` | 避免 PROCESS 权限问题 |

### 2.4 备份文件命名规范

```
huakey_crm_YYYYMMDD.sql.gz         # 每日备份
huakey_crm_weekly_YYYY-Www.sql.gz  # 每周备份（周日生成）
```

示例：`huakey_crm_20260806.sql.gz`

### 2.5 保留策略

| 类型 | 保留期 | 清理规则 |
|------|--------|----------|
| 每日备份 | 7 天 | `find -mtime +7 -delete` |
| 每周备份 | 4 周（28 天） | `find -mtime +28 -delete` |
| 空文件/失败文件 | 立即清理 | `find -size -100c -delete`（< 100 字节视为失败） |

### 2.6 存储位置

```
/volume1/docker/crm-stack/database/backups/
  ├── huakey_crm_20260806.sql.gz      # 日备
  ├── huakey_crm_20260807.sql.gz
  ├── ...
  ├── huakey_crm_weekly_2026-W31.sql.gz  # 周备
  ├── backup.log                       # 备份日志
  └── restore-test.log                 # 恢复演练日志
```

### 2.7 空间估算

| 备份项 | 单次大小 | 7 天日备 | 4 周周备 | 合计 |
|--------|----------|----------|----------|------|
| MySQL dump（gzip 压缩后） | ~500 KB | ~3.5 MB | ~2 MB | ~5.5 MB |

> 当前生产数据量较小（crm_customer 425 行），单次备份压缩后约 500 KB。建议预留 2 GB 备份空间以应对数据增长。

---

## 3. 备份脚本

### 3.1 脚本位置

`deploy/backup/mysql-backup.sh`（仓库内） → 部署至 NAS `/volume1/docker/crm-stack/deploy/backup/mysql-backup.sh`

### 3.2 核心特性

| 特性 | 实现方式 |
|------|----------|
| 密码安全 | 从 `.env.secrets` 读取，禁止硬编码 |
| 特殊字符兼容 | `source` 加载环境变量，支持密码含 `$ # @ *` |
| 容器状态检查 | 执行前验证 `huakey-mysql` 运行中 |
| 备份完整性 | 验证文件大小 > 100 字节 + 表计数 |
| 分级保留 | 每日 7 天 + 每周 4 周自动清理 |
| 失败文件清理 | 自动删除 < 100 字节的空备份 |
| 日志记录 | 全程 `tee` 写入 `backup.log` |

### 3.3 密码加载机制

```bash
# 从 .env.secrets 加载（主作用域 source，确保变量全局可用）
set +u
. "$SECRETS_SOURCE"
set -u
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  log "FATAL: MYSQL_ROOT_PASSWORD 未找到"
  exit 1
fi
```

> **注意**：`source` 必须在主脚本作用域执行，不能放在函数内（否则变量为局部）。

---

## 4. 恢复流程

### 4.1 恢复演练流程（Restore Test）

> **原则**：不在生产库直接恢复。使用临时库 `huakey_crm_restore_test` 验证备份可用性。

```
步骤 1: 清理旧临时库（DROP DATABASE IF EXISTS huakey_crm_restore_test）
步骤 2: 创建临时库（CREATE DATABASE ... utf8mb4）
步骤 3: 解压备份 → docker cp 到容器 → 容器内 mysql 导入
步骤 4: 验证表数量（对比生产库 vs 恢复库）
步骤 5: 验证关键表数据（crm_customer / crm_opportunity / crm_quote / crm_contract）
步骤 6: 验证关键表结构（列数）
步骤 7: 清理临时库（DROP DATABASE huakey_crm_restore_test）
```

### 4.2 恢复演练脚本

`deploy/backup/restore-test.sh`（仓库内） → 部署至 NAS

### 4.3 生产恢复流程（紧急情况）

> ⚠️ 仅在生产数据损坏/丢失时执行。恢复前必须停止应用容器避免写入冲突。

```bash
# 1. 停止 App 容器
cd /volume1/docker/crm-stack
docker compose -f docker-compose.synology.yml stop app

# 2. 加载凭据
source .env.secrets

# 3. 选择备份文件
BACKUP_FILE="/volume1/docker/crm-stack/database/backups/huakey_crm_YYYYMMDD.sql.gz"

# 4. 恢复到生产库
gunzip -c "$BACKUP_FILE" > /tmp/restore.sql
docker cp /tmp/restore.sql huakey-mysql:/tmp/restore.sql
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" huakey-mysql \
  sh -c "mysql -u root huakey_crm < /tmp/restore.sql"
rm -f /tmp/restore.sql
docker exec huakey-mysql rm -f /tmp/restore.sql

# 5. 验证数据
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" huakey-mysql \
  mysql -u root huakey_crm -e "SELECT COUNT(*) FROM crm_customer; SELECT COUNT(*) FROM sys_user;"

# 6. 重启 App
docker compose -f docker-compose.synology.yml start app

# 7. 健康检查
sleep 10
curl -sk https://localhost:8443/api/v1/health
```

### 4.4 RTO / RPO 目标

| 指标 | 目标 | 实测 | 说明 |
|------|------|------|------|
| RPO（数据丢失上限） | 24 小时 | 24 小时 | 日备频率 |
| RTO（恢复时间目标） | 30 分钟 | ~7 分钟 | 恢复演练实测 409 秒（导入） |

---

## 5. 恢复演练计划

### 5.1 定期演练频率

| 测试项 | 频率 | 验证标准 | 负责人 |
|--------|------|----------|--------|
| 数据库恢复测试 | 每月 1 次 | 表数量一致 + 关键表行数一致 | 运维 |
| 备份完整性检查 | 每周 1 次 | `gunzip -t` 解压测试通过 | 运维 |
| 磁盘空间检查 | 每日 | `/volume1` 剩余 > 10% | 运维 |
| 完整恢复演练 | 每季度 | Smoke Test 通过 | 运维 + 开发 |

### 5.2 演练执行命令

```bash
# 在 NAS 上执行恢复演练
ssh nas-crm
bash /volume1/docker/crm-stack/deploy/backup/restore-test.sh

# 查看演练日志
cat /volume1/docker/crm-stack/database/backups/restore-test.log
```

---

## 6. 监控与告警

| 检查项 | 检查方式 | 告警阈值 | 处置 |
|--------|----------|----------|------|
| 备份成功 | 检查 `backup.log` 末尾 | 连续 2 天无成功记录 | 检查容器状态 + 手动执行 |
| 备份大小 | `ls -la` 检查文件大小 | < 100 字节或骤降 > 50% | 检查 mysqldump 错误 |
| 磁盘空间 | `df -h /volume1` | 剩余 < 10% | 清理旧备份 + 扩容 |
| 恢复测试 | 每月执行 `restore-test.sh` | 表数量不一致或导入失败 | 检查备份完整性 |

---

## 7. 安全要求

### 7.1 凭据安全

- ✅ 备份脚本通过 `source .env.secrets` 加载密码，禁止硬编码
- ✅ `.env.secrets` 已加入 `.gitignore`，不进入版本控制
- ✅ 使用 `MYSQL_PWD` 环境变量传递密码，避免命令行参数暴露
- ✅ `.env.secrets` 文件权限应为 `600`（仅 owner 可读）

### 7.2 备份文件安全

- 备份文件含完整数据库（含用户密码哈希），应视为敏感数据
- 备份目录权限应限制为 `root` 或 `syadmin` 可访问
- 禁止将备份文件传输到非加密通道（如明文 HTTP/FTP）

### 7.3 恢复安全

- 恢复演练使用临时库，不影响生产数据
- 生产恢复前必须停止 App 容器，避免写入冲突
- 恢复后必须执行数据完整性验证

---

## 8. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) | 群晖 DSM 任务计划配置指南 |
| [crm-v1-backup-verification-report.md](./crm-v1-backup-verification-report.md) | 备份验证报告 |
| [crm-v1-go-live-runbook.md](./crm-v1-go-live-runbook.md) | 上线运维手册 |
| [crm-v1-production-checklist.md](./crm-v1-production-checklist.md) | 生产检查清单 |
