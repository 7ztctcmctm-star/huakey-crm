# RFC-R13：列名命名规范（`create_by` / `update_by` / `owner_id` / `create_time`）

> **状态：ACCEPTED · 已拍板（2026-09-24）** ｜ 规范即刻生效；旧列借道渐进统一，不一次性改表

| 项 | 内容 |
|---|---|
| RFC 编号 | **RFC-R13** |
| 所属 PRD | R-13（全局） |
| 影响域 | 全库（跨所有域） |
| 决策结论 | **按现状主流定稿**：`create_by` / `create_time` / `update_time` / `owner_id` |
| 作者 | David |
| 创建日期 | 2026-09-17 |
| 拍板日期 | **2026-09-24**（决策：命名方向按主流，不向 `created_by`/`created_at` 工程习惯改名） |
| 关联文档 | RFC-R10、RFC-R15c |

## 目录

1. [决策记录](#一决策记录)
2. [现状（实测）](#二现状实测)
3. [权威命名规范](#三权威命名规范)
4. [落地方式](#四落地方式)
5. [影响面](#五影响面)
6. [风险与回滚](#六风险与回滚)
7. [验收标准](#七验收标准)
8. [遗留跟进](#八遗留跟进)
9. [参考资料](#九参考资料)

---

## 一、决策记录

2026-09-24 评审拍板：**命名方向按现状主流**。

- 放弃「向 ORM 工程习惯（`created_by` / `created_at`）看齐」的方案——那需要重命名 38 张表的创建人列、86 张表的时间列，风险高、收益低。
- 采用「向现状主流看齐」：绝大多数表已经在用 `create_by` / `create_time`，定为标准，新表强制遵守，旧表中少数异类借道统一。

## 二、现状（实测）

> 口径：本地 `huakey_crm`，106 张应用表（2026-09-24，`information_schema`）。

| 语义 | 列名 | 表数 | 异类 |
|---|---|---|---|
| 创建人 | `create_by` | **38** | `created_by` 2 表（`crm_approval_rule`、`crm_purchase_comparison`） |
| 更新人 | （无） | **0** | `updated_by` 0 表 —— 现状无更新人列 |
| 归属人 | `owner_id` | **5** | `crm_customer`、`crm_opportunity`、`crm_supplier`、`crm_purchase_order`、`crm_follow_up_reminder` |
| 创建时间 | `create_time` | **86** | `created_at` 12 表 |
| 更新时间 | `update_time` | **47** | `updated_at` 6 表 |

> 先例教训：迁移 116 因使用 `created_at/updated_at`（与主流不符）导致审批规则接口 500，见 `docs/crm-r09-r11-r14-r16-progress-2026-09-17.md` 第 7.1 节。本规范即为杜绝此类问题。

## 三、权威命名规范

| 语义 | **标准列名** | 规则 |
|---|---|---|
| 创建人 | **`create_by`** | 新表强制；存用户 id |
| 更新人 | **`update_by`** | 新表需要记录更新人时使用，与 `create_by` 同构 |
| 归属人（负责人） | **`owner_id`** | 语义独立于创建人，需要表达「归属/负责」的表统一用它 |
| 创建时间 | **`create_time`** | DATETIME |
| 更新时间 | **`update_time`** | DATETIME |
| 软删除 | **`deleted_at`** | 现状 62 表统一使用（无 `is_deleted` 形态） |

**禁止**在新表使用：`created_by` / `updated_by` / `created_at` / `updated_at` / `is_deleted`。

## 四、落地方式

采用「**规范先行 + 借道渐进**」（原方案 C）：

1. 本 RFC 通过，规范即刻生效；
2. **新表强制**使用标准列名（建议加 CI / lint 守卫，见遗留跟进）；
3. 旧表中的异类（`created_by` 2 表、`created_at` 12 表、`updated_at` 6 表）**不单独立项**，在该表本就要改时顺带统一；
4. 代码层最多保留**一处** helper 做查询别名适配。

## 五、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | 规范生效零变更；未来借道统一异类列（最多 20 表次） |
| 后端 | 新表 SQL 按标准；借道时同步该列引用 |
| 前端 | 新字段按标准命名 |
| CI / 基线 | 借道改表后重生成基线 + N-05 verify |

## 六、风险与回滚

- 规范生效不触表，**零回滚成本**。
- 借道统一时若漏改引用 → 隐性 500；对策：借道改表随该表自身改动一起测试，不做批量重命名。

## 七、验收标准

- [x] 输出统一命名规范 + 受影响清单（本 RFC 即交付物）。
- [x] 不做一次性改表（遵守）。
- [ ] 新表全部使用标准列名（CI 守卫落地后自动满足）。

## 八、遗留跟进

1. **已确认实施（2026-09-28）**：加「新表提交前 lint / CI 守卫」扫描新列名是否合规，随 v2.0 落地。
2. 现存异类列（`crm_approval_rule.created_by` 等）登记为技术债，借道清理。

## 九、参考资料

- `docs/crm-r09-r11-r14-r16-progress-2026-09-17.md` 第 7.1 节 —— 列名不符致 500 案例
- `docs/database-schema-audit.md`
- 同类日志表命名参照：`crm_opportunity_stage_log`、`crm_assign_log`、`crm_pool_log`
