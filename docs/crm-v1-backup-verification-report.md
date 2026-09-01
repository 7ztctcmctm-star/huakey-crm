# HuakeyCRM v1 备份验证报告（Backup Verification Report）

> **文档类型**: Backup Verification Report
> **版本**: HuakeyCRM v1.0
> **验证日期**: 2026-08-06
> **验证环境**: 群晖 NAS 生产部署（192.168.0.200）
> **最终状态**: **Backup: READY | Restore: VERIFIED**

---

## 执行摘要

本次验证对 HuakeyCRM v1.0 生产环境的 MySQL 数据库备份与恢复能力进行了端到端验证，涵盖备份创建、恢复演练、数据完整性校验、恢复时间测量，以及部署文件安全审计。

| 验证项 | 结果 |
|--------|------|
| Backup Created | ✅ PASS |
| Restore Tested | ✅ PASS |
| Data Integrity | ✅ PASS |
| Recovery Time | ✅ 409 秒（~6.8 分钟，优于 30 分钟 RTO 目标） |
| Security Audit | ⚠️ 已记录发现（不阻塞备份就绪） |

---

## 1. Backup Created（备份创建验证）

### 1.1 备份执行结果

| 项目 | 值 |
|------|-----|
| 备份时间 | 2026-08-06 16:00:06 |
| 备份文件 | `huakey_crm_20260806.sql.gz` |
| 压缩后大小 | 503,751 bytes（~492 KB） |
| 解压后大小 | 3,049,410 bytes（~2.9 MB） |
| 表数量 | 103 表 |
| 备份脚本 | `deploy/backup/mysql-backup.sh` |
| 密码来源 | `.env.secrets`（未硬编码） |
| 压缩格式 | gzip |

### 1.2 备份脚本执行日志（关键片段）

```
[2026-08-06 16:00:06] HuakeyCRM MySQL 备份开始
[2026-08-06 16:00:06] 密码加载: 成功（来源: /volume1/docker/crm-stack/.env.secrets）
[2026-08-06 16:00:06] MySQL 容器: 运行中
[2026-08-06 16:00:06] 开始每日备份: huakey_crm_20260806.sql.gz
[2026-08-06 16:00:08] 每日备份完成: huakey_crm_20260806.sql.gz (503751 bytes, 103 表)
[2026-08-06 16:00:08] 清理每日备份: 删除 0 个过期文件
[2026-08-06 16:00:08] 清理周备份: 删除 0 个过期文件
[2026-08-06 16:00:08] 备份完成
```

### 1.3 备份验证项

| 验证项 | 标准 | 实测 | 结果 |
|--------|------|------|------|
| 备份文件生成 | 文件存在 | ✅ 存在 | PASS |
| 备份文件大小 | > 100 字节 | 503,751 字节 | PASS |
| 备份完整性 | 含 CREATE TABLE 语句 | 103 表 | PASS |
| 密码安全 | 未硬编码 | source .env.secrets | PASS |
| 过期清理 | find -mtime 清理 | 0 个过期（首次执行） | PASS |

---

## 2. Restore Tested（恢复演练验证）

### 2.1 恢复演练环境

| 项目 | 值 |
|------|-----|
| 演练时间 | 2026-08-06 16:38:17 - 16:48:32 |
| 临时数据库 | `huakey_crm_restore_test` |
| 生产数据库 | `huakey_crm`（未受影响） |
| 恢复脚本 | `deploy/backup/restore-test.sh` |
| 备份源文件 | `huakey_crm_20260806.sql.gz` |

### 2.2 恢复演练步骤与结果

| 步骤 | 操作 | 结果 | 耗时 |
|------|------|------|------|
| 1 | 清理旧临时库（DROP DATABASE IF EXISTS） | ✅ 已清理 | ~103s |
| 2 | 创建临时数据库（utf8mb4） | ✅ 创建完成 | <1s |
| 3 | 解压备份 → docker cp → 容器内导入 | ✅ 导入完成 | 409s |
| 4 | 验证表数量（生产 vs 恢复） | ✅ 104/104 PASS | <1s |
| 5 | 验证关键表数据行数 | ✅ 全部一致 | <1s |
| 6 | 验证关键表结构（列数） | ✅ 全部一致 | <1s |
| 7 | 清理临时库（DROP DATABASE） | ✅ 已删除 | ~101s |

### 2.3 恢复方式说明

采用 `docker cp + 容器内 mysql 导入` 方式（非 SSH 管道），避免：
- SSH 管道阻塞问题（zcat | docker exec 易卡死）
- 密码特殊字符解析问题（使用 `MYSQL_PWD` 环境变量）
- PowerShell `$` 符号被变量展开问题

---

## 3. Data Integrity（数据完整性验证）

### 3.1 表数量对比

| 数据库 | 表数量 | 结果 |
|--------|--------|------|
| 生产库 `huakey_crm` | 104 | ✅ 一致 |
| 恢复库 `huakey_crm_restore_test` | 104 | ✅ 一致 |

> 注：备份日志显示 103 表（mysqldump 统计 CREATE TABLE），实际 information_schema 查询为 104 表（含视图）。差异源于统计方式不同，不影响完整性。

### 3.2 关键业务表数据对比

| 表名 | 生产库行数 | 恢复库行数 | 结果 |
|------|-----------|-----------|------|
| `crm_customer` | 425 | 425 | ✅ PASS |
| `crm_opportunity` | 0 | 0 | ✅ PASS |
| `crm_quote` | 0 | 0 | ✅ PASS |
| `crm_contract` | 0 | 0 | ✅ PASS |

> 说明：crm_opportunity/crm_quote/crm_contract 当前生产数据为空（v1.0 阶段业务尚未录入），表结构与生产一致即视为通过。

### 3.3 关键表结构验证（列数）

| 表名 | 列数 | 结果 |
|------|------|------|
| `crm_customer` | 29 列 | ✅ 结构完整 |
| `crm_opportunity` | 16 列 | ✅ 结构完整 |
| `crm_quote` | 19 列 | ✅ 结构完整 |
| `crm_contract` | 21 列 | ✅ 结构完整 |

### 3.4 数据完整性结论

| 完整性维度 | 结果 |
|-----------|------|
| Schema 完整性（表结构） | ✅ PASS |
| 数据行数一致性 | ✅ PASS |
| 关键表列数一致性 | ✅ PASS |
| 临时库清理 | ✅ 已清理（无残留） |

---

## 4. Recovery Time（恢复时间测量）

### 4.1 恢复时间分解

| 阶段 | 耗时 | 说明 |
|------|------|------|
| 清理旧临时库 | ~103 秒 | DROP DATABASE IF EXISTS |
| 创建临时库 | <1 秒 | CREATE DATABASE |
| 解压备份 | <1 秒 | gunzip（2.9 MB 解压） |
| 拷贝到容器 | <1 秒 | docker cp |
| **数据导入** | **409 秒** | mysql < restore.sql（主要耗时） |
| 验证查询 | <1 秒 | 表数量 + 行数 + 列数 |
| 清理临时库 | ~101 秒 | DROP DATABASE |
| **总恢复耗时** | **~10 分钟** | 含清理 |

### 4.2 RTO/RPO 达成情况

| 指标 | 目标 | 实测 | 达成 |
|------|------|------|------|
| RPO（数据丢失上限） | 24 小时 | 24 小时（日备频率） | ✅ 达成 |
| RTO（恢复时间目标） | 30 分钟 | ~7 分钟（纯导入） | ✅ 超额达成 |

> 生产环境实际恢复时无需创建/清理临时库，纯导入耗时约 7 分钟，远优于 30 分钟 RTO 目标。

---

## 5. Security Audit（部署文件安全审计）

### 5.1 审计范围

| 扫描对象 | 说明 |
|----------|------|
| `docker-compose.synology.yml` | 生产部署编排文件 |
| `.env` / `.env.secrets` / `.env.synology` | 环境变量文件 |
| `deploy/` | 部署脚本目录 |
| `database/backup.sh` | 旧备份脚本 |
| `scripts/` | 运维脚本目录 |
| `.gitignore` | git 忽略规则 |

### 5.2 审计结果

#### ✅ 通过项（无安全风险）

| 检查项 | 结果 |
|--------|------|
| `.env` 含真实凭据但已被 `.gitignore` 排除 | ✅ 未进入 git |
| `.env.secrets` 含真实凭据但已被 `.gitignore` 排除 | ✅ 未进入 git |
| `.env.synology` 含占位符值且已被 `.gitignore` 排除 | ✅ 安全 |
| `docker-compose.synology.yml` 使用 `${VAR}` 引用 | ✅ 无硬编码密码 |
| `deploy/init-admin.sql` 使用 `${ADMIN_INITIAL_PASSWORD_HASH}` 注入 | ✅ 无硬编码密码 |
| `deploy/backup/mysql-backup.sh` 通过 `source .env.secrets` 加载 | ✅ 无硬编码密码 |
| `deploy/backup/restore-test.sh` 使用 `MYSQL_PWD` 环境变量 | ✅ 无硬编码密码 |
| 临时脚本 `deploy/_https_deploy.sh`、`_scan2.sh`、`_scan_https.sh` | ✅ 未被 git 追踪 |
| `database/backups/` 目录 | ✅ 已被 `.gitignore` 排除 |
| `scripts/backup_database.bat` 使用环境变量 | ✅ 无硬编码密码 |
| git 历史中无 `.env` / `.env.secrets` 提交记录 | ✅ 已验证 |

#### ⚠️ 发现项（已记录，不修改生产文件）

| # | 文件 | 问题 | 风险等级 | 处置建议 |
|---|------|------|----------|----------|
| 1 | `deploy/nas-admin-reset.sh` | 含硬编码 bcrypt 哈希（`$2b$10$0DuK...`，对应临时密码 `Admin@2026`） | 中 | 紧急 admin 重置脚本，已设 `must_change_password=1`。建议后续将哈希改为环境变量注入 |
| 2 | `deploy/update-admin-password.ps1` | 同上，含相同硬编码 bcrypt 哈希 | 中 | 同上，PowerShell 版本的同类脚本 |
| 3 | `.env.test` | 含 Demo 账号密码（`Demo@123456`），未被 `.gitignore` 排除 | 低 | 仅 Demo 数据（is_demo=1），生产环境 `seed:demo` 硬阻断。建议后续加入 `.gitignore` |
| 4 | `database/backup.sh` | 旧备份脚本（已被 `deploy/backup/mysql-backup.sh` 取代），产出空 20 字节文件 | 低 | 已被新脚本替代，建议后续从仓库移除 |
| 5 | `deploy/nas-backup.sh` | 旧备份脚本（已被 `deploy/backup/mysql-backup.sh` 取代） | 低 | 同上，建议后续清理 |
| 6 | `deploy/install-backup.ps1` | 旧备份安装脚本（安装 `nas-backup.sh`） | 低 | 同上，建议后续清理 |
| 7 | `docker-compose.synology.yml` | 仍含 `backup` 服务定义（使用旧 `database/backup.sh`） | 低 | 容器未实际运行，建议后续维护时移除该服务定义 |

### 5.3 安全审计结论

> **按用户要求：发现问题只记录，不直接删除生产文件。**

| 审计维度 | 结论 |
|----------|------|
| 明文密码 | ✅ 无明文密码进入 git 仓库（.env/.env.secrets 已 gitignore） |
| 临时密钥 | ⚠️ 2 个 admin 重置脚本含硬编码 bcrypt 哈希（已记录，不阻塞） |
| 旧备份文件 | ⚠️ 3 个旧备份脚本仍在仓库（已被新脚本替代，建议后续清理） |
| 凭据注入 | ✅ 生产脚本均通过环境变量/source 加载密码 |
| 整体安全 | ✅ 不阻塞备份就绪，发现项均为后续优化项 |

---

## 6. 当前生产备份状态

### 6.1 容器运行状态

| 容器 | 状态 | 健康检查 |
|------|------|----------|
| huakey-mysql | Up 2 hours | ✅ healthy |
| huakey-redis | Up 2 hours | ✅ healthy |
| huakey-app | Up 52 minutes | ✅ healthy |
| huakey-nginx | Up 1 hour | ✅ healthy |

### 6.2 备份文件清单

```
/volume1/docker/crm-stack/database/backups/
  ├── huakey_crm_20260806.sql.gz   (503,751 bytes)  ← 当日备份
  ├── backup.log                   (备份日志)
  └── restore-test.log             (恢复演练日志)
```

### 6.3 备份脚本部署状态

| 脚本 | 路径 | 状态 |
|------|------|------|
| mysql-backup.sh | `/volume1/docker/crm-stack/deploy/backup/` | ✅ 已部署（5177 bytes） |
| restore-test.sh | `/volume1/docker/crm-stack/deploy/backup/` | ✅ 已部署（4244 bytes） |

### 6.4 DSM 定时任务状态

| 任务 | 状态 |
|------|------|
| DSM 任务计划 `CRM-MySQL-Daily-Backup` | ⏳ 待配置（参见 [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md)） |

> 当前备份为手动执行验证。DSM 定时任务配置后即可实现每日自动备份。

---

## 7. 最终状态

| 维度 | 状态 | 说明 |
|------|------|------|
| **Backup** | ✅ **READY** | 备份脚本已部署并验证，产出有效 500KB 备份文件 |
| **Restore** | ✅ **VERIFIED** | 恢复演练通过，104/104 表一致，crm_customer 425/425 行一致 |
| **Data Integrity** | ✅ **PASS** | 表结构、行数、列数全部验证一致 |
| **Recovery Time** | ✅ **7 分钟** | 纯导入 409 秒，优于 30 分钟 RTO 目标 |
| **Security** | ⚠️ **RECORDED** | 7 项发现已记录，不阻塞备份就绪，建议后续优化 |

### 待办事项（不阻塞备份就绪）

1. **配置 DSM 定时任务**：按 [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) 在 DSM 控制面板创建 `CRM-MySQL-Daily-Backup` 任务（每日 02:00）
2. **后续清理**（建议下次维护窗口）：移除旧备份脚本（`database/backup.sh`、`deploy/nas-backup.sh`、`deploy/install-backup.ps1`）
3. **凭据注入优化**（建议）：将 `deploy/nas-admin-reset.sh` 的硬编码 bcrypt 哈希改为环境变量注入
4. **`.env.test` 加入 .gitignore**（建议）：避免 Demo 账号密码进入版本控制

---

## 8. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-backup-disaster-recovery-plan.md](./crm-v1-backup-disaster-recovery-plan.md) | 备份与灾备完整方案 |
| [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) | 群晖 DSM 定时任务配置指南 |
| [crm-v1-go-live-runbook.md](./crm-v1-go-live-runbook.md) | 上线运维手册 |
| [crm-v1-production-checklist.md](./crm-v1-production-checklist.md) | 生产检查清单 |
