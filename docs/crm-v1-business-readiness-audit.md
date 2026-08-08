# HuakeyCRM v1.0 Business Readiness Audit

> **审计类型**: Production Business Readiness Audit
> **审计日期**: 2026-08-06
> **审计人**: Production Readiness Engineer
> **审计方式**: 只读审计（未修改任何数据）
> **系统版本**: HuakeyCRM v1.0 (backend v1.5.0)

---

## 1. 当前生产状态

| 项目 | 状态 |
|------|------|
| 部署环境 | 群晖 NAS DSM 7.x + Docker |
| Backend | Express 4.22.2 |
| Database | MySQL 8.0.46 |
| Redis | 已启用 |
| CRM Core v1 | 已冻结 |
| Customer Center v1.0 | 已冻结 |
| RBAC | 已通过验收 |
| HTTPS | https://crm.huakey.local |
| 容器状态 | 4 个容器全部 healthy |
| 生产验收 | READY FOR BUSINESS USE |

---

## 2. 模板数据检查结果

### 2.1 检查结论

**未发现模板用户，不存在重复创建风险。** 系统中的 22 个用户均为真实业务用户。

### 2.2 用户审计

| 检查项 | 结果 |
|--------|------|
| 用户总数 | 22 |
| 激活用户 | 22 (100%) |
| 待改密用户 | 0 |
| 模板/演示用户 (demo/template/test/seed) | **0（不存在）** |
| is_demo 标记用户 | 0 |

**用户清单**:

| 角色 | 用户数 | 用户名 |
|------|--------|--------|
| boss | 2 | admin, lvcongming |
| manager | 3 | Rin, zhufuchun, chendenghui |
| sales | 10 | Ken, Justin, Leslie, likang, Henny, huangzhizheng, lianghailin, vivianli, eugene, hechengqi |
| hr | 1 | hejingwen |
| purchase | 4 | xieyongjiang, xieyuping, chenhongyou, heziwen |
| finance | 2 | huanglvfeng, taoting |

### 2.3 各业务表数据量

| 业务表 | 记录数 | 是否模板数据 | 说明 |
|--------|--------|-------------|------|
| sys_user | 22 | NO | 真实业务用户 |
| crm_customer | 422 (活跃) | NO (is_demo=0) | 真实业务客户，2026-05 批量导入 |
| crm_contact | 835 | NO | 真实联系人，关联 418 个客户 |
| crm_opportunity | 0 | - | 无数据 |
| crm_quote | 0 | - | 无数据 |
| crm_contract | 0 | - | 无数据 |
| crm_follow_up | 0 | - | 无数据 |
| crm_approval_workflow | 2 | 配置数据 | 报价审批 + 采购审批工作流 |
| crm_approval_step | 2 | 配置数据 | 各 1 个审批步骤（manager 审批） |
| crm_approval_record | 0 | - | 无审批记录 |
| crm_pool_log | 407 | 日志数据 | 公海池操作日志 |
| crm_product | 10 | 配置数据 | UPS/PDU 产品 |
| crm_supplier | 3 | 配置数据 | 供应商 |

### 2.4 是否存在完整业务链路

**不存在完整业务链路。** 当前仅客户和联系人环节有数据，商机→报价→合同→跟进→审批环节均无数据。

```
客户 (422) → 联系人 (835) → 跟进 (0) → 商机 (0) → 报价 (0) → 合同 (0) → 审批 (0)
  ✓ 有数据    ✓ 有数据      ✗ 无数据    ✗ 无数据    ✗ 无数据    ✗ 无数据    ✗ 无数据
```

---

## 3. 客户 owner_id 问题分析

### 3.1 问题概述

| 检查项 | 结果 |
|--------|------|
| 活跃客户总数 | 422 |
| owner_id = NULL 数量 | **422 (100%)** |
| owner_id 非 NULL 数量 | 0 |

**所有 422 条活跃客户的 owner_id 均为 NULL。**

### 3.2 根因分析

通过 `crm_pool_log` 公海池日志追踪到根因：

| 时间 | 事件 | 数量 | 说明 |
|------|------|------|------|
| 2026-05-16 | 客户批量导入 | 422 | 全部客户一次性导入 |
| 2026-05-18~21 | 手动释放 | 6 | 少量客户手动释放到公海池 |
| 2026-07-08 | **自动释放 (auto_release)** | **400** | 公海池自动释放机制批量触发 |

**根因**: 2026-07-08 公海池自动释放机制触发，将 400 条客户的 owner_id 置为 NULL（auto_release）。

### 3.3 原始归属还原

从 `crm_pool_log` 的 `from_user_id` 可还原客户原始分配：

| 原始归属用户 | 角色 | 客户数 |
|-------------|------|--------|
| user_id=1 (admin) | boss | 383 |
| user_id=19 (Justin) | sales | 11 |
| user_id=21 (likang) | sales | 10 |
| user_id=41 (hechengqi) | sales | 1 |
| NULL | - | 1 |

### 3.4 客户当前状态分布

| 字段 | 值 | 数量 |
|------|-----|------|
| status | lead | 422 |
| business_status | lead | 422 |
| lifecycle_status | new | 422 |
| pool_status | private | 422 |
| pool_type | public | 422 |

**注意**: `pool_status=private` 与 `pool_type=public` 存在矛盾，可能是公海池释放后状态未完全同步。

### 3.5 RBAC 影响分析

检查 `backend/middleware/permission.js` 中 `buildDataPermissionWhere` 逻辑：

| 角色 | 权限类型 | SQL 条件 | owner_id=NULL 客户可见性 |
|------|----------|----------|--------------------------|
| boss | all (view_all=1) | `1=1` | **可见（全部 422 条）** |
| manager | dept | `owner_id IN (部门用户) OR owner_id IS NULL` | **可见（含 NULL）** |
| sales | self | `owner_id = ? OR (owner_id IS NULL AND status IN ('lead', 'sea'))` | **可见（status='lead' 满足条件）** |

**关键结论**: RBAC 中间件已考虑 owner_id=NULL 的情况。由于所有客户 status='lead'，sales 角色通过公海池机制仍可看到这些客户。**P1 问题影响实际被 RBAC 机制缓解，不阻塞业务使用。**

### 3.6 方案比较

#### 方案 A: 全部分配给 boss

| 维度 | 分析 |
|------|------|
| RBAC 影响 | boss 已通过 view_all=1 看到全部，无变化 |
| 业务影响 | 销售无法认领客户（已有归属），需 boss 再分配 |
| 数据一致性 | 恢复了 383 条原始归属（admin），但其余 39 条不符 |
| 推荐度 | ⭐⭐ 不推荐 |

#### 方案 B: 全部进入公海池

| 维度 | 分析 |
|------|------|
| RBAC 影响 | 当前状态已等价（owner_id=NULL + status='lead' 可被 sales 看到） |
| 业务影响 | 销售可主动认领，符合公海池设计 |
| 数据一致性 | 需修正 pool_status 为 public（与 pool_type 一致） |
| 推荐度 | ⭐⭐⭐⭐ 推荐（当前状态的正式化） |

#### 方案 C: 按公海池日志还原原始归属

| 维度 | 分析 |
|------|------|
| RBAC 影响 | 恢复历史分配，销售看到自己的客户 |
| 业务影响 | 383 条归 admin(boss)，销售仅得 22 条，分配不均 |
| 数据一致性 | 还原到 2026-07-08 之前的状态 |
| 推荐度 | ⭐⭐⭐ 可选（如需恢复历史归属） |

#### 方案 D: 保持 NULL

| 维度 | 分析 |
|------|------|
| RBAC 影响 | 已被中间件缓解，不影响业务 |
| 业务影响 | 客户处于公海池状态，销售可认领 |
| 数据一致性 | pool_status/private 与 pool_type/public 矛盾需关注 |
| 推荐度 | ⭐⭐⭐⭐⭐ 推荐（当前状态可正常运行） |

### 3.7 推荐方案

**推荐方案 B + D 结合**：保持当前 owner_id=NULL 状态（方案 D），同时修正 pool_status 为 public 使其与 pool_type 一致（方案 B 的状态正式化）。

理由：
1. RBAC 中间件已处理 NULL 情况，不影响业务
2. 客户处于公海池状态符合 CRM 设计（销售可认领）
3. 无需批量修改 owner_id，降低数据操作风险
4. 仅需修正 pool_status 字段一致性（如需）

**注意**: 此方案仅为建议，不直接执行。需业务确认后操作。

---

## 4. 业务链路验证结果

### 4.1 数据存在性

| 环节 | 表 | 数据量 | 状态 |
|------|-----|--------|------|
| 客户 | crm_customer | 422 | ✓ 有数据 |
| 联系人 | crm_contact | 835 | ✓ 有数据 |
| 跟进记录 | crm_follow_up | 0 | ✗ 无数据 |
| 商机 | crm_opportunity | 0 | ✗ 无数据 |
| 报价 | crm_quote | 0 | ✗ 无数据 |
| 合同 | crm_contract | 0 | ✗ 无数据 |
| 审批记录 | crm_approval_record | 0 | ✗ 无数据 |

### 4.2 API 端点可达性

| 业务模块 | API 路径 | 响应 | 状态 |
|----------|----------|------|------|
| 认证 | /api/v1/auth/captcha | 200 | PASS |
| 健康检查 | /api/v1/health | 200 | PASS |
| 采购管理 | /api/v1/purchase | 401 | PASS (需认证) |
| 通知管理 | /api/v1/notification | 401 | PASS (需认证) |

### 4.3 前端页面可达性

| 页面 | 路由 | 响应 | 状态 |
|------|------|------|------|
| 首页 | / | 200 | PASS |
| 登录 | /login | 200 | PASS |
| 仪表盘 | /dashboard | 200 | PASS |
| 客户中心 | /customers | 200 | PASS |
| 商机中心 | /opportunity | 200 | PASS |
| 报价中心 | /quote | 200 | PASS |
| 合同中心 | /contract | 200 | PASS |
| 审批中心 | /approval | 200 | PASS |
| 跟进管理 | /follow-up | 200 | PASS |

### 4.4 业务链路断点

```
客户 (422)  →  联系人 (835)  →  跟进 (0)  →  商机 (0)  →  报价 (0)  →  合同 (0)  →  审批 (0)
  ✓ OK          ✓ OK             ✗ 断点       ✗ 断点       ✗ 断点       ✗ 断点       ✗ 断点
```

| 断点 | 影响 | 建议 |
|------|------|------|
| 跟进记录 = 0 | 无法追踪客户跟进历史 | 业务团队录入跟进记录 |
| 商机 = 0 | 无法推进销售漏斗 | 从客户转化商机 |
| 报价 = 0 | 无法生成报价单 | 从商机创建报价 |
| 合同 = 0 | 无法签订合同 | 从报价转合同 |
| 审批记录 = 0 | 无法验证审批流程 | 工作流已配置，待触发 |

### 4.5 审批工作流配置验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 报价审批工作流 | 已定义 (id=1, type=quote) | PASS |
| 采购审批工作流 | 已定义 (id=2, type=purchase) | PASS |
| 审批步骤 | 各 1 步 (manager 审批) | PASS |
| 审批步骤状态 | is_required=1 | PASS |

---

## 5. RBAC 验证结果

### 5.1 角色权限配置

| 角色 | view_all | manage_all | 权限数 | 用户数 |
|------|----------|------------|--------|--------|
| boss | 1 | 1 | 92 | 2 |
| manager | 0 | 0 | 78 | 3 |
| sales | 0 | 0 | 47 | 10 |
| hr | 0 | 0 | 15 | 1 |
| purchase | 0 | 0 | 22 | 4 |
| finance | 0 | 0 | 19 | 2 |
| engineer | 0 | 0 | 14 | 0 |

### 5.2 数据权限中间件验证

| 角色 | 权限类型 | owner_id=NULL 可见性 | 状态 |
|------|----------|---------------------|------|
| boss | all (1=1) | 可见全部 | PASS |
| manager | dept (含 NULL) | 可见 | PASS |
| sales | self (含 NULL+lead) | 可见 (status='lead') | PASS |

### 5.3 权限边界验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| authenticateToken 中间件 | 所有受保护路由已挂载 | PASS |
| checkPermission 中间件 | 敏感接口已挂载 | PASS |
| checkDataPermission 中间件 | 客户列表/详情已挂载 | PASS |
| owner_id=NULL 处理 | 中间件已处理（公海池设计） | PASS |

---

## 6. 上线风险

### 6.1 风险等级矩阵

| 风险 | 等级 | 影响 | 缓解状态 |
|------|------|------|----------|
| 客户 owner_id=NULL (422条) | LOW | RBAC 中间件已缓解 | ✓ 已缓解 |
| pool_status/private 与 pool_type/public 矛盾 | LOW | 可能影响公海池筛选 | 待确认 |
| 商机/报价/合同/跟进 = 0 | MEDIUM | 业务链路不完整 | 待业务录入 |
| 公海池自动释放机制可能再次触发 | MEDIUM | 新分配客户可能再次被释放 | 需检查释放规则 |
| 无审批记录验证 | LOW | 工作流已配置但未实测 | 待业务触发 |

### 6.2 公海池自动释放风险

**风险**: 2026-07-08 的 auto_release 事件表明公海池自动释放机制已触发。如不调整释放规则，新分配客户的 owner_id 可能再次被置为 NULL。

**建议**: 检查公海池自动释放的触发条件（如 N 天未跟进则释放），根据业务需求调整参数。

---

## 7. 建议执行顺序

### 7.1 立即可执行（不阻塞业务）

1. **保持当前 owner_id=NULL 状态** — RBAC 已缓解，不阻塞业务
2. **业务团队开始录入跟进记录** — 从 422 条客户中选取重点客户跟进
3. **业务团队创建商机** — 从有跟进的客户转化商机
4. **业务团队创建报价** — 从商机生成报价
5. **业务团队创建合同** — 从报价转合同
6. **触发审批流程** — 验证审批工作流端到端

### 7.2 需确认后执行

| 序号 | 事项 | 风险 | 需确认方 |
|------|------|------|----------|
| 1 | 修正 pool_status 与 pool_type 一致性 | LOW | 业务负责人 |
| 2 | 调整公海池自动释放规则 | MEDIUM | 业务负责人 + 技术 |
| 3 | 是否还原客户原始归属（方案 C） | MEDIUM | 业务负责人 |
| 4 | 是否将客户正式纳入公海池（方案 B） | LOW | 业务负责人 |

### 7.3 不建议执行

- 批量修改 owner_id（方案 A/C）：存在数据操作风险，且当前 RBAC 已缓解
- 创建模板/演示数据：系统中无模板数据，无需创建

---

## 8. 审计结论

### 8.1 总体评估

| 维度 | 结论 |
|------|------|
| 模板数据 | 不存在模板用户，22 个真实业务用户 |
| 客户数据 | 422 条真实业务客户，owner_id=NULL 由公海池自动释放导致 |
| RBAC | 中间件已处理 owner_id=NULL，不影响业务 |
| 业务链路 | 客户+联系人有数据，后续环节待业务录入 |
| 审批工作流 | 已配置 2 个工作流，待触发验证 |
| 上线风险 | LOW — 不阻塞业务使用 |

### 8.2 最终结论

```
==========================================
HuakeyCRM v1.0 Business Readiness Audit
==========================================

模板数据检查:    PASS (无重复创建风险)
客户 owner 问题:  LOW (RBAC 已缓解)
业务链路:        PARTIAL (客户有数据，后续待录入)
RBAC:           PASS
审批工作流:      CONFIGURED (待触发)

Business Readiness: READY
(P1 问题已被 RBAC 机制缓解，不阻塞业务)
==========================================
```

---

## 9. 约束遵守

- [x] 未修改数据库结构
- [x] 未新增 migration
- [x] 未修改冻结模块
- [x] 未重构代码
- [x] 未创建重复模板数据
- [x] 未执行批量数据修改
- [x] 所有修改方案均为建议，等待确认
- [x] 全程只读审计

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-final-production-acceptance-report.md](./crm-v1-final-production-acceptance-report.md) | 最终生产验收报告 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |
| [crm-v1-internal-domain-deployment.md](./crm-v1-internal-domain-deployment.md) | 内网域名部署 |
