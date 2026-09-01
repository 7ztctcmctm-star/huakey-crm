# HuakeyCRM Core v1 UAT Plan

> **文档类型**: 用户验收测试方案
> **版本**: Core v1（冻结基线）
> **编制日期**: 2026-08-06
> **编制人**: 产品负责人 + QA 负责人
> **冻结基线**: [crm-v1-freeze-decision.md](crm-v1-freeze-decision.md)（2026-08-04 冻结）

---

## 1. 目标与范围

### 1.1 目标

验证 HuakeyCRM Core v1 在**真实销售业务流程**下是否可用，确认系统能否交付给真实业务人员使用。

- **不修改**核心架构与冻结模块（Customer / Opportunity / Quote / Contract）。
- **不新增**业务模块。
- 重点验证：完整销售闭环（客户 → 商机 → 报价 → 合同）在三个角色下的真实可用性。

### 1.2 范围

| 范围 | 说明 |
|------|------|
| ✅ 包含 | Customer / Opportunity / Quote / Contract 四模块的端到端业务流、三角色权限边界、UI 可用性、生产就绪检查 |
| ❌ 排除 | Dashboard / BI / 工作流引擎 / AI 助手 / 采购 / HR 等非冻结模块（详见 freeze-decision §3 Excluded Modules） |
| ❌ 排除 | 性能压测（已有 k6 方案，独立执行）、安全渗透（已在 FINAL_ACCEPTANCE_REPORT Phase 9 完成） |

### 1.3 冻结基线（验收起点）

| 验证项 | 结果 |
|--------|------|
| Test Suites | 11 passed |
| Tests | 118 passed |
| Build | Exit 0 |
| Lint | 0 errors |
| Migration | 106/106 + rollback verified |
| FK | 9/9 |
| Cross Module Violation | 0 |
| RBAC 越权 | 0 |

---

## 2. 测试角色

依据 `backend/config/roles.js` 的 ROLE_CODES 与冻结审计 RBAC 矩阵，定义三个 UAT 角色：

| 角色 | role_code | 数据范围 | 业务定位 | UAT 账号 |
|------|-----------|----------|----------|----------|
| **Boss**（老板） | `boss` | `all`（全部数据） | 经营决策，查看全局数据与经营指标 | `uat_boss` |
| **Manager**（部门经理） | `admin` | `dept_and_sub`（本部门及下属） | 团队管理，审批合同，查看团队数据 | `uat_manager` |
| **Sales**（销售） | `sales` | `self`（仅本人） | 一线销售，创建客户/商机/报价/合同 | `uat_sales` |

### 2.1 权限矩阵（冻结审计基线）

| 操作 | boss | manager | sales |
|------|------|---------|-------|
| Customer:view | ✅ all | ✅ dept_and_sub | ✅ self |
| Customer:add/edit/delete | ✅ | ✅ | ✅ |
| Opportunity:view | ✅ all | ✅ dept_and_sub | ✅ self |
| Opportunity:add/edit | ✅ | ✅ | ✅ |
| Quote:view | ✅ all | ✅ dept_and_sub | ✅ self |
| Quote:add/edit | ✅ | ✅ | ✅ |
| Contract:view | ✅ all | ✅ dept_and_sub | ✅ self |
| Contract:add/edit | ✅ | ✅ | ✅ |
| **Contract:approve**（审批） | ✅ | ✅ | ❌ |

> 关键边界：sales **不能审批合同**（`requireAdmin` 中间件拦截），sales **数据范围=self**（无法查看/修改他人数据）。

---

## 3. 测试业务场景

**场景**: 制造业销售（汽车零部件自动化生产线项目）

- **我方公司**：汽车零部件自动化装备制造企业（CRM 部署方）
- **客户**：A 汽车灯具有限公司
- **商机**：自动化生产线项目，金额 300万–800万
- **阶段链**：需求确认 → 方案报价 → 商务谈判 → 成交
- **报价**：设备报价单（含设备清单）
- **合同**：销售合同（含付款条款）

详细测试数据见 [uat-demo-data.md](uat-demo-data.md)。

---

## 4. 测试用例设计

### 4.1 业务流程测试（端到端）

| 用例 ID | 角色 | 流程 | 验证点 |
|---------|------|------|--------|
| BF-S-01 | Sales | 创建客户 | 客户创建成功，owner_id=当前 sales，status=lead/following |
| BF-S-02 | Sales | 添加联系人 | 联系人关联 customer_id 正确 |
| BF-S-03 | Sales | 创建商机 | 商机关联 customer_id，生成 opportunity_no（OPP-YYMMDD-NNN） |
| BF-S-04 | Sales | 填写金额/预计成交日/阶段 | expected_amount DECIMAL(15,2)，stage=2(需求确认) |
| BF-S-05 | Sales | 推进商机阶段 | stage_log 写入 change_reason，win_rate 联动更新 |
| BF-S-06 | Sales | 创建报价 | 报价关联 opportunity_id + customer_id 一致性校验，生成 quote_no |
| BF-S-07 | Sales | 报价提交审批 | approval_status 流转 |
| BF-S-08 | Sales | 报价转合同 / 提交合同 | contract 关联 quote_id + opportunity_id，approval_status=0 |
| BF-M-01 | Manager | 查看团队数据 | dataScope=dept_and_sub，可见下属 sales 数据 |
| BF-M-02 | Manager | 审批合同 | approve 接口成功，approval_status=2 |
| BF-M-03 | Manager | 不能修改其他部门数据 | 跨部门数据不可见 |
| BF-B-01 | Boss | 查看全部数据 | dataScope=all，可见所有客户/商机/合同 |
| BF-B-02 | Boss | 查看经营数据 | 销售漏斗 / 商机统计 / 合同金额汇总 |

### 4.2 权限边界测试（负向）

| 用例 ID | 角色 | 操作 | 预期 |
|---------|------|------|------|
| RBAC-01 | Sales | 查看他人商机 | 404（dataScope=self 过滤后为空） |
| RBAC-02 | Sales | 推进他人商机 | 403 |
| RBAC-03 | Sales | 审批合同 | 403（requireAdmin 拦截） |
| RBAC-04 | Sales B | 查看 Sales A 的客户 | 不可见 |
| RBAC-05 | Manager | 审批合同 | 200（manageAll=true） |

### 4.3 数据一致性测试

| 用例 ID | 验证点 |
|---------|--------|
| DC-01 | 报价 opportunity_id 与 customer_id 不匹配时拒绝（400 "不匹配"） |
| DC-02 | 商机推进不触发 UPDATE crm_customer（领域边界） |
| DC-03 | 报价创建不触发 UPDATE crm_customer（领域边界） |
| DC-04 | 已成交商机(stage=5)不可回退（400 "成交"） |
| DC-05 | 时间轴聚合 stage_log + quote + contract 事件 |

### 4.4 UI 可用性检查（人工）

| 模块 | 检查项 |
|------|--------|
| Customer | 新增是否顺畅 / 搜索是否正常 / 详情信息是否完整 |
| Opportunity | 阶段推进是否清晰 / 详情页信息是否足够 |
| Quote | 报价流程是否容易理解 |
| Contract | 审批流程是否符合习惯 |

详细记录见 [crm-core-v1-ui-review.md](crm-core-v1-ui-review.md)。

---

## 5. 测试执行方式

| 类型 | 方式 | 证据来源 |
|------|------|----------|
| 自动化业务流 | 现有 e2e 测试 | `backend/tests/e2e/opportunity-flow.spec.js`、`contract-flow.spec.js`、`rbac-business-flow.spec.js`（已通过） |
| 手动业务流 | 按 UAT 测试数据逐步操作 | UAT 测试账号 + 演示数据 |
| UI 可用性 | 浏览器人工走查 | 检查清单 + 问题描述 |
| 生产就绪 | 检查清单核对 | [crm-production-readiness-checklist.md](crm-production-readiness-checklist.md) |

### 5.1 自动化测试证据（冻结基线已通过）

| 测试文件 | 覆盖范围 | 结果 |
|----------|----------|------|
| `opportunity-flow.spec.js` | 完整业务流（创建商机→推进→报价）、数据隔离、详情/时间轴、阶段约束、跨模块写禁止 | ✅ 全通过 |
| `contract-flow.spec.js` | 合同创建/审批/回款流程 | ✅ 全通过 |
| `rbac-business-flow.spec.js` | sales 创建/越权/数据隔离、manager 审批 | ✅ 全通过 |

### 5.2 手动测试环境

- **环境**: UAT 测试库（独立于生产）
- **数据**: 加载 [uat-demo-data.md](uat-demo-data.md) 演示数据
- **账号**: uat_boss / uat_manager / uat_sales（首次登录强制改密）

---

## 6. 缺陷分级与处理规则

| 等级 | 定义 | 处理方式 |
|------|------|----------|
| **P0** | 阻断核心业务流 / 数据损坏 / 权限绕过 | v1 内**必须修复** |
| **P1** | 严重影响使用 / 关键功能异常 | v1 内**必须修复** |
| **P2** | 体验问题 / 非关键功能缺陷 | 记录到 **v1.1 backlog** |
| **P3** | 优化建议 / 锦上添花 | 记录到 **v1.1 backlog** |

> 冻结模块修改规则：仅 P0/P1 允许修复，且须走 RFC 流程（freeze-decision §5.2）。P2/P3 一律记入 v1.1 backlog，不在 v1 内改动冻结代码。

---

## 7. 验收标准（PASS / FAIL）

### 7.1 PASS 条件（全部满足）

1. 所有 P0 / P1 缺陷已修复并验证
2. 端到端业务流（Sales/Manager/Boss 三角色）全部通过
3. 权限边界测试全部通过（无越权）
4. 数据一致性测试全部通过
5. 生产就绪检查清单全部 ✅
6. UI 无 P0/P1 可用性问题

### 7.2 FAIL 条件（任一触发）

- 存在未修复的 P0 缺陷
- 核心业务流阻断
- 权限绕过漏洞
- 生产环境存在未闭环的 P0 阻塞项

---

## 8. 交付物清单

| # | 文档 | 说明 |
|---|------|------|
| 1 | `crm-core-v1-uat-plan.md` | 本文档（测试方案） |
| 2 | `uat-demo-data.md` | 标准测试数据 |
| 3 | `crm-core-v1-ui-review.md` | UI 可用性检查记录 |
| 4 | `crm-production-readiness-checklist.md` | 生产就绪检查清单 |
| 5 | `crm-core-v1-uat-report.md` | 最终 UAT 报告（PASS/FAIL 决策） |

---

## 9. 时间安排

| 阶段 | 内容 |
|------|------|
| 准备 | 加载 UAT 演示数据、创建测试账号 |
| 执行 | 三角色业务流 + UI 走查 + 生产就绪核对 |
| 修复 | P0/P1 缺陷修复（如需） |
| 报告 | 输出最终 UAT 报告与 PASS/FAIL 决策 |

---

*本方案基于 Core v1 冻结基线编制，冻结模块在 UAT 期间不修改架构，仅允许 P0/P1 缺陷修复。*
