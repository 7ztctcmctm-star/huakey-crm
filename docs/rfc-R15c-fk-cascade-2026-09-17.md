# RFC-R15c：FK CASCADE 删除规则统一

> **状态：ACCEPTED · 已拍板（2026-09-24）** ｜ **排期：v2.0 初实施**

| 项 | 内容 |
|---|---|
| RFC 编号 | **RFC-R15c**（RFC-R15「v2.0 起步评估」子文档 3/3） |
| 所属 PRD | R-15（v2.0） |
| 影响域 | 全库表约束 |
| 冻结级别 | **高** —— 外键约束；变更 DDL 可逆但改变删除语义 |
| 作者 | David |
| 创建日期 | 2026-09-17 |
| 拍板日期 | **2026-09-24**（边界清单 + 硬删除策略） |
| 数据复核 | 2026-09-24（FK 101；明细/日志 21 处 FK 实测） |
| 排期 | **v2.0 初** |
| 关联文档 | RFC-R13、RFC-R10、`docs/deploy/check-fk-details.sql` |

## 目录

1. [背景与问题](#一背景与问题)
2. [现状（实测）](#二现状实测)
3. [目标](#三目标)
4. [删除规则边界清单（已拍板）](#四删除规则边界清单已拍板)
5. [硬删除策略（已拍板）](#五硬删除策略已拍板)
6. [定向整改与迁移](#六定向整改与迁移)
7. [影响面](#七影响面)
8. [风险与回滚](#八风险与回滚)
9. [验收标准](#九验收标准)
10. [决策记录](#十决策记录)
11. [参考资料](#十一参考资料)

---

## 一、背景与问题

外键删除规则四分五裂，且与项目「**删数据先想历史、优先软删除**」的红线冲突：一次硬删除可能被 CASCADE 连带销毁大量业务历史，且不可恢复。

## 二、现状（实测）

全库 **101 个外键**，删除规则分布（2026-09-24）：

| DELETE_RULE | 数量 |
|---|---|
| `CASCADE` | **42** |
| `SET NULL` | 48 |
| `NO ACTION` | 7 |
| `RESTRICT` | 4 |

**指向 `crm_customer` 的外键（共 21 个）尤其危险**：CASCADE **11** · SET NULL 9 · NO ACTION 1。

**明细 / 日志表 21 处外键实测（已符合最佳实践）**：

- 明细 → 直接主表：**CASCADE**（quote_item/contract_item/purchase_item/purchase_plan_item/purchase_comparison_item 共 5 处）；
- 明细 → 基础数据（product/supplier）：**RESTRICT / NO ACTION**（4 处）；
- 日志 → 主表 / sys_user：**SET NULL**（opportunity_stage_log、assign_log、pool_log、customer_score_log 共 12 处）。

## 三、目标

统一外键删除规则口径，使**硬删除不再意外级联销毁业务主数据历史**，同时保留明细/日志表的合理清理行为。

## 四、删除规则边界清单（已拍板）

| 数据类别 | 具体表 | → 直接主表 | → 基础数据 |
|---|---|---|---|
| **明细** | quote_item、contract_item、purchase_item、purchase_plan_item、purchase_comparison_item | **CASCADE**（随主清理，无语义损失） | product/supplier：**RESTRICT / NO ACTION**（防删基础数据连带毁明细） |
| **日志** | opportunity_stage_log、**contract_status_log（新）**、assign_log、pool_log、customer_score_log | **SET NULL**（主数据删后保留痕迹） | sys_user：**SET NULL** |
| **关联表** | customer_tag、user_permission、role_permission、data_permission | **CASCADE**（随主记录清理） | — |
| **业务主数据** | customer、opportunity、quote、contract、order、payment | 相互 **RESTRICT / NO ACTION**（删除走软删，禁止级联硬删） | — |
| **弱引用 / 可空归属** | 可空外键 | **SET NULL** | — |

## 五、硬删除策略（已拍板）

对全仓 58 处 `DELETE FROM` 盘点后分类：

| 场景 | 处置 |
|---|---|
| 业务主数据（customer/opportunity/quote/contract/order/payment） | 服务层**已无硬删除入口** → **保持软删**（`deleted_at`），不回退 |
| 明细 / 关联表 / 日志 | **保留物理删除**（配合 CASCADE / SET NULL），这类数据不需软删 |
| 系统主数据 sys_role / sys_dept | **加 RESTRICT 校验**（存在关联用户/子部门时拒绝），不强制软删 |
| 配置 / 记录类 crm_assign_rule、sys_backup_record | 物理删除可接受 |
| 定时清理 sys_log / sys_token_blacklist | 保留物理清理（过期/截断） |

## 六、定向整改与迁移

1. **优先**把指向 `crm_customer` 的 **11 个 CASCADE 改为 RESTRICT**（直接威胁客户历史）；
2. 逐条迁移：`ALTER TABLE ... DROP FOREIGN KEY / ADD ... ON DELETE RESTRICT`；
3. 整改前确认这些路径无依赖 CASCADE 自动清理（业务主数据已走软删，预期无依赖）；
4. 新表（含 crm_contract_status_log）按本边界建约束。

## 七、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | 主要 11 处（指向 customer）规则变更（冻结表，RFC 已通过） |
| 后端 | 业务主数据维持软删；明细/日志物理删保留；role/dept 加校验 |
| 数据 | 不迁移数据，改变未来删除语义 |
| CI / 基线 | 基线重生成 + N-05 verify（`check-fk-details.sql`）更新 |
| 归档 / 备份 | 备份恢复演练需覆盖新约束 |

## 八、风险与回滚

- **风险**：个别删除入口仍依赖 CASCADE，改 RESTRICT 后报 1451。
  **对策**：已全量盘点 `DELETE FROM` 入口；上线时对删除操作做一次回归。
- **回滚**：外键规则可逐条改回（DDL 可逆）。

## 九、验收标准

- [ ] 全库外键删除规则符合边界口径（脚本探测，纳入 N-05）。
- [ ] 指向 `crm_customer` 的外键**无 CASCADE**。
- [ ] role/dept 存在关联数据时删除被拒；业务主数据删除均为软删。
- [ ] 明细/日志删除路径无 1451 报错。

## 十、决策记录

2026-09-24 拍板：

1. 边界清单按第四节定稿（明细 CASCADE、日志 SET NULL、主数据 RESTRICT、弱引用 SET NULL）。
2. 硬删除：业务主数据**保持软删**（已无硬删入口）；明细/日志/关联保留物理删；role/dept 加 RESTRICT 校验。
3. 优先整改指向 customer 的 11 个 CASCADE。

## 十一、参考资料

- `deploy/check-fk-details.sql` —— 外键明细核查脚本
- `docs/database-schema-audit.md` —— 库结构审计
- 迁移 091 `fix_hard_cascade_to_set_null`、迁移 059/060 外键补全
- RFC-R10（日志表 SET NULL）、RFC-R13（命名规范）
