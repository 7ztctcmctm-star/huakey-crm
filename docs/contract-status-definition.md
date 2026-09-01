# Contract Status 状态定义（权威）

> **文档类型**: 状态定义规范
> **适用版本**: HuakeyCRM Core v1
> **编制日期**: 2026-08-06
> **目的**: 统一 `crm_contract.status` 在数据库 / 后端 / 前端 / 文档中的定义，消除历史不一致

---

## 1. 权威定义

| status | 名称 | 说明 | 终态 | 前端标签颜色 |
|--------|------|------|------|-------------|
| 1 | 待执行 | 新建合同默认状态，尚未开始执行 | 否 | info（灰） |
| 2 | 执行中 | 合同正在履行中 | 否 | primary（蓝） |
| 3 | 已完成 | 合同履行完毕，**终态，不可变更** | 是 | success（绿） |
| 4 | 已取消 | 合同作废，**终态** | 是 | danger（红） |

> **审批状态独立**：`approval_status`（1=待审批, 2=已通过, 3=已拒绝）与 `status` 分离管理，互不耦合。

---

## 2. 各层实现对照

| 层 | 文件 | 定义 | 状态 |
|----|------|------|------|
| 数据库 | `crm_contract.status` TINYINT | 值域 1-4，默认 1 | ✅ 一致 |
| 后端 | `services/contractService.js` STATUS_MAP | `{1:'待执行', 2:'执行中', 3:'已完成', 4:'已取消'}` | ✅ 一致 |
| 后端 | `services/contractService.js` updateStatus JSDoc | `1:待执行 2:执行中 3:已完成 4:已取消` | ✅ 一致 |
| 后端 | `services/contractService.js` 终态校验 | `status===3` 不可变更（已完成），但 `updateContractStatus` 为死代码 | ⚠️ 见 §7.1 |
| 后端 | `services/contractCrudService.js` deleteContract | `status===3` 拦截提示已修复 | ✅ 一致 |
| 后端 | `routes/contract/crud.js` Joi schema | `status: 1\|2\|3\|4` | ✅ 一致 |
| 后端 | `routes/contract/crud.js` Swagger 注释 | 已修复为 `1=待执行 2=执行中 3=已完成 4=已取消` | ✅ 一致 |
| 前端 | `views/contract/list.vue` statusText | `{1:'待执行', 2:'执行中', 3:'已完成', 4:'已取消'}` | ✅ 一致 |
| 前端 | `views/contract/list.vue` 新增表单选项 | 待执行/执行中/已完成/已取消 | ✅ 一致 |
| 前端 | `views/payment/reconciliation.vue` | 已修复为完整 1-4 状态映射 | ✅ 一致 |

---

## 3. 历史不一致（已修复）

| 来源 | 原定义 | 问题 | 修复 |
|------|--------|------|------|
| `contractService.js` STATUS_MAP（旧） | `1=执行中, 2=已完结, 3=已终止, 4=已取消` | 与前端/updateStatus JSDoc 矛盾 | 改为 `1=待执行, 2=执行中, 3=已完成, 4=已取消` |
| `contractService.js` 终态错误提示（旧） | `已终止的合同不能变更状态` | status=3 现为"已完成" | 改为 `已完成的合同不能变更状态` |
| `crm-core-v1-freeze-audit.md` §2.4（旧） | `1=执行中, 2=已完结, 3=已终止, 4=已取消` | 文档与实现不符 | 以本文档为准，审计文档需同步 |

---

## 4. 状态流转规则

```
新建 → 1(待执行)
         │
         ├─→ 2(执行中) ─→ 3(已完成) ✅ 终态
         │
         └─→ 4(已取消) ✅ 终态
```

- `1 → 2`：合同开始执行
- `2 → 3`：合同履行完成（终态，锁定）
- `1/2 → 4`：合同取消（终态）
- `3 → 任意`：**禁止**（终态不可变更，后端 `updateContractStatus` 拦截）
- `4 → 任意`：禁止（终态）

---

## 5. 设计决策说明

选择 `1=待执行` 而非 `1=执行中` 作为默认状态的原因：
1. 新建合同尚未开始履行，"待执行"语义更准确。
2. 前端 status=1 标签为灰色（info），符合"待处理"视觉语义。
3. `updateStatus` JSDoc 与前端均采用此定义，为实际运行行为。
4. status=3 采用"已完成"而非"已终止"，因合同正常结束是"完成"而非"终止"；"已取消"独立为 status=4。

---

## 6. 与 approval_status 的关系

| 场景 | status | approval_status |
|------|--------|-----------------|
| 新建未提交 | 1（待执行） | 0（未提交） |
| 提交审批中 | 1（待执行） | 1（待审批） |
| 审批通过 | 1→2（待执行→执行中） | 2（已通过） |
| 审批拒绝 | 1（待执行） | 3（已拒绝） |
| 履行完成 | 3（已完成） | 2（已通过） |

> `status` 与 `approval_status` 解耦：审批状态变化不自动改 contract.status，需人工推进。
> **已知问题**：数据库 `approval_status` 默认值为 `2`（已通过）而非 `0`（未提交），导致新建合同默认为"已通过"状态，前端"提交审批"按钮不可达。此为数据模型遗留问题，需在后续迁移中修复 `DEFAULT` 值。

---

## 7. 已知问题（非阻塞）

### 7.1 终态锁定未在 /update 路径生效

`contractService.updateContractStatus` 包含终态校验（status=3/4 不可变更），但 `/api/v1/contract/update` 实际调用的是 `contractCrudService.updateContract`，该函数直接执行 `UPDATE ... status=?` 无终态检查。

**影响**：低。仅拥有 `contract:edit` 权限的管理员可通过 API 绕过终态锁定。
**修复建议**：在 `contractCrudService.updateContract` 中添加终态校验（非 RC 阻塞项，需业务方确认流转规则后统一实现）。

### 7.2 approval_status 默认值不一致

数据库 `crm_contract.approval_status` 默认值为 `2`（已通过），而业务文档期望新建合同为 `0`（未提交）或 `1`（待审批）。

**影响**：前端"提交审批"按钮（`v-if="approval_status === 0"`）对新建合同不可达。
**修复建议**：执行 `ALTER TABLE crm_contract MODIFY approval_status TINYINT NOT NULL DEFAULT 0`（需业务方确认后执行）。

### 7.3 历史文档待同步

以下文档仍引用旧版状态定义（`1=执行中 2=已完结 3=已终止 4=已取消`），以本文档为准：
- `docs/crm-core-v1-freeze-audit.md` §2.4
- `docs/contract-center-v1-freeze-report.md`
- `docs/contract-center-audit-report.md`
- `docs/DEMO_DATA_AUDIT.md`

**修复建议**：在下一次文档批量更新时同步，非 RC 阻塞项（历史冻结文档保留审计价值）。

---

*本文档为 Contract status 的唯一权威定义。任何状态相关变更须以本文档为准并同步更新。*
