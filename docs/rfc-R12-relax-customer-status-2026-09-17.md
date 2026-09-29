# RFC-R12：客户状态模型收敛 + 放宽创建

> **状态：ACCEPTED · 已拍板（2026-09-24）** ｜ **排期：v2.0 初实施** ｜ 收敛改表，按本 RFC 出迁移

| 项 | 内容 |
|---|---|
| RFC 编号 | **RFC-R12** |
| 所属 PRD | R-12（Customer Center），并入客户状态统一项（原 R-01） |
| 影响域 | 客户域，波及合同/商机创建、公海回收、逾期提醒、报表 |
| 作者 | David |
| 创建日期 | 2026-09-17 |
| 拍板日期 | **2026-09-24**（business_status 加 paused、lifecycle_status 废弃） |
| 排期 | **v2.0 初** |
| 关联文档 | RFC-R13（命名）、RFC-R10（合同）、`docs/sales-lifecycle-business-rules.md` |

## 目录

1. [背景与问题](#一背景与问题)
2. [现状：11 列盘点](#二现状11-列盘点)
3. [三个状态字段的真实语义](#三三个状态字段的真实语义)
4. [目标模型（v2.0，已拍板）](#四目标模型v20已拍板)
5. [方案与实施步骤](#五方案与实施步骤)
6. [影响面](#六影响面)
7. [风险与回滚](#七风险与回滚)
8. [验收标准](#八验收标准)
9. [决策记录](#九决策记录)
10. [参考资料](#十参考资料)

---

## 一、背景与问题

两个问题同源：

1. PRD R-12：创建客户不应被旧 `status` 口径误挡（历史缺陷：潜客池编辑必失败，`c480109`）。
2. 客户表状态/归属字段膨胀到 **11 列**，同义重复、语义发散，业务侧已无法理清。

## 二、现状：11 列盘点

> 2026-09-24 实测 `crm_customer`，按职责分四层。

| 层 | 列 | 定义 | 处置 |
|---|---|---|---|
| **A 归属** | `owner_id` | INT NULL，当前负责人 | 保留 |
| | `pool_status` | VARCHAR(8)，private/sea，默认 private | 保留 |
| | `pool_type` | ENUM(public/private)，**已废弃无读取** | **删** |
| **B 业务阶段** | `business_status` | VARCHAR(32) NOT NULL 默认 lead | **保留为唯一阶段（7 值）** |
| | `status` | VARCHAR(32) NOT NULL 默认 following，8 值 | **删（并入 business_status + pool_status）** |
| **C 派生展示** | `lifecycle_status` | VARCHAR(20) NULL 默认 new | **废弃删列（信息现算）** |
| | `follow_status` | VARCHAR(20) NULL，初次联系/跟进中 | 降级为只读派生 |
| | `customer_type` | VARCHAR(20) NULL 默认 prospect | 与 business_status 合并 |
| **D 时间/遗留** | `last_follow_time` | DATETIME，逾期15天+回收30天依据 | 保留 |
| | `converted_at` | DATETIME，转正时间 | 保留 |
| | `old_status_int` | TINYINT NULL，旧数字残留 | **删** |

## 三、三个状态字段的真实语义

| 字段 | 身份 | 枚举 | 用途 |
|---|---|---|---|
| `business_status` | 业务**成交进度** | lead/following/quoted/negotiating/signed/lost | **分池 + 筛选 + 公海判定的实际工作字段** |
| `status` | 同一进度的**状态机版本**，多 sea/paused | 8 值 | canTransition 守卫依据；与 business_status 强同步 |
| `lifecycle_status` | **关系成熟度标签**（另一维度） | new/nurturing/active | 仅展示/筛选，**零守卫**，信息可完全派生 |

结论：

- `business_status` 与 `status` 是**同一信息两份字段**（6 值同义；status.sea 与 pool_status 重复）→ 合一。
- `lifecycle_status` 三值全部可由 `last_follow_time` + `business_status` 实时派生，前端基本无入口 → **废弃**。
- 逾期/回收只看 `last_follow_time`，与三字段无关。

## 四、目标模型（v2.0，已拍板）

**3 个工作字段**：

1. `owner_id` —— 负责人；
2. `pool_status` —— private/sea；
3. `business_status` —— **唯一业务阶段（7 值）**，状态机守卫改基于它。

`business_status` 权威枚举：

| code | 名称 | 说明 |
|---|---|---|
| `lead` | 线索 | 潜客池 |
| `following` | 跟进中 | |
| `quoted` | 已报价 | |
| `negotiating` | 谈判中 | |
| `signed` | 已成交 | 终态 |
| `lost` | 已流失 | 终态 |
| **`paused`** | **暂停跟进** | **可恢复的搁置态（承接原 status.paused）** |

**paused 规则**：保留 `owner_id`、`pool_status` 不变（不进公海）；暂停期间不触发逾期提醒；恢复时回到暂停前阶段（following/quoted/negotiating），并重置跟进时钟。

**1 个只读派生字段**：`follow_status`（由跟进动作自动产生，不手填、不守卫）。

**生命周期标签不再落库**：需要「new/nurturing/active」时，由 service 用 `last_follow_time` + `business_status` 以 CASE 现算（一处 helper），供详情/导出/筛选使用。

**清理 5 项**：删 `status`、删 `lifecycle_status`、删 `pool_type`、删 `old_status_int`，`customer_type` 并入 business_status（lead 判定统一）。

## 五、方案与实施步骤

### 步骤 1（应用层，随 v2.0 一起）：放宽创建

- 创建 / 导入 / 线索转化：只校验取值落在枚举集合内，**不做 from→to 流转校验**；后端按场景写「`business_status` + `pool_status` 默认对」，禁止前端传任意组合。
- 更新路径：保留状态流转守卫（改基于 business_status），非法跳变仍拒绝。

### 步骤 2（v2.0 迁移）：字段收敛

- 状态机、分池、筛选全部改基于 `business_status`（含 paused 旁路态）；
- 数据迁移：`status` 值映射到 `business_status`（sea→ 由 pool_status=sea 承接、paused→business_status.paused）；
- 生命周期 helper 上线、确认导出/详情口径后，删除冗余列（分步迁移、先备份，删列推迟到验证后）。

## 六、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | v2.0：删 4 列（status/lifecycle_status/pool_type/old_status_int）、business_status 加 paused、customer_type 合并 |
| API | 创建校验放宽；状态守卫字段切换；生命周期改为后端现算返回 |
| 权限 | 无权限码变化 |
| 前端 | 表单默认值对齐；阶段展示统一走 business_status；移除 lifecycle 死参数 |
| 下游 | 合同/商机创建守卫、公海回收、报表口径统一改字段 |
| CI / 基线 | 迁移后重生成 `init-complete.sql` + N-05 verify |

## 七、风险与回滚

- **风险**：收敛字段时漏改下游引用 → 隐性 500 或口径错位。
  **对策**：先全量盘点引用（本 RFC 已完成大部分），迁移分步、每步回归；保留备份与旧列一个版本周期再删。
- **回滚**：步骤 1 可开关式回退；步骤 2 迁移须可逆（保留映射表，删列推迟到验证后）。

## 八、验收标准

- [ ] 线索池 / 正式客户 / 公海三类创建均成功且字段自洽。
- [ ] 更新路径非法流转仍被拒（400）；paused 可暂停、可恢复且暂停期不提醒。
- [ ] 全仓业务阶段唯一事实源为 business_status（grep 无 status 守卫残留）。
- [ ] 生命周期标签由现算产生，导出/详情口径与旧值一致。
- [ ] `customer-crud` E2E 与客户相关回归全绿。

## 九、决策记录

2026-09-24 拍板（均选方案 A）：

1. business_status **新增 paused（第 7 值）**，定位可恢复搁置态（非独立标记、非按 lost）。
2. lifecycle_status **废弃删列**，信息由 last_follow_time + business_status 现算（非保留只读）。
3. 枚举中文名称以本 RFC 为准。

## 十、参考资料

- `docs/sales-lifecycle-business-rules.md`
- `docs/customer-domain-audit.md`、`docs/customer-permission-standard.md`
- RFC-R13（命名规范）、RFC-R10（合同状态）
