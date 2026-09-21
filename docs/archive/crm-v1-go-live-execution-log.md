# HuakeyCRM v1 Go Live Execution Log

> **文档类型**: Production Deployment Execution Log
> **版本**: HuakeyCRM v1.0
> **执行日期**: 2026-08-06
> **执行环境**: 本地部署演练（模拟生产流程）
> **执行人**: Release Execution Lead

---

## Release Version

| 项目 | 版本 / 状态 |
|------|------------|
| 产品 | HuakeyCRM v1.0 |
| 后端 | v1.5.0 |
| 前端 | Vite 7 + Vue 3 |
| 数据库 | MySQL 8.0 |
| 迁移编号 | 001–063, 066–107（共 105 个正向迁移） |
| 最新迁移 | `107_contract_approval_status_default.sql` |
| 部署目标 | 群晖 NAS Docker Compose（端口 6789:5000） |

**模块冻结状态**:
- ✅ Customer Center Frozen
- ✅ Opportunity Center Frozen
- ✅ Quote Center Frozen
- ✅ Contract Center Frozen

---

## Deployment Date

| 阶段 | 时间 (UTC+8) |
|------|-------------|
| 部署前检查开始 | 2026-08-06 14:09 |
| 数据库验证完成 | 2026-08-06 14:09 |
| Smoke Test 开始 | 2026-08-06 14:10 |
| Smoke Test 完成 | 2026-08-06 14:20 |
| 总耗时 | ~11 分钟 |

---

## Operator

| 角色 | 职责 |
|------|------|
| Release Execution Lead | 部署演练执行、验证、记录 |
| Release Manager | 审批放行（已 APPROVED） |

---

## Backup Result

### 部署前数据库备份

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 备份命令 | ✅ 已就绪 | `mysqldump -u root -p --single-transaction --routines --triggers huakey_crm > backup_pre_v1_$(date +%Y%m%d_%H%M%S).sql` |
| 备份验证 | ✅ 已就绪 | `grep -c "CREATE TABLE" backup_pre_v1_*.sql`（期望 > 30） |
| 恢复测试 | ⏳ 生产部署当天执行 | 见 `docs/crm-v1-go-live-runbook.md` §2 |

> 注：本次为本地部署演练，未执行实际生产备份。生产部署当天必须按 runbook §2 执行备份。

---

## Migration Result

### 数据库迁移状态

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 数据库 | huakey_crm（生产）/ huakey_crm_test（演练） | ✅ |
| 已执行迁移数 | 105 / 105 | ✅ |
| Migration 107 | 已应用（2026-08-06 11:37:25） | ✅ |
| `approval_status` 默认值 | `0`（未提交） | ✅ |
| `approval_status` 注释 | `审批状态: 0=未提交, 1=待审批, 2=已通过, 3=已拒绝` | ✅ |
| 历史数据影响 | 已有数据不变（MODIFY 不回填） | ✅ |

### Migration 107 验证详情

```
crm_contract.approval_status 列定义:
  类型: tinyint
  默认值: 0
  可空: NO
  注释: 审批状态: 0=未提交, 1=待审批, 2=已通过, 3=已拒绝
  默认值校验: ✅ 通过 (DEFAULT 0 = 未提交)

crm_contract 数据分布 (deleted_at IS NULL):
  approval_status=2: 1 条（历史数据，未受影响）
```

### 回滚验证

| 检查项 | 状态 |
|--------|------|
| `107_contract_approval_status_default_down.sql` 存在 | ✅ |
| 回滚恢复 `DEFAULT 2` + 原始注释 | ✅ |
| 幂等检查已实现 | ✅ |
| 跨库兼容（不使用 USE 语句） | ✅ |

---

## Service Startup Result

### 后端服务

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 服务端口 | 5000 | ✅ |
| 健康检查 | HTTP 200 | ✅ |
| 服务状态 | `status=ok` | ✅ |
| 版本 | v1.5.0 | ✅ |
| 数据库连接 | `db=true` | ✅ |
| Redis 连接 | `redis=true` | ✅ |
| Node 环境 | test（演练）/ production（生产） | ✅ |
| MySQL 版本 | 8.0.46 | ✅ |
| Express 版本 | 4.22.2 | ✅ |

### 前端服务

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 服务端口 | 5173 | ✅ |
| 静态文件 | HTTP 200 | ✅ |
| Vite 构建 | PASS | ✅ |

### Docker 配置（生产部署就绪）

| 服务 | 镜像 | 资源限制 | 健康检查 | 状态 |
|------|------|----------|----------|------|
| mysql | mysql:8.0 | 512m / 1.0 cpu | mysqladmin ping | ✅ |
| redis | redis:7-alpine | 256m / 0.5 cpu | redis-cli ping | ✅ |
| app | Dockerfile.synology | 512m / 1.0 cpu | wget /api/v1/health | ✅ |

**端口映射**: `6789:5000`（外部访问 http://192.168.0.200:6789）

---

## Smoke Test Result

### 测试账号

| 账号 | 角色 | 用途 | 状态 |
|------|------|------|------|
| demo_admin | super_admin (manage_all=1) | Boss 等价，完整业务流程 | ✅ |
| demo_sales | sales | 权限隔离验证 | ✅ |
| manager | manager | 部署当天创建（本地有 Rin 等账号） | ⏳ |

### 测试结果：16/16 PASS ✅

```
==========================================
  HuakeyCRM v1.0 Go Live Smoke Test
  Time: 2026-08-06T06:20:24.613Z
  Tag: GoLive_1785997224613
==========================================

  ✅ 1. Health Check (HTTP 200, db=true, redis=true, v=1.5.0)
  ✅ 2. Boss Login (demo_admin) (userId=70)
  ✅ 3. Sales Login (demo_sales) (userId=71)
  ✅ 4. Boss 创建产品 (productId=26, code=200)
  ✅ 5. Boss 创建客户 (customerId=671, code=200)
  ✅ 6. 客户状态推进 lead → following (code=200)
  ✅ 7. Boss 创建商机 (oppId=31, code=200)
  ✅ 8. Boss 创建报价 (quoteId=18, code=200)
  ✅ 9. 客户状态推进 → signed (quoted:200 → negotiating:200 → signed:200)
  ✅ 10. Boss 创建合同 (contractId=13, code=200)
  ✅ 11a. 合同初始 approval_status=0 (未提交)
  ✅ 11b. 合同审批通过 (0→2) (code=200)
  ✅ 11c. 合同最终 approval_status=2 (已通过)
  ✅ 12. Sales 审批合同被拒 (403) (code=403)
  ✅ 13. 客户详情可查询 (code=200)
  ✅ 14. 前端静态文件 (HTTP 200)

==========================================
  PASS: 16  |  FAIL: 0
  RESULT: SMOKE TEST PASSED ✅
==========================================
```

### 业务流程验证

| 流程步骤 | 验证项 | 结果 |
|----------|--------|------|
| 登录 | Boss（super_admin）+ Sales 登录 | ✅ |
| 创建客户 | API 返回 customerId | ✅ |
| 状态推进 | lead → following → quoted → negotiating → signed | ✅ |
| 创建商机 | 关联客户，API 返回 oppId | ✅ |
| 创建报价 | 含产品 items，关联客户+商机 | ✅ |
| 创建合同 | 关联客户+商机+报价，amount 字段 | ✅ |
| 合同审批流转 | approval_status: 0（未提交）→ 2（已通过） | ✅ |
| 权限隔离 | Sales 审批合同被拒（403） | ✅ |
| 数据关联 | 客户详情可查询 | ✅ |
| 前端 | 静态文件加载 | ✅ |

### 权限验证

| 角色 | 操作 | 结果 |
|------|------|------|
| Boss (super_admin) | 创建产品/客户/商机/报价/合同 | ✅ 允许 |
| Boss (super_admin) | 审批合同 | ✅ 允许 |
| Sales | 登录 | ✅ 允许 |
| Sales | 审批合同 | ❌ 拒绝（403，requireManager 中间件） |

---

## Rollback Test

### 回滚方案验证

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Migration 107 回滚文件存在 | ✅ | `107_contract_approval_status_default_down.sql` |
| 回滚幂等检查 | ✅ | 仅当默认值非 `2` 时执行 MODIFY |
| 回滚恢复内容 | ✅ | `DEFAULT 2` + 原始注释 |
| 跨库兼容 | ✅ | 不使用 USE 语句，依赖 DATABASE() |
| 数据库备份方案 | ✅ | `mysqldump --single-transaction` |
| 回滚决策树 | ✅ | 见 `docs/crm-v1-go-live-runbook.md` §2.4 |

### 回滚执行（生产部署当天）

1. 执行 `node database/migrate.js --rollback 107`（或手动执行 _down.sql）
2. 验证 `approval_status` 默认值恢复为 `2`
3. 验证历史数据不受影响
4. 回滚应用代码到上一版本
5. 重启服务并验证

---

## 部署演练结论

| 维度 | 结果 |
|------|------|
| Migration Status | ✅ 105/105，107 已验证 |
| Service Startup | ✅ 后端 + 前端 + Docker 配置就绪 |
| Smoke Test | ✅ 16/16 PASS |
| Rollback Test | ✅ 方案就绪 |
| Security | ✅ 权限隔离验证通过 |
| **演练结果** | **✅ READY FOR DEPLOYMENT** |

> 本次为本地部署演练，验证了完整业务流程。生产部署当天需按 `docs/crm-v1-go-live-runbook.md` 在群晖 NAS 上执行实际部署。
