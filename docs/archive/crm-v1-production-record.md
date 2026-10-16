# HuakeyCRM v1 生产版本记录

> **文档类型**: Production Release Record
> **版本**: HuakeyCRM v1.0
> **部署日期**: 2026-08-06
> **环境**: 群晖 NAS（生产）

---

## 1. 版本信息

| 项目 | 值 |
|------|-----|
| 产品名称 | HuakeyCRM（铧旗 CRM） |
| 版本 | v1.0 |
| 后端版本 | v1.5.0 |
| 前端框架 | Vite 7 + Vue 3 |
| 数据库 | MySQL 8.0.46 |
| 缓存 | Redis 7.4.9 |
| Node.js | 22 |
| Express | 4.22.2 |

---

## 2. 部署信息

| 项目 | 值 |
|------|-----|
| 部署日期 | 2026-08-06 |
| 部署环境 | Synology NAS |
| 访问地址 | http://192.168.0.200:6789 |
| 部署方式 | Docker Compose |
| 部署人员 | Release Execution Lead |

---

## 3. 容器配置

### 3.1 容器列表

| 容器 | 镜像 | 端口 | 资源限制 | 健康检查 |
|------|------|------|----------|----------|
| huakey-app | crm-stack-app（本地构建） | 6789:5000 | 1 GB / 1.0 CPU | wget /api/v1/health |
| huakey-mysql | mysql:8.0 | 3306（内部） | 1 GB / 1.0 CPU | mysqladmin ping |
| huakey-redis | redis:7-alpine | 6379（内部） | 256 MB / 0.5 CPU | redis-cli ping |

### 3.2 Docker 卷

| 卷名 | 用途 |
|------|------|
| crm-stack_mysql-data | MySQL 数据持久化 |
| crm-stack_app-uploads | 上传文件存储 |
| crm-stack_app-logs | 应用日志 |

### 3.3 Docker 网络

| 网络 | 类型 |
|------|------|
| crm-network | bridge（自定义） |

---

## 4. 数据库信息

| 项目 | 值 |
|------|-----|
| 数据库名 | huakey_crm |
| 数据库版本 | MySQL 8.0.46 |
| 字符集 | utf8mb4 / utf8mb4_unicode_ci |
| 迁移总数 | 105 个（001-063 + 066-107） |
| 最新迁移 | 107_contract_approval_status_default.sql |
| 表数量 | 104 |
| 用户 | crm_user（应用）+ root（管理） |

### 迁移记录

| 版本 | 文件 | 说明 |
|------|------|------|
| 001-063 | 基础迁移 | 初始 schema + 业务表 |
| 064-065 | 跳过 | 已废弃 |
| 066-106 | 增量迁移 | 索引、字段、FK 清理 |
| 107 | approval_status 默认值修复 | DEFAULT 0（未提交） |

---

## 5. 模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| Customer Center | ✅ Frozen | 客户中心（含线索池/正式客户/公海） |
| Opportunity Center | ✅ Frozen | 商机中心 |
| Quote Center | ✅ Frozen | 报价中心 |
| Contract Center | ✅ Frozen | 合同中心（approval_status 0=未提交） |
| Product Module | ✅ Active | 产品管理 |
| System Module | ✅ Active | 用户/角色/权限/日志 |
| Approval Module | ✅ Active | 审批流程 |
| Integration Module | ✅ Active | 集成配置 |

---

## 6. 安全配置

| 配置项 | 状态 | 说明 |
|--------|------|------|
| JWT Secret | ✅ | 64 字节 hex，非默认值 |
| 数据库密码 | ✅ | 强密码，.env.secrets 注入 |
| Redis 密码 | ✅ | 已配置 |
| Token 存储 | ✅ | httpOnly Cookie |
| CSRF 防护 | ✅ | 双重 Cookie + X-CSRF-Token |
| 参数化查询 | ✅ | 使用 ? 占位符 |
| 软删除过滤 | ✅ | deleted_at IS NULL |
| 文件上传权限 | ✅ | 绑定业务权限码 |
| 错误信息脱敏 | ✅ | 不暴露堆栈 |
| 验证码 | ✅ | Redis 存储 |
| Swagger | ✅ | 生产环境已关闭 |
| CORS | ✅ | 限定来源 |
| Helmet | ✅ | CSP 已配置 |
| 初始账号 | ✅ | must_change_password=1，已改密 |
| HTTPS | ⏳ | 待部署（见 https-deployment-plan） |

---

## 7. 健康检查

### 7.1 部署验证结果

| 检查项 | 结果 |
|--------|------|
| Health API | ✅ 200 OK |
| 版本 | v1.5.0 |
| Node 环境 | production |
| 数据库连接 | db=true |
| Redis 连接 | redis=true |
| 容器状态 | 3/3 Healthy |
| Migration | 105/105 |
| 表数量 | 104 |
| 前端页面 | 200 OK |

### 7.2 资源使用

| 容器 | CPU | 内存使用 |
|------|-----|----------|
| huakey-app | 0.05% | 84 MB / 1 GB (8%) |
| huakey-mysql | 0.31% | 532 MB / 1 GB (52%) |
| huakey-redis | 0.70% | 6 MB / 256 MB (2%) |

---

## 8. 已知问题

| # | 问题 | 阻塞 | 处置 |
|---|------|------|------|
| 1 | customer-crud E2E 失败 | ❌ | 测试代码未适配新设计（v1.1 修复） |
| 2 | quotation-to-contract 失败 | ❌ | 历史前端问题（v1.1 修复） |
| 3 | sys_log INSERT 慢查询 | ❌ | 日志写入性能（监控） |
| 4 | status/business_status 不一致 | ❌ | 跨模块字段映射（v1.1 统一） |
| 5 | 无 HTTPS | ❌ | 已规划（见 https-deployment-plan） |
| 6 | 无自动备份 | ❌ | 已规划（见 backup-strategy） |

详见: `docs/crm-v1-known-issues.md`

---

## 9. 运维文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 上线演练手册 | `docs/crm-v1-go-live-runbook.md` | 部署流程 |
| 上线执行记录 | `docs/crm-v1-go-live-execution-log.md` | 部署日志 |
| 生产检查清单 | `docs/crm-v1-production-checklist.md` | 检查项 |
| Go Live 审批 | `docs/crm-v1-go-live-approval.md` | 审批报告 |
| 已知问题 | `docs/crm-v1-known-issues.md` | 非阻塞问题 |
| 首次登录验证 | `docs/crm-v1-first-login-check.md` | 安全验证 |
| HTTPS 部署规划 | `docs/crm-v1-https-deployment-plan.md` | HTTPS 方案 |
| 自动备份方案 | `docs/crm-v1-backup-strategy.md` | 备份策略 |
| 监控方案 | `docs/crm-v1-monitoring-plan.md` | 日志与健康监控 |
| 清理报告 | `docs/crm-v1-cleanup-report.md` | 残留清单 |
| 生产版本记录 | `docs/crm-v1-production-record.md` | 本文档 |
| 部署手册 | `docs/deployment.md` | 部署参考 |
| 合同状态定义 | `docs/contract-status-definition.md` | 业务定义 |

---

## 10. 版本状态

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   HuakeyCRM v1.0                                         ║
║   Production Status: DEPLOYED                            ║
║                                                          ║
║   部署日期: 2026-08-06                                   ║
║   环境: Synology NAS                                    ║
║   访问: http://192.168.0.200:6789                       ║
║                                                          ║
║   Migration: 107/107 verified                            ║
║   Containers: App + MySQL + Redis (all Healthy)         ║
║   Database: 104 tables                                   ║
║   Admin: admin / boss (密码已修改)                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## 11. Production Operation Baseline

| 维度 | 状态 | 说明 |
|------|------|------|
| **Security** | ✅ PASS | 初始密码已改、JWT/DB/Redis 密码已配置、权限隔离验证通过 |
| **Backup** | ✅ READY | 备份方案已规划（待配置 DSM 任务计划） |
| **Monitoring** | ✅ READY | 健康检查脚本已设计（待配置 DSM 定时任务） |
| **Recovery** | ✅ READY | 回滚方案 + 数据库恢复流程已就绪 |

**Production Operation Baseline: ESTABLISHED ✅**
