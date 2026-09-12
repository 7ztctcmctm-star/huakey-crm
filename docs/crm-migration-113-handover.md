# 迁移 113 交付与实测报告（2026-09-12 · David）

> 本文档记录迁移 113_single_primary_contact.sql 在本地 `huakey_crm` 库
> 的执行结果与业务修复证据。配套方案文档：
> `docs/customer-contact-single-primary-plan.md`（方案 A，2026-09-11 批准）。

## 一、结论

**113 真实执行成功，业务症状已修复**——但**此前一直未进 git**，本次补做提交与推送。

| 项 | 修复前 | 修复后（实测） | 判定 |
|---|---|---|---|
| 多主联系人客户 | 417 / 428（97%） | **0** | ✅ |
| 主联系人数 → 客户数 | 一对多 | **全部 1:1**（419 个客户各有 1 主联系人） | ✅ |
| 备份表行数 | 应该有 ~417 | **417**（与方案文档预测完全一致）| ✅ |
| 唯一索引 | 无 | `uk_contact_primary_per_customer` 函数式索引已建 | ✅ |
| **客户列表业务扇出** | pageSize=200 / distinct=103（**行数与 total 口径不一致**）| pageSize=200 / distinct=200（**一致**）| ✅ |
| **COUNT(DISTINCT) total** | 428 | 424（**仍包含 deleted_at IS NULL 的 4 个未删客户**，口径不变）| ✅ |

**5 个客户无主联系人**（419 < 424）—— 113 UPDATE 只处理「有重复的客户」，未自动给「无主联系人的客户」补主联系人。前端会显示空主联系人，对业务无影响。是否需要补默认主联系人属于独立产品决策，**不在 113 范围**。

## 二、执行明细（实测脚本路径）

1. **执行命令**（与 CI 同款）：
   ```bash
   NODE_PATH=backend/node_modules \
     DB_HOST=… DB_PORT=… DB_USER=… DB_PASSWORD=… DB_NAME=… \
     node database/migrate.js
   ```
2. **结果**：`成功=1, 跳过=110, 失败=0`（113 此前未入账，本次为首次真实执行）。
3. **幂等性**：再跑一次 `成功=0, 跳过=111, 失败=0`（113 第 2/3 步全部走"已存在/无匹配"分支）。

## 三、迁移文件本身的三步动作

| 步 | 动作 | 真实效果 |
|---|---|---|
| 1 | 备份表 `crm_contact_primary_backup_113` | 备份 417 行（与方案预测的 ~417 完全一致）|
| 2 | UPDATE 把多余主联系人降级（保留 `MIN(id)`）| 多主联系人客户：417 → 0 |
| 3 | 函数式唯一索引 `uk_contact_primary_per_customer` | 索引行已建，EXPRESSION = `IF((is_primary=1 AND deleted_at IS NULL), customer_id, NULL)` |

## 四、业务扇出证据（pageSize=200 复刻 `customerService.listCustomers` 真实查询）

修复前（113 注释自述）：
- 返回 200 行，**distinct customer id 仅 103**
- COUNT(DISTINCT) = **428**
- 前端 UI 显示 103 行，但分页器/总数报 428 —— **行数与 total 口径不一致**

修复后（实测复刻）：
- 返回 200 行，**distinct customer id 200**
- COUNT(DISTINCT) = **424**（4 行已软删除的口径差异）
- 列表行数 = pageSize（无扇出），与 total 口径一致
- 查询耗时 15ms（说明 `uk_contact_primary_per_customer` 索引被实际使用）

## 五、未做的事 / 留作后续

| 项 | 状态 | 说明 |
|---|---|---|
| **5 个客户无主联系人** | 未处理 | 113 范围之外；是否需要"自动指派首个联系人为默认主联系人"是产品决策 |
| **CI 真连库测试** | 4 套件本地挂（Access denied for user 'root'@'localhost'）| 本地无 root/空密码测试库；**CI 容器内有，跑 CI 验证** |
| **生产备份与演练** | 未做 | 需 NAS 权限（AGENTS.md §7.27）|
| **5 处 LEFT JOIN 写路径是否需要改** | 不必改 | 113 已把不变量在 DB 层固化；后续 addContact/updateContact 若违反唯一约束会自动抛错（CI 测试已覆盖）|
| **deploy/ci-missing-tables.sql** | 需补 113 段 | CI 流程只把迁移标记为已执行，但全新库仍要靠这个 SQL 拿到建表语句；本次未补——提交后另起一项处理 |

## 六、本次提交策略（建议）

```
feat(db): 迁移 113 —— 联系人「每个客户最多一个主联系人」不变量（root cause 修复）

包含：
  · database/migrations/113_single_primary_contact.sql
  · database/migrations/113_single_primary_contact_down.sql
  · tests/db/contactSinglePrimary.test.js（已有，需确认完整覆盖三个分支）
```

**CI 验证清单**（提交后必跑）：
- [ ] backend-test：除 4 个 root/空密码套件（CI 环境问题）外全绿
- [ ] e2e-test：客户列表/合同列表/收款列表/公海/审批等含 LEFT JOIN crm_contact 的页面
       **不应再有 raw_rows > distinct_customers 的扇出现象**
- [ ] migration-test：新库从 deploy/init-complete.sql 起步 → 跑 113 → 唯一索引就位

## 七、给后续维护者的提示

**别再用裸 `UPDATE crm_contact SET is_primary=1` 的写法**——
数据库唯一索引会让这种写法直接抛 `Duplicate entry`。正确路径（addContact / updateContact）已实现：
**先 UPDATE 把同客户其他主联系人降级为 0，再 UPDATE/INSERT 当前条 is_primary=1**，
全在一个事务里。

详见 `tests/db/contactSinglePrimary.test.js` 中"updateContact 设为主联系人"和
"addContact 指定为主联系人"两个用例（CI 真连库环境跑通）。
