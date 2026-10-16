# 迁移链完整性修复报告 · 2026-10-13

> 结论：**发现并修复 P0 级数据缺失** —— 测试库漏跑 7 个迁移，其中 2 张表缺失导致
> 生产代码必然 500。已补跑 + 补记账 + 加守卫测试。

---

## 一、发现的问题（P0）

### 缺口定位
`schema_migrations` 记到 113，`database/migrations/` 有 118 个文件，缺 **114、116、117、118、119、120、121**共 7 个。
（115 存在 → 是零散缺失，不是尾部截断。）

### 逐个核实：是「真缺失」还是「记账漂移」？
关键判断 —— 记账不齐**可能**只是没记上账、效果其实已落库。逐个查库验证后，
**7 个全部是真缺失**（效果均未落库）：

| 迁移 | 内容 | 修复前实测 | 影响 |
|---|---|---|---|
| 114 | `crm_contract_item` 表 | **表不存在**（ERROR 1146） | ⚠️ **P0** |
| 116 | `crm_approval_rule` 表 | **表不存在**（ERROR 1146） | ⚠️ **P0** |
| 117 | boss/manager 的 knowledge 权限 | 只有 sales/purchase | 权限缺失 |
| 118 | `api_platform` 权限码 | **不存在** | 路由不可用 |
| 119 | `log:delete` 权限码 | **不存在** | 按钮级权限缺失 |
| 120 | manager 权限追平 boss | manager **74** ≠ boss **98** | 差 24 个权限 |
| 121 | finance 报价 / sales 竞品权限 | 两个都**为空** | 403 风险 |

### 为什么是 P0
两张缺失的表**正被生产代码直接引用**，必然报 `ERROR 1146`：

| 代码位置 | 引用表 | 后果 |
|---|---|---|
| `backend/controllers/contractController.js:70-73` | `crm_contract_item` | **合同详情接口必然 500** |
| `backend/services/approvalService.js:188-194, 224-229` | `crm_approval_rule` | **审批规则查询必然 500** |
| `backend/routes/api-platform.js` | `api_platform` 权限码 | 菜单/路由权限异常 |

实测确认（修复前）：
```
ERROR 1146 (42S02): Table 'huakey_crm_test.crm_contract_item' doesn't exist
ERROR 1146 (42S02): Table 'huakey_crm_test.crm_approval_rule' doesn't exist
```

### 为什么长期没被发现
**因为这些代码路径没有测试覆盖。** 148 个套件、1495 个用例全绿也照样漏 ——
测试只在「被测路径被执行」时才有效，缺表不会主动报错，只在真调用时才炸。

### 为什么 CI 也抓不到
项目既定事实：**CI 建库走 `deploy/init-complete.sql`（并集终态）并标记全部迁移已执行，CI 从不跑迁移**。
所以「本地/测试库漏跑迁移」这一类缺陷 CI 天然抓不到。

---

## 二、修复动作

1. **备份**：`mysqldump` 全库 → `C:/Users/a8466/huakey_crm_test-backup-20261013.sql`（3.25 MB）
2. **补跑 7 个迁移**：全部执行成功（120/121 输出的是脚本自带的 SELECT 验证，非报错）
3. **补记账**：写 `schema_migrations` 6 条（119 文件自带记账，已由脚本写入）

### 修复后实测

| 项 | 修复前 | 修复后 |
|---|---|---|
| `schema_migrations` | 111 | **118**（与文件数一致，零缺失） |
| `crm_contract_item` | 不存在 | **存在**，查询成功 |
| `crm_approval_rule` | 不存在 | **存在**，查询成功 |
| knowledge 权限角色数 | 2（sales/purchase） | **9**（+boss/manager/finance/hr/engineer/purchaser） |
| `api_platform` | 不存在 | **存在** |
| `log:delete` | 不存在 | **存在** |
| manager vs boss 权限数 | 74 vs 98 | **105 vs 105**（追平） |
| finance quotation | 空 | **有** |
| sales competitor | 空 | **3 个码** |

---

## 三、新增守卫测试

`backend/tests/db/migrationGuard.test.js`（**10 用例**）—— 防同类问题复发：

| 守卫 | 作用 |
|---|---|
| 迁移文件 ↔ `schema_migrations` 双向一致 | 正向：每个文件都有记账；反向：没记账孤儿行 |
| 114/116 表可被**真实查询** | 不只查表存在，而是真发SQL（缺表会 ERROR 1146） |
| 118/119 权限码存在 | 锁住权限码 |
| 117 boss/manager 都持有 knowledge | 精确到角色 code，不用 roleId |
| 120 manager 权限数 == boss | 数量断言 |
| 121 finance 持quotation / sales 持 competitor | 锁住修复点 |

### 变异测试（证明真能抓到）
模拟「漏跑迁移」：`DELETE FROM schema_migrations WHERE version='121'` + `DROP TABLE crm_approval_rule`
→ **2 个用例报警**（迁移一致性 + crm_approval_rule 查询），精准命中。
恢复后 `schema_migrations` 118 条、表存在，完全还原。

---

## 四、测试与 lint

| 指标 | 修复前 | 修复后 |
|---|---|---|
| Test Suites | 148 通过 | **149 通过** |
| Tests | 1495 通过 | **1505 通过**（+10） |
| 失败 | 0 | **0** |
| `npm run lint` | exit 0 | **exit 0** |

补迁移 + 补记账后测试**仍全绿**，说明迁移内容与现有测试无冲突。

---

## 五、⚠️ 仍未验证 / 待办

### ⚠️ 5.1 生产库 `huakey_crm` 也有缺口（已实测，风险低于测试库）

| 项 | 测试库（已修） | **生产库** |
|---|---|---|
| `schema_migrations` | 111 → **118** | **116** |
| 缺失版本 | 114,116,117,118,119,120,121 | **仅 120,121** |
| `crm_contract_item` / `crm_approval_rule` | 已补建 | **都已存在** ✅ |
| 117/118/119 效果 | 已补| **都已落库** ✅ |
| manager vs boss 权限数 | 105 = 105 | **80 vs 103** ⚠️ |
| finance `quotation` | 有 | **0** ⚠️ |
| sales `competitor` | 3 个 | 2 个 |

**结论：生产库不会因缺表而 500**（P0 风险仅存在于测试库）。
但 **120/121 两个权限迁移在生产库未生效**，涉及两个待决问题（见 5.2）。

### ⚠️ 5.2 【需产品决策】权限来源冲突 —— 不要盲目跑 120/121

**冲突事实**：

| 来源 | 对 manager 的定位 |
|---|---|
|迁移 120 `manager_full_permissions` | 复制 **boss(role 1) 全部权限**（实测 105 = 105） |
| `init_role_permissions.js:250`（项目**权限唯一年事实源**） | manager 数据范围 = `dept_and_sub`，**不是全量** |
| `demo_roles.sql` / 既有实现 | manager/sales/hr/purchase/engineer `manage_all=0` |

也就是说：跑 120 会让 manager 获得 boss 的**全部功能权限**（含 `finance`、`competitor` 等 boss 专属域），
这与权限脚本的「manager 只管本部门+下级」定位**直接冲突**。

**我的判断**：不该盲目跑 120。需要你先明确：
1. manager 是否**应当**拥有 finance/competitor 等 boss 域的权限？
2. 若否，120 这条迁移的**设计本身**是否需要修正（而不是补跑）？

**同类问题**：`sys_role_permission` 只有 `role_id`，没有数据范围维度；
数据范围在 `sys_data_permission.data_scope`（项目记忆已记载此点）。
所以 120 只能改「功能权限」，**不能**用它去实现「manager 能看全公司数据」——
后者要靠 `data_scope` 配 `all`。

| 项 | 状态 |
|---|---|
| 迁移脚本 `run_migrations.js` 本机从未成功执行 | **仍未验证**（沙箱 EBUSY）。本轮是手工逐个执行 SQL 补的 |
| `deploy/init-complete.sql` 是否已含 `crm_contract_item` / `crm_approval_rule` | **未核实**。若基线缺这两张表，CI 建的库也会缺 → CI 同样会漏 |
| `crm_contract_item` / `crm_approval_rule` 的代码路径仍无业务测试 | 守卫只验表可查，**不验业务逻辑正确性** |
| 前端测试 | 本轮全在后端 |

### 下一步优先级建议
1. **【需决策】manager 权限范围**：120 迁移 vs 权限脚本冲突，需拍板（见 5.2）
2. **核实 `deploy/init-complete.sql`** 是否含两张新表（决定 CI 会不会同样漏）
3. 生产库 121（finance_quotation=0）可安全单独补跑 —— 该项无设计冲突
4. 工作区已累积 **39 项改动**，建议打checkpoint commit

---

## 六、复现命令

```bash
# 查缺口
mysql -u crm_test -ptest_pass -D huakey_crm_test -e "SELECT version FROM schema_migrations ORDER BY version;"
ls database/migrations/*.sql | grep -v _down | wc -l# 118

# 跑守卫
cd backend && node node_modules/jest/bin/jest.js --rootDir=. --coverage=false tests/db/migrationGuard.test.js

# 全量
node node_modules/jest/bin/jest.js --rootDir=. --coverage=false --testPathIgnorePatterns="/node_modules/"
```

**改动范围**：1 个新测试文件 + 测试库数据（7 个迁移 + 6 条记账）。
**无生产代码改动**、**无仓库内迁移文件改动**。