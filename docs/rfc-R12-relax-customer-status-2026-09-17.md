# RFC-R12：放宽 `customer.status` 创建限制（草案）

> 编制：David ｜ 状态：**DRAFT，待评审** ｜ 日期：2026-09-17
> PRD：R-12（Customer Center）｜ 冻结相关：**是**（触及 Customer 状态模型）
> ⚠️ 仅评估，不落地。

---

## 一、背景与问题

PRD R-12：「**创建客户不再被旧 status 约束阻断**」。当前事实（实测）：

| 列 | 定义 |
|---|---|
| `crm_customer.status` | `VARCHAR(32) NOT NULL DEFAULT 'following'` |
| `crm_customer.business_status` | `VARCHAR(32) NOT NULL DEFAULT 'lead'` |
| `crm_customer.lifecycle_status` | `VARCHAR(20) NULL DEFAULT 'new'` |

- 流转守卫位于 `backend/services/customerDetailService.js:216`：`customerService.canTransition(pool, customer.status, updateFields.status)`。
- 已知系统性风险：**客户状态三字段（`status`/`business_status`/`lifecycle_status`）语义发散**（工作记忆红线），三字段分别影响「能否建合同 / 是否被公海回收 / 是否触达逾期提醒」。

**痛点**：三字段并存且各自带旧约束，创建/导入客户时容易因「旧 status 口径」被守卫误挡（历史上已出现「潜客池编辑客户必失败」的同类缺陷，见 `c480109`）。

## 二、目标

1. 创建客户（含导入/线索转化）**不再被与业务无关的旧 status 约束阻断**。
2. **更新**路径的非法流转守卫**不放松**（避免状态随意跳变）。
3. 创建后 `status` / `business_status` / `lifecycle_status` 三者**取值自洽**（有明确默认与映射）。

## 三、方案（推荐 A）

### 方案 A：区分「创建」与「更新」两条路径（推荐）
- 创建/导入/转化：**只做字段取值合法性校验**（必须落在允许的枚举集合内），**不做 from→to 流转校验**；由后端统一按场景写入 `status` + `business_status` 的**自洽默认对**（如 线索：`lead`/`following` 组合需先定义）。
- 更新：保留 `canTransition` 守卫（既有行为不变）。

### 方案 B：统一收敛为单一状态源（大改，建议 v2.0）
把三字段收敛为一套状态 + 派生视图。**影响面极大**（建合同、公海回收、逾期提醒全依赖），需独立 RFC。

## 四、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | **不改**（仅改应用层校验分支） |
| API 契约 | 创建/导入接口的校验语义变化（放宽）；返回字段不变 |
| 权限 | 无 |
| 前端 | 新建/导入表单的状态默认值需与后端自洽对一致 |
| 数据 | 需一次核对：现存客户的 `status`/`business_status` 组合是否都落在新枚举集合内 |
| CI | 新增/更新创建路径单测；E2E `customer-crud` 三类型矩阵须回归 |

## 五、风险与回滚

- 风险：放宽创建校验后，可能出现「三字段不自洽」的新数据。**对策**：创建入口内置「自洽默认对」映射表，禁止前端任意传组合。
- 回滚：改动集中在创建路径分支，可开关式回退。

## 六、验收标准

- [ ] 线索池/正式客户/公海三类创建均成功，且 `status`↔`business_status` 自洽。
- [ ] 更新路径的非法流转仍被拒（400）。
- [ ] `customer-crud.spec.js`（6 用例）回归全绿。

## 七、待拍板（Open Questions）

1. **三字段的权威语义与枚举集合**由谁定义？（这是本 RFC 的前置，未定则不能落地）
2. 创建时是否允许**指定**初始 status？还是强制按场景默认？
3. 与 R-01（status/business_status 统一）是否合并为同一 RFC 推进？
