# HuakeyCRM v1.0 文件备份设计方案 (app-uploads)

> **文档状态**: COMPLETED
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS DSM 7.x + Docker CRM Stack
> **备份对象**: Docker named volume `crm-stack_app-uploads`

---

## 1. 概述

HuakeyCRM 的用户上传文件存储在 Docker named volume `crm-stack_app-uploads` 中。本方案设计将该 volume 纳入每日备份，与 MySQL 数据库备份形成完整的备份覆盖。

### 1.1 备份范围

| 备份对象 | 类型 | 备份方式 | 已覆盖 |
|----------|------|----------|---------|
| MySQL 数据库 | 数据 | mysqldump + gzip | YES |
| **app-uploads** | **文件** | **tar.gz** | **YES（本方案）** |
| .env / .env.secrets | 配置 | 离线/加密 | YES（见 config-backup-security） |

### 1.2 设计原则

- **不修改业务代码**: 仅在宿主机层面备份 Docker volume
- **不修改数据库结构**: 纯文件操作
- **不修改冻结模块**: 独立备份脚本，不触碰应用代码

---

## 2. Volume 路径确认

### 2.1 Docker Volume 信息

| 项目 | 值 |
|------|-----|
| Volume 名称 | `crm-stack_app-uploads` |
| 挂载点 (Mountpoint) | `/volume1/@docker/volumes/crm-stack_app-uploads/_data` |
| 容器内路径 | `/app/uploads` |
| 容器名称 | `huakey-app` |
| 子目录 | `attachments/`（附件）、`knowledge/`（知识库） |

### 2.2 发现方式

脚本通过 `docker volume inspect` 自动发现挂载路径，不硬编码路径：

```bash
VOLUME_PATH=$(/usr/local/bin/docker volume inspect "$VOLUME_NAME" --format '{{.Mountpoint}}')
```

### 2.3 当前数据量

| 检查项 | 值 |
|--------|-----|
| 文件数量 | 4 |
| 目录大小 | 16KB |
| 磁盘可用 | 10,871,665 MB (~10.4 TB) |

---

## 3. 备份设计

### 3.1 备份方式

| 配置项 | 值 |
|--------|-----|
| 备份格式 | `tar.gz` |
| 压缩级别 | gzip 默认 (-6) |
| 排除文件 | `*.tmp`, `*.lock` |
| 权限保留 | tar 原生保留 uid/gid/权限 |

### 3.2 备份频率

| 类型 | 频率 | 执行时间 |
|------|------|----------|
| 每日备份 | 每天 | 02:30 |
| 手动备份 | 按需 | 手动执行脚本 |

### 3.3 保留策略

| 类型 | 保留时长 | 清理方式 |
|------|----------|----------|
| 每日备份 | 7 天 | `find -mtime +7 -delete` |

### 3.4 文件命名

```
uploads_YYYYMMDD.tar.gz
```

示例：`uploads_20260806.tar.gz`

---

## 4. 备份脚本

### 4.1 脚本位置

| 位置 | 路径 |
|------|------|
| 仓库 | `deploy/backup/uploads-backup.sh` |
| NAS | `/volume1/docker/crm-stack/deploy/backup/uploads-backup.sh` |

### 4.2 核心功能

1. **自动发现 volume 路径**: 通过 `docker volume inspect` 获取 Mountpoint
2. **容器状态检查**: 确认 `huakey-app` 运行中
3. **磁盘空间检查**: 可用空间 < 500MB 时中止备份
4. **tar.gz 压缩**: 打包整个 volume 目录
5. **完整性验证**: 统计备份内文件数量
6. **过期清理**: 自动删除 7 天前的备份
7. **日志记录**: 写入 `uploads-backup.log`

### 4.3 验证项

| 验证项 | 方式 | 期望 |
|--------|------|------|
| 文件数量 | `tar -tzf | grep -c -v '/$'` | 与源文件数一致 |
| 文件大小 | `stat -c%s` | > 100 bytes |
| 解压测试 | `tar -tzf` 成功 | 无错误退出 |

---

## 5. 备份验证流程

### 5.1 手动验证

```bash
# 1. 查看备份文件
ls -lh /volume1/docker/crm-stack/database/backups/uploads/

# 2. 查看备份日志
tail -30 /volume1/docker/crm-stack/database/backups/uploads-backup.log

# 3. 验证备份内容
tar -tzf /volume1/docker/crm-stack/database/backups/uploads/uploads_YYYYMMDD.tar.gz

# 4. 解压到临时目录验证
mkdir -p /tmp/verify_uploads
tar -xzf /volume1/docker/crm-stack/database/backups/uploads/uploads_YYYYMMDD.tar.gz -C /tmp/verify_uploads
find /tmp/verify_uploads -type f | wc -l
rm -rf /tmp/verify_uploads
```

### 5.2 恢复流程

```bash
# 1. 停止应用容器（避免文件冲突）
docker stop huakey-app

# 2. 恢复上传文件
tar -xzf /volume1/docker/crm-stack/database/backups/uploads/uploads_YYYYMMDD.tar.gz \
  -C /volume1/@docker/volumes/crm-stack_app-uploads/_data/

# 3. 重启应用容器
docker start huakey-app
```

---

## 6. 测试结果

### 6.1 首次执行验证

```
[2026-08-06 17:42:41] HuakeyCRM 文件备份开始 (app-uploads)
[2026-08-06 17:42:41] 应用容器: 运行中
[2026-08-06 17:42:41] Volume: crm-stack_app-uploads -> /volume1/@docker/volumes/crm-stack_app-uploads/_data
[2026-08-06 17:42:41] 磁盘空间: 可用 10871665MB
[2026-08-06 17:42:41] 源文件统计: 4 个文件, 总大小 16K
[2026-08-06 17:42:41] 备份文件: uploads_20260806.tar.gz
[2026-08-06 17:42:41] 备份完成: uploads_20260806.tar.gz (4.0K, 4 个文件)
[2026-08-06 17:42:41] 文件备份完成
```

### 6.2 验证结果

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 脚本执行 | exit 0 | PASS |
| 容器状态检查 | 运行中 | PASS |
| Volume 路径发现 | 自动成功 | PASS |
| 磁盘空间检查 | 10.8TB 可用 | PASS |
| 源文件统计 | 4 个文件 | PASS |
| 备份文件生成 | uploads_20260806.tar.gz | PASS |
| 备份文件大小 | 314 bytes (4.0K) | PASS |
| 备份内文件数 | 4 个 | PASS |
| 过期清理 | 正常 | PASS |

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-config-backup-security.md](./crm-v1-config-backup-security.md) | 配置文件备份安全策略 |
| [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) | 群晖定时任务配置 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 备份覆盖报告 |
