# 安全修复真库 E2E 验证报告 · 2026-10-13

> 结论：把 5 项安全修复（C-001/H-003/H-004/H-005/M-008）从 **mock 层升级到真库 E2E**，
> 新增 `tests/db/securityFixesE2E.test.js`（14 用例，MySQL 实连），**基线五张表零变化**。

---

## 一、成果

| 指标 | 上一轮（仅 mock） | 本轮（真库 E2E） |
|---|---|---|
| Test Suites | 147 通过 | **148 通过** |
| Tests | 1481 通过 | **1495 通过**（+14） |
| 失败 | 0 | **0** |
| 安全用例覆盖层 | mock + 静态解析 | **mock + 真库实连** |

全量：**148/148 套件、1495/1495 用例通过**，`eslint --max-warnings=0` 0 warning。

---

## 二、真库验证了什么（mock 层**无法**覆盖的部分）

| 验证项 | mock 层结论 | 真库实测结论 |
|---|---|---|
| `type=all` clause | 无法验证 | `1=1` 真库可执行，未误过滤 ✅ |
| `type=self` 隔离 | 只能断言 clause 含 `owner_id` | **实测：本人客户可见、他人客户查不到** ✅ |
| `type=dept` 含子查询的 clause | 无法验证 | **MySQL 接受，语法正确** ✅ |
| `type=dept_and_sub`（`getSubDeptIds` 展开） | 无法验证 | **MySQL 接受** ✅ |
| `create_by=self` 报价权限 | 无法验证 | **实测：他人报价一条都查不出** ✅ |
| `sys_role.code` 与库内数据一致 | 无法验证 | 库内确有 sales/manager/boss/hr 等 code ✅ |
| M-008 HR 接收人应被拒 | 仅断言错误文案 | **真库 HR 用户作接收人 → 确认抛错** ✅ |
| C-001 注入串是否真能改写列名 | 仅断言生成 SQL 形态 | **插入恶意 label 报表 → 真库跑 runReport 验列名** ✅ |

---

## 三、过程中修掉的 3 个自身缺陷（诚实记录）

### ① information_schema 列名大小写
初版查表存在性用 `SELECT table_name`，但 **MySQL 8 的列名是大写 `TABLE_NAME`**，
按小写取得到 `undefined` → 误判「缺表」→ 12 个用例全灭。

修法：`SELECT TABLE_NAME AS tname FROM information_schema.TABLES`（加 `AS` 别名）。

### ② 表结构臆测
`insertUserWithRole` 写了 `department` 列，实际是 `dept_id`；且 `password` 为 NOT NULL 未给值。
→ `Unknown column 'department'`。

**这正是项目记忆里反复强调的坑**：写 SQL 前必须查真实表结构，不能凭直觉。

### ③ C-001 用例是「空转」的（最值得记的一条）
初版 C-001 用例**自己拼 SQL 验证清洗后的别名**，根本没调用生产代码 —— 测了个寂寞。
重写为：插入带恶意 label 的 `crm_report_config` → 调 `runReport` → 真库执行 → 验结果列名。

**且重写后仍不够强**：变异 `sanitizeLabel` 只抓到 1 个用例。原因是注入串
`` x` , (SELECT 1) AS `y `` 拼进 SQL 后**恰好仍是合法语法**，不会报错。
改用 `z\` AS \`injected` + 断言**结果列名必须是 `col`**，变异后抓到 2 个。

> **教训：断言「没报错」远弱于断言「结果正确」。**
> 安全测试必须断言**攻击后的可见效果**，而不是攻击没造成可见破坏。

---

## 四、两个测试卫生问题（已修）

| 问题 | 现象 | 修法 |
|---|---|---|
| **env 未预置** | `permission.js:1` 模块加载即建池，用默认 `root`/空密码 → `Access denied` | 在 `require` 应用模块**之前** `process.env.DB_* = ...` |
| **连接池未关闭** | require 了应用模块 → jest 挂住，被 `SIGTERM` 杀掉 | `afterAll` 里 `await appPool.end()`，**无需 `--forceExit`** |

---

## 五、变异测试（证明真库 E2E 真能抓回退）

| 变异内容 | 报警用例数 | 判定 |
|---|---|---|
| `buildDataPermissionWhere` 的 `self` 分支 → `clause: 1=1`（隔离完全失效） | **2** | PASS |
| `sanitizeLabel` 去掉白名单校验 | **2** | PASS |

> ⚠️ 变异后均已 `grep` 确认生效，并确认恢复后 `grep -rn MUTATION` 全库零残留、
> `git diff` 为空（源文件完全复原）。

---

## 六、基线快照（项目铁律：DB 触碰类测试必须证明基线零变化）

测试前后对 5 张表做计数快照：

| 表 | 测试前 | 测试后 |
|---|---|---|
| `crm_customer` | 429 | **429** |
| `crm_quote` | 1 | **1** |
| `sys_user` | 27 | **27** |
| `sys_role` | 9 | **9** |
| `crm_customer_transfer` | 0 | **0** |
| `crm_report_config`（本轮新增使用） | 0 | **0** |

**diff 结果：零变化。** 清理逻辑严格按**主键**删除（`tempCustomers` / `tempUsers` / `reportId`），
绝不按业务键（`code` / `name`）删。

---

## 七、⚠️ 仍未验证（如实标注）

| 项 | 状态 |
|---|---|
| **迁移脚本 `run_migrations.js` 本机从未成功执行过** | **未验证**。沙箱禁止子进程（EBUSY），测试库结构是既有状态（111 条 `schema_migrations`） |
| **`schema_migrations` 111 条 vs 迁移文件 118 个，差 7 个** | **未核实**。可能有意跳过，也可能是漂移 |
| 5 个 e2e 套件仍是在**跳过迁移**前提下通过 | 若迁移真跑起来改变结构，用例表现可能不同 |
| C-001 只验证了 `runReport` 单条路径 | `createReport` / `updateReport` 写入侧未验证（写入不涉 SQL 拼接，风险低） |
| H-004（报价转合同）的真库路径 | 本轮覆盖了 `getQuote` 的 clause 过滤，**未跑完整转合同事务** |
| 前端测试未涉及 | 本轮全在后端 |

**下一优先级建议**：
1. 核实 7 个迁移文件的差口（111 vs 118）—— 这是**数据正确性**问题，比测试覆盖更值得先查
2. 打通子进程限制后跑一次完整迁移链 `roundtrip` 测试
3. 按你的习惯打 checkpoint commit（当前工作区已有 30 个改动文件累积）

---

## 八、复现命令

```bash
# 需先建账号（2026-10-09 已执行）
# mysql -u root -p -e "CREATE USER 'crm_test'@'localhost' IDENTIFIED BY 'test_pass';
#   GRANT ALL PRIVILEGES ON huakey_crm_test.* TO 'crm_test'@'localhost';"

# 单跑本文件
cd backend && node node_modules/jest/bin/jest.js --rootDir=. --coverage=false tests/db/securityFixesE2E.test.js

# 全量
node node_modules/jest/bin/jest.js --rootDir=. --coverage=false --testPathIgnorePatterns="/node_modules/"
```

**本轮仅新增 1 个文件，无生产代码改动、无数据库结构变更。**