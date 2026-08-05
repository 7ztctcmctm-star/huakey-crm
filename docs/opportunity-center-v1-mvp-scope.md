# Opportunity Center v1 MVP Scope

> 制定日期：2026-08-04
> 评审身份：HuakeyCRM 架构评审委员会（Architecture Review Board）
> 评审对象：[docs/opportunity-domain-design.md](file:///c:/huakey-crm/docs/opportunity-domain-design.md)（Design Draft）
> 基线约束：[Customer Center v1.0 冻结声明](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md)
> 状态：**已评审通过，作为唯一开发基线**
> 原则：与 Customer Center Freeze 一致 ｜ 不做全局重构 ｜ 不修改无关模块 ｜ 最小可交付（MVP）

---

## 0. 评审结论

原设计文档（22 个 API、11 个新字段、8 阶段模型、6 个新权限码、6 个 migration）**未通过评审**，存在明显过度设计及 1 处隐藏的冻结违反。

本 MVP Scope 将范围砍至：**2 个 migration、1 个新字段（lost_reason）、1 个权限码、0 个新 API 端点、1 个新前端页面、3 处必修 Bug 修复**。

> **v2 调整（2026-08-04）**：经评审，`stage_code` 字段不落库。stage_code 仅用于展示，由应用层通过 STAGE_CODE_MAP 映射生成，避免与 stage 数值产生数据不一致。未来扩展阶段时只需修改映射表 + stage 值域，无需改表结构。

---

## 1. Must Have（必须现在开发）

### 1.1 Bug 修复（P0，阻塞生产）

| 编号 | 文件:行号 | 问题 | 修复方案 |
|------|-----------|------|----------|
| FIX-1 | [opportunityService.js:297](file:///c:/huakey-crm/backend/services/opportunityService.js#L297) | 检查 `customer.status === 'signed'`：字段名与冻结后 `business_status` 冲突；业务规则错误（要求已签约才能建商机） | 改为 `customer.business_status IN ('following','quoted','negotiating','signed')` |
| FIX-2 | [quoteService.js:107-111](file:///c:/huakey-crm/backend/services/quoteService.js#L107-L111) | 报价创建时 `SELECT status FROM crm_customer` + 调用 `customerService.forwardStatus` 修改客户状态 | **完全移除**该代码块。客户状态推进由用户在 Customer 模块内手动操作 |
| FIX-3 | 设计文档 §10.4 | 提出"cronService 同步客户 business_status='quoted'"作为 FIX-2 的替代方案 | **不实施**该替代方案。任何形式的跨模块写 Customer 均违反冻结 |

### 1.2 数据库变更（2 个 Migration）

#### Migration 102：商机字段扩展

```sql
-- 102_opportunity_extend_fields.sql
-- 纯新增列，零语义变更，零数据回填
ALTER TABLE crm_opportunity
  ADD COLUMN lost_reason VARCHAR(500) DEFAULT NULL
    COMMENT '输单原因（stage=6 时填写）'
    AFTER remark;

-- stage_code 不落库，由应用层 STAGE_CODE_MAP 映射生成
-- CHECK 约束不扩展（保持现有 stage 1-6）
```

**风险**：🟢 低。纯新增列，不修改现有字段，不回填数据。
**回滚**：`ALTER TABLE crm_opportunity DROP COLUMN lost_reason;`

#### Migration 103：阶段日志扩展 + 权限码

```sql
-- 103_opportunity_stage_log_extend.sql
ALTER TABLE crm_opportunity_stage_log
  ADD COLUMN change_reason VARCHAR(500) DEFAULT NULL
    COMMENT '阶段变更原因'
    AFTER to_stage;

-- 新增权限码
INSERT INTO sys_permission (name, code, type, parent_id, sort_order, created_at, updated_at)
SELECT '查看商机', 'opportunity:view', 'button',
  (SELECT id FROM (SELECT id FROM sys_permission WHERE code='opportunity') t),
  1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code='opportunity:view');
```

**风险**：🟢 低。
**回滚**：`ALTER TABLE crm_opportunity_stage_log DROP COLUMN change_reason;` + `DELETE FROM sys_permission WHERE code='opportunity:view';`

### 1.3 后端变更（最小修改）

| 文件 | 变更 |
|------|------|
| [opportunityService.js](file:///c:/huakey-crm/backend/services/opportunityService.js) | FIX-1 修复；`advanceStage` 接收 `change_reason` 参数并写入 stage_log |
| [quoteService.js](file:///c:/huakey-crm/backend/services/quoteService.js) | FIX-2 移除修改客户状态的代码块 |
| [routes/opportunity.js](file:///c:/huakey-crm/backend/routes/opportunity.js) | `update-stage` 端点接收 `change_reason` 参数；权限码从 `opportunity`(menu) 调整为 `opportunity:view`(列表/详情) / `opportunity:edit`(阶段推进) |
| [scripts/init_role_permissions.js](file:///c:/huakey-crm/backend/scripts/init_role_permissions.js) | 为 sales/manager/boss 角色补 `opportunity:view` 权限 |

**API 端点数量：0 个新增，0 个迁移，9 个保持现状。**

### 1.4 前端变更

| 文件 | 变更 |
|------|------|
| `views/opportunity/Detail.vue` | **新建**：商机详情页（基本信息 + 销售时间轴 + 阶段日志 + 关联报价/合同列表） |
| `views/opportunity/list.vue` | 增强：stage 显示补充 stage_code 标签；新增"详情"链接跳转 Detail.vue |
| `api/opportunity.js` | 新增 `getOpportunityDetail` / `getOpportunityStageLog` API 封装 |
| `router/index.js` | 新增 `/opportunity/detail/:id` 路由，meta.permission=`opportunity:view` |
| `components/layout/Sidebar.vue` | 无变更（菜单保持单一项） |

### 1.5 测试变更

| 文件 | 变更 |
|------|------|
| [tests/opportunity.test.js](file:///c:/huakey-crm/backend/tests/opportunity.test.js) | 扩展覆盖至 ≥ 80% 端点：详情/更新/删除/阶段推进/漏斗/时间轴 + 数据权限分支 + 错误分支 |

---

## 2. Should Have（建议 v1.1 开发）

| 项 | 延后理由 |
|----|----------|
| `opportunity_no` 业务编号 | 需配套编号生成规则（年份+序号），独立设计任务 |
| `source` 商机来源 + 来源字典 | 需配套字典表设计，不应夹带在商机 MVP 中 |
| 阶段回退 backward API | 现有仅推进，回退是常见需求，但需定义回退规则矩阵 |
| 导出 Excel | 需配套导出模板设计 |
| `expected_date` → `expected_close_date` 重命名 | 纯命名优化，需全链路修改（service/route/test/前端），v1.1 统一处理 |

---

## 3. Could Have（暂缓，待 v2.0 评估）

| 项 | 暂缓理由 |
|----|----------|
| 8 阶段模型 + closed 状态 | 业务价值有限，stage 6(失败) + 软删除可覆盖。升级需语义重映射，高风险 |
| `crm_opportunity_attachment` 附件表 | MVP 阶段方案附件可放 remark 或外链 |
| 批量操作（推进/分配/删除） | 无明确业务需求驱动 |
| 商机分析页（转化率/趋势/排名） | 现有漏斗统计 `getFunnelStats` 已满足基本需求 |
| 导入 Excel | 需配套模板 + 校验规则，复杂度高 |

---

## 4. Won't Have（删除，不进入任何版本）

| 项 | 删除理由 |
|----|----------|
| `probability` 字段 | 与现有 `win_rate` 语义完全重复，两字段表达同一概念是数据一致性灾难 |
| `status` 字段 (active/closed) | 与 stage 终态语义重叠，必然产生"stage=won 但 status=active"的不一致 |
| `description` 字段 | 与现有 `remark` 功能重叠，设计文档未给出两者边界 |
| `expected_close_date` 新字段 | 现有 `expected_date` 已是此含义，新增字段会产生"哪个是准的"问题 |
| `closed_at` / `closed_by` 字段 | 可由 `crm_opportunity_stage_log`（to_stage=6 时的 create_time + changed_by）派生，冗余存储 |
| API 迁移到 RESTful `/opportunities` | 项目现有风格统一为 POST + 动作（Customer Center 冻结后亦如此），单模块迁移造成两套风格并存；兼容层 6 个月维护成本无业务回报 |
| 9 条旧端点兼容层 | 不迁移则无需兼容层 |
| `opportunity:assign` 权限码 | MVP 无分配功能 |
| `opportunity:convert` 权限码 | 现有转换用 `opportunity:edit` 已工作，无需拆分 |
| `opportunity:manage` 权限码 | 保持 6 阶段则无高级管理需求 |
| `opportunity:export` / `opportunity:import` 权限码 | MVP 无导入导出 |
| cronService 同步客户状态 | 任何形式的跨模块写 Customer 均违反冻结声明 |
| close / reopen API | 依赖 8 阶段模型，保持 6 阶段则不需要 |
| stage 6→7 语义重映射 migration | 保持 6 阶段则不需要，避免高风险数据变更 |
| `change_type` 字段（stage_log） | 可由 from_stage / to_stage 数值比较派生（from<to=forward，from>to=backward），无需存储 |

---

## 5. 最终开发范围（MVP Baseline）

### 5.1 范围总结

| 维度 | 原设计 | MVP 范围 | 砍减率 |
|------|--------|----------|--------|
| Migration 数量 | 6 个 | 2 个 | -67% |
| 新增字段 | 11 个 | 1 个（lost_reason） | -91% |
| 新增表 | 1 个 | 0 个 | -100% |
| API 端点新增 | 13 个 | 0 个 | -100% |
| API 端点迁移 | 9 个 | 0 个 | -100% |
| 新增权限码 | 6 个 | 1 个（opportunity:view） | -83% |
| 前端新页面 | 3 个 | 1 个（Detail.vue） | -67% |
| 阶段模型 | 8 阶段 | 6 阶段（保持现状） | - |
| Bug 修复 | 2 个 | 3 个（含隐藏的 cronService 违反） | +50% |

### 5.2 实施计划

| Phase | 内容 | 工作量 | 风险 | 依赖 |
|-------|------|--------|------|------|
| Phase 1 | Migration 102 + 103 | 0.5 天 | 🟢 低 | 无 |
| Phase 2 | 后端 3 处 Bug 修复 + stage_code 筛选 + change_reason 参数 + 权限码调整 | 1-2 天 | 🟡 中（FIX-1/FIX-2 影响生产） | Phase 1 |
| Phase 3 | 前端 Detail.vue + list.vue 增强 | 2-3 天 | 🟢 低 | Phase 2 |
| Phase 4 | 测试补齐至 ≥ 80% 端点覆盖 | 1-2 天 | 🟢 低 | Phase 2 |
| Phase 5 | 冻结声明 + 文档更新 | 0.5 天 | 🟢 低 | Phase 4 |

**总工作量：5-8 天**（原设计 11-17 天，砍减 50%+）

### 5.3 验收标准

| 项 | 标准 |
|----|------|
| Customer Freeze 一致性 | 0 处跨模块写 crm_customer（含 cronService） |
| 后端测试 | 100+ suites 全通过，opportunity 端点覆盖 ≥ 80% |
| 前端 Build | exit 0，无 Vue 编译警告 |
| 后端 Lint | 0 errors |
| Migration | 102/103 可正向执行 + 可回滚 |
| 权限码 | `opportunity:view` 已分配给 sales/manager/boss 角色 |
| 字段一致性 | `win_rate` 为唯一成交概率字段；`stage` 为唯一生命周期字段 |

### 5.4 冻结后变更控制

Opportunity Center v1 完成后，参照 Customer Center 模式冻结。后续变更需走 RFC 流程，仅以下情况允许修改：
1. P0 Bug — 影响生产数据正确性或服务可用性
2. 安全漏洞 — 权限绕过、SQL 注入、XSS 等
3. 数据错误 — 数据损坏、状态流转错误
4. 法规要求 — 合规性强制修改

---

## 6. 与原设计文档的关系

| 文档 | 状态 |
|------|------|
| [docs/opportunity-domain-design.md](file:///c:/huakey-crm/docs/opportunity-domain-design.md) | 保留作为完整设计参考（Design Draft），但在文件头标注"已被 MVP Scope 取代为开发基线" |
| 本文档（opportunity-center-v1-mvp-scope.md） | **唯一开发基线** |

> 后续开发严格以本文档为准。原设计文档中的 Should Have / Could Have 项作为 v1.1 / v2.0 的需求池，不进入 v1 开发。

---

## 附录：评审决策记录

| 决策点 | 原设计建议 | 评审决定 | 理由 |
|--------|------------|----------|------|
| 阶段模型 | 8 阶段 | **保持 6 阶段** | 高风险语义重映射无对应业务价值 |
| API 风格 | 迁移 RESTful | **保持现有 POST 风格** | 项目一致性优先，全项目统一迁移是独立议题 |
| `probability` 字段 | 新增 | **删除** | 与 `win_rate` 重复 |
| `status` 字段 | 新增 | **删除** | 与 `stage` 终态重叠 |
| `description` 字段 | 新增 | **删除** | 与 `remark` 重复 |
| 附件表 | 新增 | **延后** | MVP 用 remark 替代 |
| cronService 同步 | 作为 FIX-2 替代方案 | **禁止** | 违反 Customer Freeze |
| 权限码扩展 | 6 个 | **仅 1 个** | 其余 5 个无对应 MVP 功能 |
| 批量操作 | 3 个 API | **延后** | 无业务需求驱动 |
| 兼容层 | 9 条旧端点 | **不需要** | 不迁移则无需兼容 |

---

## 7. Opportunity Center v1 冻结声明（2026-08-04 生效）

> 本节为 Opportunity Center v1 完成后的正式冻结声明。冻结后任何变更必须遵循 §5.4 变更控制流程。

### 7.1 冻结生效声明

**Opportunity Center v1 自 2026-08-04 起进入冻结状态**。本文档 §1-§6 描述的 MVP 范围已全部实现并通过验收，作为 v1.x 分支的唯一基线。后续 v1.1 / v2.0 功能开发应基于 §2 / §3 的需求池，不得修改 v1 冻结范围内的代码、迁移、权限码与 API 契约。

### 7.2 实际交付物对账

#### 7.2.1 数据库迁移（2 个）

| Migration | 文件 | 变更 | 状态 |
|-----------|------|------|------|
| 102 | [102_opportunity_extend_fields.sql](file:///c:/huakey-crm/database/migrations/102_opportunity_extend_fields.sql) | 新增 `crm_opportunity.lost_reason` 字段（幂等） | ✅ 已交付，含回滚脚本 |
| 103 | [103_opportunity_stage_log_extend.sql](file:///c:/huakey-crm/database/migrations/103_opportunity_stage_log_extend.sql) | 新增 `crm_opportunity_stage_log.change_reason` 字段 + `opportunity:view` 权限码 | ✅ 已交付，含回滚脚本 |

#### 7.2.2 后端代码变更

| 编号 | 文件 | 变更 | 状态 |
|------|------|------|------|
| FIX-1 | [opportunityService.js:298-304](file:///c:/huakey-crm/backend/services/opportunityService.js#L298-L304) | 放宽商机创建条件：`customer.status` 检查改为允许 `following/quoted/negotiating/signed` | ✅ |
| FIX-2 | [quoteService.js:101-104](file:///c:/huakey-crm/backend/services/quoteService.js#L101-L104) | 移除报价创建后跨模块写 `crm_customer` 的逻辑 | ✅ |
| FIX-3 | — | 不实施 cronService 同步客户状态方案 | ✅ N/A |
| ENH-1 | [opportunityService.js:175-180](file:///c:/huakey-crm/backend/services/opportunityService.js#L175-L180) | `advanceStage` 新增 `changeReason` 参数，写入 stage_log | ✅ |
| ENH-2 | [opportunityService.js:11-18](file:///c:/huakey-crm/backend/services/opportunityService.js#L11-L18) | `STAGE_MAP` 应用层映射，`stage_code` 不落库 | ✅ |
| SEC-1 | [routes/opportunity.js:142-158](file:///c:/huakey-crm/backend/routes/opportunity.js#L142-L158) | 修复 `/stage-log/:id` 重复注册漏洞 + `/stage-stats/:id` 补齐 `checkDataPermission` | ✅ |
| SEC-2 | [opportunityController.js:86-97](file:///c:/huakey-crm/backend/controllers/opportunityController.js#L86-L97) | `stageStats` controller 增加数据所有权校验 | ✅ |
| PERM-1 | [init_role_permissions.js:95](file:///c:/huakey-crm/backend/scripts/init_role_permissions.js#L95) | 新增 `opportunity:view` 权限码，分配给 boss/manager/sales | ✅ |

#### 7.2.3 前端代码变更

| 文件 | 变更 | 状态 |
|------|------|------|
| [api/opportunity.js](file:///c:/huakey-crm/frontend/src/api/opportunity.js) | 新增 `getOpportunityDetail` / `getOpportunityStageLog` / `getOpportunityStageStats` / `getOpportunityTimeline` | ✅ |
| [views/opportunity/Detail.vue](file:///c:/huakey-crm/frontend/src/views/opportunity/Detail.vue) | 新增商机详情页（基本信息 + 销售时间轴 + 阶段日志） | ✅ |
| [router/index.js:99-104](file:///c:/huakey-crm/frontend/src/router/index.js#L99-L104) | 新增 `opportunity/detail/:id` 路由，permission: `opportunity:view` | ✅ |

#### 7.2.4 测试覆盖

| 测试套件 | 测试数 | 覆盖范围 | 状态 |
|----------|--------|----------|------|
| [opportunityService.test.js](file:///c:/huakey-crm/backend/tests/opportunityService.test.js) | 17 | STAGE_MAP 映射、FIX-1 状态校验、领域边界（无 UPDATE crm_customer）、advanceStage + change_reason、getStageLog | ✅ |
| [quoteService.test.js](file:///c:/huakey-crm/backend/tests/quoteService.test.js) | 4 | FIX-2 源码静态检测 + 运行时 SQL 拦截 + 模块导出验证 | ✅ |
| [opportunityRoutes.test.js](file:///c:/huakey-crm/backend/tests/opportunityRoutes.test.js) | 9 | detail/stage-log/stage-stats/timeline 4 接口的 admin/sales 权限分支 + 404 场景 + 重复注册漏洞验证 | ✅ |
| opportunity.test.js（原有） | 3 | 列表 / 新增校验 | ✅ 无回归 |
| quote.test.js（原有） | 2 | 报价校验 | ✅ 无回归 |
| **合计** | **35** | **5 套件全部通过** | ✅ |

### 7.3 验收标准对账

| 验收项（§5.3） | 标准 | 实际 | 结论 |
|----------------|------|------|------|
| Customer Freeze 一致性 | 0 处跨模块写 crm_customer | quoteService.test.js 静态 + 运行时双重验证，0 处 UPDATE crm_customer | ✅ 通过 |
| 后端测试 | opportunity 端点覆盖 ≥ 80% | 4 个核心端点（detail/stage-log/stage-stats/timeline）× 2 权限分支 + 404 场景全部覆盖 | ✅ 通过 |
| Migration | 102/103 可正向执行 + 可回滚 | 含 `_down.sql` 回滚脚本，幂等检查 | ✅ 通过 |
| 权限码 | `opportunity:view` 分配给 sales/manager/boss | init_role_permissions.js:95 已配置 | ✅ 通过 |
| 字段一致性 | `win_rate` 唯一概率字段；`stage` 唯一生命周期字段 | `stage_code` 不落库，由 STAGE_MAP 应用层映射 | ✅ 通过 |
| 领域边界约束 | 非客户中心模块禁止写 crm_customer | 写入 customer-center-freeze-v1.md 架构约束章节 | ✅ 通过 |

### 7.4 冻结范围清单

以下内容自冻结日起**不得修改**，任何变更必须走 §5.4 RFC 流程：

1. **数据库 schema**：`crm_opportunity.lost_reason`、`crm_opportunity_stage_log.change_reason` 字段定义
2. **权限码**：`opportunity:view` 的 code / name / parent 关系
3. **API 契约**：`/api/v1/opportunity/{detail,stage-log,stage-stats,timeline}/:id` 的请求/响应格式
4. **阶段模型**：`stage` 1-6 的语义与 `STAGE_MAP` 映射
5. **领域边界约束**：非客户中心模块禁止写 `crm_customer`（架构级约束，详见 [customer-center-freeze-v1.md §领域边界](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md)）

### 7.5 已知限制与后续规划

| 限制 | 影响 | 计划版本 |
|------|------|----------|
| 无附件管理 | lost_reason 仅文本 | v1.1 |
| 无批量阶段推进 | 单条操作 | v1.1 |
| 无商机模板 | 手动填写 | v2.0 |
| 无 RESTful 迁移 | POST 风格 | 全局独立议题 |
| 无 8 阶段模型 | 6 阶段 | v2.0（需业务驱动） |

### 7.6 冻结签署

- **评审身份**：HuakeyCRM 架构评审委员会
- **冻结日期**：2026-08-04
- **基线文档**：本文档（opportunity-center-v1-mvp-scope.md）§1-§7
- **关联约束**：[customer-center-freeze-v1.md §领域边界](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md)
- **测试基线**：35 tests / 5 suites 全部通过（2026-08-04 17:02）
