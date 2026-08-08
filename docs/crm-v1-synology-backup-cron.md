# HuakeyCRM v1 群晖定时备份任务配置（DSM Task Scheduler）

> **文档类型**: Synology DSM Task Scheduler Configuration Guide
> **版本**: HuakeyCRM v1.0 (v2 - 新增文件备份与验证)
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS（DSM 7.x，DS925+）
> **状态**: 待配置（DSM 任务计划需新增 3 个任务）

---

## 1. 概述

HuakeyCRM 生产备份通过 **群晖 DSM 任务计划**（Task Scheduler）驱动，包含三个定时任务，形成完整的备份流水线。

### 1.1 备份任务时间线

```
02:00  MySQL 数据库备份（已有）
   ↓
02:30  文件备份 app-uploads（新增）
   ↓
03:00  备份验证（新增）
```

### 1.2 备份执行链路

| 时间 | 任务 | 脚本 | 输出 |
|------|------|------|------|
| 02:00 | MySQL 数据库备份 | `mysql-backup.sh` | `database/backups/huakey_crm_YYYYMMDD.sql.gz` |
| 02:30 | 文件备份 (app-uploads) | `uploads-backup.sh` | `database/backups/uploads/uploads_YYYYMMDD.tar.gz` |
| 03:00 | 备份验证 | `restore-test.sh` | `database/backups/verify.log` |

### 1.3 为什么使用 DSM 任务计划

| 对比项 | backup 容器（旧方案） | DSM 任务计划（新方案） |
|--------|----------------------|------------------------|
| 执行可靠性 | 空文件风险 | 已验证有效备份 |
| 依赖 | 额外容器 | 复用现有容器 |
| 日志 | 容器内难查看 | 直接写入 log 文件 |
| 失败重试 | 无 | DSM 支持失败通知 |
| 编排 | 无 | 03:00 验证前两个任务均已完成 |

---

## 2. 前置条件检查

```bash
# 1. 确认备份脚本已部署
ls -la /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh
ls -la /volume1/docker/crm-stack/deploy/backup/uploads-backup.sh
ls -la /volume1/docker/crm-stack/deploy/backup/restore-test.sh

# 2. 确认 .env.secrets 存在且含 MYSQL_ROOT_PASSWORD
grep MYSQL_ROOT_PASSWORD /volume1/docker/crm-stack/.env.secrets

# 3. 确认容器运行中
docker ps --filter name=huakey-mysql --filter status=running
docker ps --filter name=huakey-app --filter status=running

# 4. 手动执行验证
bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh
bash /volume1/docker/crm-stack/deploy/backup/uploads-backup.sh
bash /volume1/docker/crm-stack/deploy/backup/restore-test.sh
```

---

## 3. DSM 任务计划配置

### 3.1 进入任务计划

1. 登录群晖 DSM（`http://192.168.0.200:5000` 或 `https://192.168.0.200:5001`）
2. 打开 **控制面板** → **任务计划**
3. 点击 **新增 → 计划任务 → 用户定义的脚本**

---

### 3.2 任务一：MySQL 数据库备份（02:00）

#### 常规设置

| 字段 | 值 |
|------|-----|
| 任务名称 | `CRM-MySQL-Daily-Backup` |
| 用户 | `root` |
| 已启用 | 勾选 |

#### 执行时间

| 字段 | 值 |
|------|-----|
| 运行日期 | 每日（Daily） |
| 运行时间 | `02:00` |

#### 执行命令

```bash
bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh >> /volume1/docker/crm-stack/database/backups/cron.log 2>&1
```

#### 保留策略

- 每日备份保留 7 天
- 每周备份（周日）保留 4 周

---

### 3.3 任务二：文件备份 app-uploads（02:30）【新增】

#### 常规设置

| 字段 | 值 |
|------|-----|
| 任务名称 | `CRM-Uploads-Daily-Backup` |
| 用户 | `root` |
| 已启用 | 勾选 |

#### 执行时间

| 字段 | 值 |
|------|-----|
| 运行日期 | 每日（Daily） |
| 运行时间 | `02:30` |

> **时间说明**: 在 MySQL 备份完成后 30 分钟执行，确保两个备份任务不冲突。文件备份为 tar 打包，资源占用低，通常 1 分钟内完成。

#### 执行命令

```bash
bash /volume1/docker/crm-stack/deploy/backup/uploads-backup.sh >> /volume1/docker/crm-stack/database/backups/uploads-cron.log 2>&1
```

#### 保留策略

- 每日备份保留 7 天

#### 备份对象

| 项目 | 值 |
|------|-----|
| Volume | `crm-stack_app-uploads` |
| 路径 | `/volume1/@docker/volumes/crm-stack_app-uploads/_data` |
| 容器内 | `/app/uploads` |
| 格式 | `uploads_YYYYMMDD.tar.gz` |

---

### 3.4 任务三：备份验证（03:00）【新增】

#### 常规设置

| 字段 | 值 |
|------|-----|
| 任务名称 | `CRM-Backup-Verification` |
| 用户 | `root` |
| 已启用 | 勾选 |

#### 执行时间

| 字段 | 值 |
|------|-----|
| 运行日期 | 每日（Daily） |
| 运行时间 | `03:00` |

> **时间说明**: 在两个备份任务均完成后执行，验证当天生成的备份文件完整性。

#### 执行命令

```bash
bash /volume1/docker/crm-stack/deploy/backup/restore-test.sh >> /volume1/docker/crm-stack/database/backups/verify-cron.log 2>&1
```

#### 验证内容

| 验证项 | 方式 |
|--------|------|
| MySQL 备份 | 表数量、文件大小、解压测试 |
| Uploads 备份 | 文件数量、tar 解压测试 |

---

## 4. 任务验证

### 4.1 手动触发测试

依次在任务计划列表中运行：

1. 选中 `CRM-MySQL-Daily-Backup` → 点击 **运行**
2. 等待完成后，选中 `CRM-Uploads-Daily-Backup` → 点击 **运行**
3. 等待完成后，选中 `CRM-Backup-Verification` → 点击 **运行**

### 4.2 验证备份生成

```bash
# MySQL 备份
ls -la /volume1/docker/crm-stack/database/backups/huakey_crm_*.sql.gz

# Uploads 备份
ls -la /volume1/docker/crm-stack/database/backups/uploads/uploads_*.tar.gz

# 验证日志
tail -20 /volume1/docker/crm-stack/database/backups/backup.log
tail -20 /volume1/docker/crm-stack/database/backups/uploads-backup.log
tail -20 /volume1/docker/crm-stack/database/backups/verify.log
```

### 4.3 验证无报错

```bash
# 检查所有备份日志是否有 FATAL 错误
grep FATAL /volume1/docker/crm-stack/database/backups/*.log
# 期望: 无输出
```

---

## 5. 日志管理

### 5.1 日志文件

| 日志文件 | 写入方 | 内容 |
|----------|--------|------|
| `backup.log` | mysql-backup.sh | MySQL 备份详细日志 |
| `uploads-backup.log` | uploads-backup.sh | 文件备份详细日志 |
| `verify.log` | restore-test.sh | 备份验证日志 |
| `cron.log` | DSM 任务重定向 | MySQL 任务调度输出 |
| `uploads-cron.log` | DSM 任务重定向 | 文件备份任务调度输出 |
| `verify-cron.log` | DSM 任务重定向 | 验证任务调度输出 |

### 5.2 日志查看命令

```bash
# 查看所有备份日志
tail -30 /volume1/docker/crm-stack/database/backups/backup.log
tail -30 /volume1/docker/crm-stack/database/backups/uploads-backup.log
tail -30 /volume1/docker/crm-stack/database/backups/verify.log

# 检查所有失败记录
grep -E "FATAL|FAIL|ERROR" /volume1/docker/crm-stack/database/backups/*.log

# 查看备份文件列表
ls -lt /volume1/docker/crm-stack/database/backups/huakey_crm_*.sql.gz
ls -lt /volume1/docker/crm-stack/database/backups/uploads/uploads_*.tar.gz
```

### 5.3 日志轮转

```bash
# 检查日志大小
du -h /volume1/docker/crm-stack/database/backups/*.log

# 如日志过大（> 10MB），可截断保留最近 1000 行
for f in /volume1/docker/crm-stack/database/backups/*.log; do
  tail -1000 "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
done
```

---

## 6. 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| MySQL 备份文件 20 字节 | mysqldump 连接失败 | 检查容器状态 + 密码正确性 |
| Uploads 备份为空 | volume 路径无权限 | 确认任务以 root 运行 |
| `Volume 路径不存在` | volume 被删除 | 检查 `docker volume ls` |
| `磁盘可用空间不足` | 磁盘满 | 清理旧备份或扩展存储 |
| 验证失败 | 备份文件损坏 | 检查对应备份日志 |

### 6.1 手动执行备份

```bash
ssh nas-crm
# MySQL 备份
bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh
# 文件备份
bash /volume1/docker/crm-stack/deploy/backup/uploads-backup.sh
# 备份验证
bash /volume1/docker/crm-stack/deploy/backup/restore-test.sh
```

---

## 7. 任务清单（Checklist）

### 7.1 任务一：MySQL 备份（02:00）

- [ ] 脚本已部署：`deploy/backup/mysql-backup.sh`
- [ ] 脚本有执行权限
- [ ] `.env.secrets` 含 `MYSQL_ROOT_PASSWORD`
- [ ] huakey-mysql 容器运行正常
- [ ] 手动执行成功（生成 .sql.gz）
- [ ] DSM 任务已创建：`CRM-MySQL-Daily-Backup`
- [ ] 执行用户：`root`
- [ ] 执行时间：每日 `02:00`

### 7.2 任务二：文件备份（02:30）

- [ ] 脚本已部署：`deploy/backup/uploads-backup.sh`
- [ ] 脚本有执行权限
- [ ] huakey-app 容器运行正常
- [ ] volume `crm-stack_app-uploads` 存在
- [ ] 手动执行成功（生成 .tar.gz）
- [ ] DSM 任务已创建：`CRM-Uploads-Daily-Backup`
- [ ] 执行用户：`root`
- [ ] 执行时间：每日 `02:30`

### 7.3 任务三：备份验证（03:00）

- [ ] 脚本已部署：`deploy/backup/restore-test.sh`
- [ ] 手动执行成功
- [ ] DSM 任务已创建：`CRM-Backup-Verification`
- [ ] 执行用户：`root`
- [ ] 执行时间：每日 `03:00`

---

## 8. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-file-backup-plan.md](./crm-v1-file-backup-plan.md) | 文件备份设计方案 |
| [crm-v1-config-backup-security.md](./crm-v1-config-backup-security.md) | 配置文件备份安全策略 |
| [crm-v1-backup-disaster-recovery-plan.md](./crm-v1-backup-disaster-recovery-plan.md) | 备份与灾备完整方案 |
| [crm-v1-backup-verification-report.md](./crm-v1-backup-verification-report.md) | 备份验证报告 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 备份覆盖报告 |
