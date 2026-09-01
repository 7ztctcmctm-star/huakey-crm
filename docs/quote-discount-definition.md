# Quote Discount 字段语义定义（权威）

> **文档类型**: 字段语义规范
> **适用版本**: HuakeyCRM Core v1
> **编制日期**: 2026-08-06
> **目的**: 统一 `crm_quote.discount` 在数据库 / 后端 / 前端中的语义定义

---

## 1. 权威定义

| 属性 | 值 |
|------|-----|
| **字段** | `crm_quote.discount` |
| **类型** | `DECIMAL(5,2)` |
| **默认值** | `0.00` |
| **语义** | **折扣率（off 比率）** — 表示从总金额中扣除的比例，不是实付比例 |
| **取值范围** | `[0, 1]`（0 = 无折扣，0.05 = 5% off = 95折，1 = 100% off = 免费） |
| **计算公式** | `final_amount = amount × (1 − discount)` |

### 1.1 示例

| discount | 含义 | amount | final_amount |
|----------|------|--------|-------------|
| `0.00` | 无折扣 | ¥10,000 | ¥10,000 |
| `0.05` | 5% off（95折） | ¥10,000 | ¥9,500 |
| `0.10` | 10% off（9折） | ¥10,000 | ¥9,000 |
| `1.00` | 100% off（免费） | ¥10,000 | ¥0.00 |

---

## 2. 各层实现对照

| 层 | 文件 | 实现 | 状态 |
|----|------|------|------|
| 数据库 | `crm_quote.discount` | `DECIMAL(5,2) DEFAULT '0.00'` | ⚠️ 无 CHECK 约束，允许 >1 |
| 后端 | `routes/quote.js` Joi schema | `Joi.number().min(0).max(1).optional()` | ✅ 正确 |
| 后端 | `services/quoteService.js` create | `finalAmount = totalAmount * (1 - (discount \|\| 0))` | ✅ 正确 |
| 后端 | `services/quoteService.js` update | 仅当传入 items 时重算 final_amount | ⚠️ 已知问题（见 §3.1） |
| 前端 | `views/quotation/edit.vue` | `el-input-number` min=0, max=0.99, step=0.01 | ✅ 正确 |
| 前端 | `views/quotation/list.vue` 列表展示 | `Math.round((1 - row.discount) * 100)%` | ⚠️ 展示歧义（见 §3.3） |
| 前端 | `views/quotation/edit.vue` 辅助文案 | placeholder="0.05表示95折" | ✅ 语义清晰 |

---

## 3. 已知问题（非阻塞）

### 3.1 仅更新 discount 不传 items 时 final_amount 不更新

**影响**: 低。前端编辑表单始终同时提交 items 和 discount，不会被触发。
**触发条件**: 仅通过 API 直接调用 update 接口且传入 discount 但不传 items。
**修复建议**: 在 `quoteService.updateQuote` 的 discount 分支中也重算 `final_amount`（非 RC 阻塞项）。

### 3.2 数据库层缺少 CHECK 约束

**影响**: 极低。API 层 Joi 校验 `max(1)` 已拦截，前端 `max(0.99)` 也已限制。
**修复建议**: 添加 `ALTER TABLE crm_quote ADD CONSTRAINT chk_discount_range CHECK (discount >= 0 AND discount <= 1)`（非 RC 阻塞项）。

### 3.3 列表展示歧义

**现状**: 列表"折扣"列显示 `Math.round((1 - discount) * 100)%`，即 discount=0.05 显示为 "95%"。
**问题**: 列名为"折扣"，但显示的是"实付比例"（95折 = 支付 95%），可能被误解为"打 95% 折扣"（即只付 5%）。
**说明**: 这是中国商务惯例（报"95折"而非"5% off"），团队内部已形成共识。
**修复建议**: 如需要，将列标签改为"折扣率"并在数值后标注"折"（即显示 "95折"），避免 `%` 后缀歧义（非 RC 阻塞项）。

---

## 4. 跨模块对照

| 模块 | 字段 | 语义 | 一致性 |
|------|------|------|--------|
| 报价 `crm_quote` | `discount DECIMAL(5,2)` | off 比率 `[0,1]` | — |
| 采购 `crm_purchase` | `discount_rate` (per-item) | 各 item 独立折扣 | 不同语义，合理 |
| 合同 `crm_contract` | 无 discount 字段 | 报价→合同时 discount 已固化进 `amount` | 设计如此 |

---

## 5. 设计决策说明

选择 `discount` 存储"off 比率"而非"实付比例"的原因：
1. 数学直觉：`discount = 0` 表示"无折扣"，`discount = 1` 表示"全免费"，符合 "discount" 英文原意。
2. 计算简洁：`final = amount × (1 − discount)` 避免 `× (100 − x) / 100` 的复杂形式。
3. 与 Joi `min(0).max(1)` 校验语义一致。
4. 前端展示层通过 `(1 − discount)` 转换适配中国商务惯例（"95折"），分离存储与展示。

---

## 6. 结论

**No Change Required** — 数据库 / 后端 / 前端三层在核心语义上一致。上述已知问题均为展示优化或防御性增强，非数据模型或业务逻辑缺陷，不阻塞 v1 Release Candidate。

---

*本文档为 Quote discount 字段的唯一权威定义。任何语义变更须以本文档为准并同步更新。*
