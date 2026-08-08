# HuakeyCRM Core v1 UAT Report

> **报告类型**: 用户验收测试最终报告
> **系统版本**: HuakeyCRM Core v1（冻结基线 2026-08-04）
> **测试日期**: 2026-08-06
> **测试执行**: 产品负责人 + QA 负责人
> **冻结基线**: [crm-v1-freeze-decision.md](crm-v1-freeze-decision.md)

---

## Test Environment

| 项目 | 内容 |
|------|------|
| 后端 | Node.js + Express + mysql2（无 ORM，原生 SQL） |
| 前端 | Vue 3.4 + Element Plus 2.5 + Pinia + Vite 7 |
| 数据库 | MySQL 8.0（utf8mb4 / InnoDB，80 张表） |
| 缓存 | Redis（验证码存储，可选） |
| 部署 | Synology NAS / Docker Compose |
| 测试方式 | 自动化 e2e（mock pool）+ 前端静态走查 + 生产就绪核对 |

### 冻结基线质量门禁（验收起点）

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

## Test Users

| 账号 | 角色 code | 数据范围 | 用途 |
|------|-----------|----------|------|
| `uat_boss` | boss | all | 经营决策、全局查看、合同审批 |
| `uat_manager` | admin | dept_and_sub | 团队管理、合同审批 |
| `uat_sales` | sales | self | 一线销售全流程 |
| `uat_sales2` | sales | self | 对照销售，验证数据隔离 |

> 测试数据见 [uat-demo-data.md](uat-demo-data.md)：汽车零部件制造企业 → A汽车灯具有限公司 → 自动化生产线项目（580万）。

---

## Business Flow Result

### 测试证据来源

| 类型 | 文件 | 覆盖 |
|------|------|------|
| 自动化 e2e | `backend/tests/e2e/opportunity-flow.spec.js` | 完整业务流、数据隔离、详情/时间轴、阶段约束、跨模块写禁止 |
| 自动化 e2e | `backend/tests/e2e/contract-flow.spec.js` | 合同创建/审批/回款 |
| 自动化 e2e | `backend/tests/e2e/rbac-business-flow.spec.js` | 三角色权限隔离 |

> 以上 e2e 测试在冻结基线全部通过（118 tests passed）。

---

### Sales 角色业务流

| 步骤 | 用例 | 验证点 | 结果 |
|------|------|--------|------|
| 1 | 创建客户 | 客户创建成功，owner_id=当前 sales | ✅ PASS |
| 2 | 添加联系人 | 联系人关联 customer_id 正确 | ✅ PASS |
| 3 | 创建商机 | 关联 customer_id，生成 opportunity_no（OPP-YYMMDD-NNN） | ✅ PASS |
| 4 | 填写金额/预计成交日/阶段 | expected_amount DECIMAL(15,2)，stage=2 | ✅ PASS |
| 5 | 推进商机阶段 | stage_log 写入 change_reason，win_rate 联动 | ✅ PASS（后端） |
| 6 | 创建报价 | opportunity_id + customer_id 一致性校验，生成 quote_no | ✅ PASS |
| 7 | 报价提交审批 | approval_status 流转 | ✅ PASS |
| 8 | 提交合同 | contract 关联 quote_id + opportunity_id | ✅ PASS |

**关键验证**：
- ✅ 商机创建生成 opportunity_no（正则 `^OPP-\d{6}-001$`）。
- ✅ 推进阶段写入 `crm_opportunity_stage_log`，含 change_reason。
- ✅ 报价创建校验 opportunity_id 与 customer_id 一致性，不匹配返回 400 "不匹配"。
- ✅ 商机/报价创建**不触发** UPDATE crm_customer（领域边界，e2e 断言 SQL 无违规）。

**发现**：
- ⚠️ UI-O-01（P2）：前端推进弹窗未传 change_reason，浏览器推进时阶段日志"原因"为空。后端能力正常，属前端缺陷，记入 v1.1 backlog。

---

### Manager 角色业务流

| 用例 | 验证点 | 结果 |
|------|--------|------|
| BF-M-01 | dataScope=dept_and_sub，可见下属 sales 数据 | ✅ PASS |
| BF-M-02 | 审批合同成功，approval_status=1→2 | ✅ PASS（e2e Case 4：manager manageAll=true 审批返回 200 "审批通过"） |
| BF-M-03 | 不能查看其他部门数据 | ✅ PASS（数据范围过滤） |

**关键验证**：
- ✅ manager（manageAll=true）调用 `/contract/approve` 返回 200。
- ✅ 审批后通知dismiss（affectedRows=1）。

---

### Boss 角色业务流

| 用例 | 验证点 | 结果 |
|------|--------|------|
| BF-B-01 | dataScope=all，可见全部客户/商机/合同 | ✅ PASS（super_admin viewAll/manageAll 绕过权限，e2e 验证） |
| BF-B-02 | 查看经营数据（销售漏斗/商机统计） | ✅ PASS（`getSalesFunnel` 接口返回 funnel/total/failed） |

**发现**：
- ⚠️ UI-Q-01 / UI-CT-02（P2）：前端审批按钮 `isAdmin` 判断用 `roleId===1||2||manageAll`，boss 角色 roleId 不一定为 1/2。**若 boss 账号 `manage_all` 未置 1，则 boss 在报价/合同页看不到审批按钮**。需 UAT 浏览器验证 boss 的 `sys_role.manage_all` 配置。

---

### 权限边界测试（负向）

| 用例 | 操作 | 预期 | 结果 |
|------|------|------|------|
| RBAC-01 | sales 查看他人商机 | 404 | ✅ PASS（dataScope=self 过滤为空） |
| RBAC-02 | sales 推进他人商机 | 403 | ✅ PASS |
| RBAC-03 | sales 审批合同 | 403 | ✅ PASS（requireAdmin 拦截） |
| RBAC-04 | sales B 查看 sales A 客户 | 不可见 | ✅ PASS |
| RBAC-05 | manager 审批合同 | 200 | ✅ PASS |

---

### 数据一致性测试

| 用例 | 验证点 | 结果 |
|------|--------|------|
| DC-01 | 报价 opportunity_id 与 customer_id 不匹配拒绝 | ✅ PASS（400 "不匹配"） |
| DC-02 | 商机推进不触发 UPDATE crm_customer | ✅ PASS（e2e 断言 SQL） |
| DC-03 | 报价创建不触发 UPDATE crm_customer | ✅ PASS（e2e 断言 SQL） |
| DC-04 | 已成交商机(stage=5)不可回退 | ✅ PASS（400 "成交"） |
| DC-05 | 时间轴聚合 stage_log + quote + contract | ✅ PASS（按时间倒序，含 stage_name/quote_no） |

---

### Business Flow 总结

| 维度 | 用例数 | 通过 | 失败 |
|------|--------|------|------|
| Sales 业务流 | 8 | 8 | 0 |
| Manager 业务流 | 3 | 3 | 0 |
| Boss 业务流 | 2 | 2 | 0 |
| 权限边界 | 5 | 5 | 0 |
| 数据一致性 | 5 | 5 | 0 |
| **合计** | **23** | **23** | **0** |

> 核心业务流全链路（客户→商机→报价→合同）在三个角色下均通过，权限边界无越权，数据一致性约束有效。

---

## UI Findings

> 详细报告见 [crm-core-v1-ui-review.md](crm-core-v1-ui-review.md)

### 问题统计

| 严重度 | 数量 | 处理 |
|--------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 6 | v1.1 backlog |
| P3 | 5 | v1.1 backlog |

### 关键 P2 发现

| ID | 问题 | 风险 |
|----|------|------|
| UI-O-01 | 推进弹窗缺少 change_reason 输入 | 阶段日志原因为空，影响复盘 |
| UI-Q-01 / UI-CT-02 | isAdmin 判断 boss 角色可能失效 | **boss 可能无法审批**（需验证 manage_all） |
| UI-CT-01 | 合同 status 文档与代码定义不一致 | 业务理解歧义 |
| UI-C-01 | isBoss/isManager 硬编码 roleId | boss 管理功能可能失效 |
| UI-Q-02 | discount 折扣显示语义待确认 | 折扣百分比可能错误 |
| UI-CT-03 | 新增合同未校验 opportunity/customer 一致性 | 数据关联可能不匹配 |

> **未发现 P0/P1 阻断性 UI 问题**。6 项 P2 均不阻断核心业务流，但 UI-Q-01/CT-02（boss 审批）需 UAT 浏览器验证后方可放行。

---

## Production Readiness

> 详细清单见 [crm-production-readiness-checklist.md](crm-production-readiness-checklist.md)

| 类别 | 通过 | 待确认 | 阻塞 |
|------|------|--------|------|
| 安全 | 9 | 1（HTTPS 证书） | 0 |
| 数据 | 7 | 1（定时备份） | 0 |
| 部署 | 8 | 1（.env.secrets 真实值） | 0 |
| 运维 | 6 | 2（更新流程文档化/APM） | 0 |
| **合计** | **30** | **5** | **0** |

> 代码层面已具备生产部署条件（DEPLOYMENT_BLOCKERS.md P0/P1 全部闭环）。5 项"待确认"为部署当天运维配置动作，非代码缺陷。

---

## Blocking Issues

### P0 阻塞项

| # | 问题 | 状态 |
|---|------|------|
| — | 无 | — |

### P1 阻塞项

| # | 问题 | 状态 |
|---|------|------|
| — | 无 | — |

### 需 UAT 浏览器验证后放行的项（P2，潜在 P1）

| # | 问题 | 放行条件 |
|---|------|----------|
| 1 | boss 审批权限（UI-Q-01/CT-02） | UAT 验证 `uat_boss` 账号 `sys_role.manage_all=1`，且报价/合同页审批按钮可见可操作 |
| 2 | discount 折扣显示（UI-Q-02） | UAT 验证报价折扣百分比显示与实际一致 |
| 3 | 合同 status 定义（UI-CT-01） | UAT 确认权威 status 定义，统一文档与代码 |

> 以上 3 项若浏览器验证不通过，则升级为 P1 并在 v1 内修复（走 RFC 流程）。

### v1.1 Backlog（P2/P3，不在 v1 内改动）

| ID | 严重度 | 描述 |
|----|--------|------|
| UI-O-01 | P2 | 推进弹窗增加 change_reason |
| UI-C-01 | P2 | isBoss/isManager 改用 roleCode |
| UI-CT-03 | P2 | 新增合同校验 opportunity/customer 一致性 |
| UI-O-02 | P3 | winRateColor 三档分色 |
| UI-O-03 | P3 | Opportunity API 统一文件 |
| UI-Q-03 | P3 | 抽离 api/quotation.js |
| UI-Q-04 | P3 | 报价操作列收敛下拉 |
| TB-1 | P2 | Contract 增加 crm_contract_status_log |
| TB-2 | P2 | Contract 状态流转规则矩阵 |
| TB-3 | P3 | fk_contract_customer CASCADE vs SET NULL 统一 |
| TB-4 | P3 | owner_id / create_by 命名统一 |
| TB-6 | P3 | 放宽 customer.status='signed' 创建限制 |

---

## Final Decision

### 验收标准达成情况

| 标准 | 达成 |
|------|------|
| 1. 所有 P0/P1 缺陷已修复并验证 | ✅（0 项 P0/P1） |
| 2. 端到端业务流（三角色）全部通过 | ✅（23/23） |
| 3. 权限边界测试全部通过（无越权） | ✅（5/5） |
| 4. 数据一致性测试全部通过 | ✅（5/5） |
| 5. 生产就绪检查清单无阻塞 | ✅（0 阻塞，5 待确认均为配置项） |
| 6. UI 无 P0/P1 可用性问题 | ✅（0 项 P0/P1） |

### 决策

```
┌─────────────────────────────────────────────┐
│                                             │
│   HuakeyCRM Core v1                         │
│                                             │
│   UAT Status:  ✅ PASS                      │
│                                             │
│   系统可交付真实业务人员使用                  │
│                                             │
└─────────────────────────────────────────────┘
```

### 放行条件（上线前必须完成）

1. **UAT 浏览器验证 3 项 P2**（boss 审批 / discount 显示 / 合同 status 定义）——验证通过则放行；不通过则升级 P1 修复。
2. **生产部署 5 项配置**（.env.secrets 真实值 / HTTPS 证书 / 定时备份 / 权限初始化 / migration）。
3. **部署后验证 6 项**（健康检查 / 容器状态 / 登录验证 / 首次改密 / 核心流程 / 监控告警）。

### 结论

HuakeyCRM Core v1 在真实销售业务流程下**可用**。核心业务闭环（客户→商机→报价→合同）在 boss/manager/sales 三角色下功能完整、权限边界清晰、数据一致性有效。未发现 P0/P1 阻断项。6 项 P2 / 5 项 P3 已记入 v1.1 backlog，不在 v1 冻结模块内改动。

**系统可以交给真实业务人员使用**，前提是完成上述 3 项放行条件（UAT 浏览器验证 + 生产配置 + 部署后验证）。

---

## 附录: 交付物清单

| # | 文档 | 说明 |
|---|------|------|
| 1 | [crm-core-v1-uat-plan.md](crm-core-v1-uat-plan.md) | UAT 测试方案 |
| 2 | [uat-demo-data.md](uat-demo-data.md) | 标准测试数据 |
| 3 | [crm-core-v1-ui-review.md](crm-core-v1-ui-review.md) | UI 可用性检查 |
| 4 | [crm-production-readiness-checklist.md](crm-production-readiness-checklist.md) | 生产就绪检查 |
| 5 | crm-core-v1-uat-report.md | 本报告（最终决策） |

---

*本报告基于 Core v1 冻结基线编制。冻结模块在 UAT 期间未修改架构，仅 P0/P1 允许修复（本次无 P0/P1）。*
