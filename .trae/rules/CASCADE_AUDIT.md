# CASCADE 删除审计报告

> 审计对象：`crm_customer` 及其外键级联链
> 审计时间：2026-06-30
> 数据库：`huakey_crm`（MySQL 8.0）

---

## 1. 执行摘要

系统业务层以**软删除**（`deleted_at`）为主，日常客户删除不会触发物理级联。但数据库层面存在多条 `ON DELETE CASCADE` 外键，一旦调用真实的 `DELETE FROM crm_customer ...`，将不可逆地物理删除大量关联业务数据。风险主要集中在：

- `backend/utils/softDelete.js::permanentDelete()` — 回收站“彻底删除”入口
- `backend/tests/e2e/*.integration.test.js` — 集成测试 teardown 硬删除
- 未来任何新增的直接 `DELETE` 业务代码

---

## 2. 级联删除链路图（ASCII）

```text
                              crm_customer
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   crm_assign_log           crm_contact           crm_contract
   (CASCADE)                (CASCADE)             (CASCADE)
                                  │                       │
                                  │                       ▼
                                  │               crm_opportunity
                                  │               (CASCADE)
                                  │                       │
                                  │                       ▼
                                  │                 crm_quote
                                  │                 (CASCADE)
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   crm_customer_score_log   crm_customer_supplier_relation   crm_customer_tag
   (CASCADE)                (CASCADE)                        (CASCADE)

                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   crm_email                crm_follow_up            crm_follow_up_reminder
   (NO ACTION)              (CASCADE)                (CASCADE)
                                  │
                                  ▼
                         crm_service_order
                         (CASCADE)
```

> 注：`crm_email` 对 `crm_customer` 的外键删除规则为 `NO ACTION`，其余均为 `CASCADE`。

---

## 3. 数据库外键清单

查询 SQL：

```sql
SELECT tc.TABLE_NAME, kcu.COLUMN_NAME, tc.CONSTRAINT_NAME, rc.DELETE_RULE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
 AND tc.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND rc.REFERENCED_TABLE_NAME = 'crm_customer'
  AND tc.TABLE_SCHEMA = 'huakey_crm';
```

结果：

| 子表 | 外键列 | 约束名 | 删除规则 |
|---|---|---|---|
| crm_assign_log | customer_id | fk_assign_log_customer | CASCADE |
| crm_contact | customer_id | fk_contact_customer | CASCADE |
| crm_contract | customer_id | fk_contract_customer | CASCADE |
| crm_customer_score_log | customer_id | fk_csl_customer | CASCADE |
| crm_customer_supplier_relation | customer_id | fk_csr_customer | CASCADE |
| crm_customer_tag | customer_id | fk_ct_customer | CASCADE |
| crm_email | customer_id | crm_email_ibfk_2 | NO ACTION |
| crm_follow_up | customer_id | fk_follow_customer | CASCADE |
| crm_follow_up_reminder | customer_id | fk_reminder_customer | CASCADE |
| crm_opportunity | customer_id | fk_opp_customer | CASCADE |
| crm_quote | customer_id | fk_quote_customer | CASCADE |
| crm_service_order | customer_id | fk_service_customer | CASCADE |

此外，迁移脚本 `database/migrations/059_core_foreign_keys.sql` 对部分核心外键做了“动态规则”：若字段可为空则 `ON DELETE SET NULL`，否则 `ON DELETE CASCADE`。生产环境实际规则以 `information_schema` 查询结果为准。

---

## 4. 代码硬删除搜索结果

### 4.1 生产代码

```text
backend/services/scoringRouteService.js:160
  await pool.query('DELETE FROM crm_customer_score_log WHERE customer_id = ?', [customerId]);

backend/services/tagRouteService.js:33
  await conn.query('DELETE FROM crm_customer_tag WHERE customer_id = ?', [customerId]);

backend/services/tagRouteService.js:76
  await pool.query('DELETE FROM crm_customer_tag WHERE tag_id = ?', [id]);
```

说明：
- `scoringRouteService.js` 和 `tagRouteService.js` 中的删除仅针对子表，不直接删除 `crm_customer`。
- 未发现生产业务代码直接 `DELETE FROM crm_customer`。

### 4.2 测试代码

```text
backend/tests/e2e/transaction.integration.test.js:66
  await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);

backend/tests/e2e/permission-real.integration.test.js:210
  await pool.query('DELETE FROM crm_customer WHERE id = ?', [res.body.data.id]);

backend/tests/e2e/permission-real.integration.test.js:277
  await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);

backend/tests/e2e/customer-lifecycle.integration.test.js:50
  await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);
```

说明：集成测试在 teardown 阶段执行真实删除，会触发级联物理删除。测试环境数据为临时数据，风险可控，但需确保测试隔离。

### 4.3 回收站彻底删除

```text
backend/utils/softDelete.js:74-81
async function permanentDelete(tableName, id) {
  validateTable(tableName);
  const [result] = await pool.query(
    `DELETE FROM ${tableName} WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
}

backend/routes/recycle.js:111
  const success = await permanentDelete(config.table, id);
```

说明：回收站的“彻底删除”功能允许管理员对 `crm_customer` 执行真实 `DELETE`，将触发上述完整级联链，造成不可逆数据丢失。

---

## 5. 风险评估

| 风险点 | 风险等级 | 说明 |
|---|---|---|
| 回收站彻底删除 `crm_customer` | **高** | 用户可通过 UI 触发真实 `DELETE`，级联删除客户下所有跟进、商机、合同、报价等 |
| 集成测试 teardown | 中 | 测试脚本真实删除客户，若连接生产/共享数据库将造成事故 |
| 未来新增直接 `DELETE` 业务代码 | 中 | 开发者可能 unaware 级联链，误写硬删除 |
| `crm_email` 的 `NO ACTION` 规则 | 低 | 删除客户前若未清理邮件记录，将触发外键约束错误而非级联删除 |

---

## 6. 修复建议

### 6.1 短期（推荐立即实施）

1. **回收站彻底删除增加二次确认与级联影响提示**
   - 前端在“彻底删除客户”时展示即将被级联删除的数据类型和数量。
   - 后端在执行 `permanentDelete('crm_customer', id)` 前，先查询并记录关联数据摘要。

2. **限制 `crm_customer` 的彻底删除**
   - 考虑在 `softDelete.js` 的 `ALLOWED_TABLES` 中移除 `crm_customer`，禁止通过回收站彻底删除客户；或仅允许超级管理员执行，并强制要求输入确认码。

3. **集成测试使用事务回滚或软删除清理**
   - 将 `tests/e2e/*.integration.test.js` 中的 `DELETE FROM crm_customer` 改为事务回滚，或至少按依赖顺序先删除子表再删父表，避免依赖级联。

### 6.2 中期

4. **数据库外键规则调整**
   - 评估是否将核心子表（如 `crm_contract`）的 `ON DELETE CASCADE` 改为 `RESTRICT` 或 `SET NULL`，强制业务层先处理关联数据。
   - 对 `crm_email` 等 `NO ACTION` 规则，统一业务层删除顺序，避免外键冲突。

5. **删除审计日志**
   - 对 `crm_customer` 的真实删除记录完整审计日志，包括操作人、时间、关联影响表及行数。

### 6.3 长期

6. **统一删除入口**
   - 禁止业务代码直接 `DELETE FROM crm_customer`，所有客户删除统一走 `customerService.deleteCustomer`，内部实现软删除 + 异步归档。

---

## 7. 验收状态

- [x] 已查询 `information_schema` 获取 `crm_customer` 外键清单
- [x] 已搜索 `backend/` 中硬删除 `crm_customer` 的代码
- [x] 已绘制 ASCII 级联删除链路图
- [x] 已完成风险评估与修复建议
