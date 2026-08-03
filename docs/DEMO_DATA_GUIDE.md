# HuakeyCRM Demo 数据体系 — 使用指南

> 版本：1.0 ｜ 更新日期：2026-08-03
> 配套审计报告：[DEMO_DATA_AUDIT.md](./DEMO_DATA_AUDIT.md)

---

## 一、Demo 数据用途

本体系提供一套**标准化、可识别、可清理**的演示数据，覆盖客户→联系人→商机→报价→合同→回款→供应商完整业务闭环，用于：

| 场景 | 说明 |
|---|---|
| 本地开发测试 | 一键生成完整业务链，无需手工造数据即可调试列表/详情/审批/回款等流程 |
| 测试环境验证 | 在 `huakey_crm_test` 库中加载，供集成测试/API 验证使用 |
| Playwright E2E 自动化测试 | 提供 `demo_admin` 等账号，测试代码通过 `.env.test` 读取，不硬编码 |
| 系统功能演示 | 给客户/新成员演示时，展示真实感的业务数据（350 万自动化生产线项目） |

**核心设计原则**：
- 所有 Demo 数据以 `is_demo = 1` 标识，与真实数据（`is_demo = 0`）严格隔离；
- 生产环境硬阻断：`NODE_ENV=production` 时 `seed:demo` 直接退出，绝不污染生产；
- 全部 seed SQL 幂等（`INSERT IGNORE` / `WHERE NOT EXISTS`），重复执行安全。

---

## 二、Demo 账号清单

三个 Demo 账号，密码统一为 `Demo@123456`（bcrypt 哈希存储）：

| 用户名 | 密码 | 角色 | 说明 |
|---|---|---|---|
| `demo_admin` | `Demo@123456` | super_admin | 管理员，绕过所有权限检查，E2E 默认使用 |
| `demo_sales` | `Demo@123456` | sales | 销售，Demo 客户负责人 |
| `demo_purchase` | `Demo@123456` | purchase | 采购，Demo 供应商负责人 |

> ⚠️ 这些账号仅由 `seed:demo` 在开发/测试环境创建，生产环境不会存在（脚本被硬阻断）。

---

## 三、Demo 业务数据清单

执行 `seed:demo` 后生成一条完整业务闭环：

```
demo_admin / demo_sales / demo_purchase（用户）
        │
        ▼
客户「广东华信汽车零部件有限公司」(status=signed, owner=demo_sales)
        ├── 联系人「陈志明」(采购经理, 主联系人, 决策人)
        ├── 跟进记录 5 条（电话/拜访/方案汇报/合同签订/跟进计划，驱动状态机）
        ├── 商机「2026年华信汽车自动化生产线升级项目」(expected_amount=3,500,000)
        │       └── 报价「QT-202607001」(3 项产品, final_amount=3,500,000, 审批通过)
        │              ├── 自动化输送生产线  1,800,000
        │              ├── 视觉检测系统      800,000
        │              └── MES数据采集模块   900,000
        ├── 合同「HT-202609001」(amount=3,500,000, sign_date=2026-09-01, 审批通过)
        │       └── 回款计划 3 期：
        │              ├── 第1期 1,050,000 (30% 预付，已收)
        │              ├── 第2期 2,100,000 (60% 验收，待收)
        │              └── 第3期   350,000 (10% 质保，未到期)
        │              └── 回款记录：第1期 1,050,000 已到账
        └── 供应商「佛山精工自动化有限公司」(owner=demo_purchase, A级, rating=4.5)
```

---

## 四、如何初始化

### 4.1 前置条件

1. MySQL 8.0 已运行，`huakey_crm`（或 `huakey_crm_test`）库已创建；
2. 基线 schema 已导入（`deploy/init-complete.sql` 或迁移已执行到 095）；
3. **迁移 095 已执行**（为核心 12 表添加 `is_demo` 列）：
   ```bash
   cd database/migrations && node run_migrations.js
   ```
   若仅执行单条迁移：
   ```bash
   mysql -u root -p huakey_crm < database/migrations/095_demo_flag.sql
   ```

### 4.2 执行 seed:demo

**方式 A：npm 脚本（推荐）**

```bash
cd backend
npm run seed:demo
```

脚本会自动从 `backend/.env` 读取 DB 配置（也可被进程环境变量覆盖），按依赖顺序执行 10 个 seed 文件，并输出汇总验证。

**方式 B：手动执行 SQL**

```bash
mysql -u root -p huakey_crm < database/seeds/demo_all.sql
```

> 注意：`demo_all.sql` 内部使用 `SOURCE` 指令，需在 mysql 客户端中执行（非管道），且当前工作目录需为 `database/seeds/`。

### 4.3 环境变量

`seed:demo` 脚本读取以下环境变量（默认从 `backend/.env`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` | 127.0.0.1 | MySQL 主机 |
| `DB_PORT` | 3306 | MySQL 端口 |
| `DB_USER` | root | MySQL 用户 |
| `DB_PASSWORD` | (空) | MySQL 密码 |
| `DB_NAME` | huakey_crm | 目标库名 |
| `NODE_ENV` | (空) | `production` 时硬阻断 |

### 4.4 验证初始化结果

执行后脚本会自动输出各表 Demo 数据条数汇总。也可手动校验：

```sql
SELECT
  (SELECT COUNT(*) FROM sys_user WHERE is_demo=1) AS demo_users,
  (SELECT COUNT(*) FROM crm_customer WHERE is_demo=1) AS demo_customers,
  (SELECT COUNT(*) FROM crm_quote WHERE is_demo=1) AS demo_quotes,
  (SELECT COUNT(*) FROM crm_contract WHERE is_demo=1) AS demo_contracts;
```

预期：3 用户 / 1 客户 / 1 报价 / 1 合同 / 3 回款计划 / 1 供应商 / 5 跟进。

---

## 五、如何清理

### 5.1 一键清理脚本

```bash
mysql -u root -p huakey_crm < database/seeds/demo_cleanup.sql
```

`demo_cleanup.sql` 按 `is_demo = 1` 精准过滤，子表优先删除，**绝不触碰真实数据**。脚本自带生产库保护（库名含 `prod` 时中止）。

### 5.2 手动清理单表

如仅需清理部分数据：

```sql
-- 仅清理 Demo 报价单及其报价项
DELETE FROM crm_quote_item WHERE quote_id IN (SELECT id FROM crm_quote WHERE is_demo=1);
DELETE FROM crm_quote WHERE is_demo = 1;

-- 仅禁用 Demo 用户（不删除，保留账号占位）
UPDATE sys_user SET status = 0 WHERE is_demo = 1;
```

### 5.3 清理后验证

```sql
-- 应全部返回 0
SELECT COUNT(*) FROM sys_user WHERE is_demo=1;
SELECT COUNT(*) FROM crm_customer WHERE is_demo=1;
SELECT COUNT(*) FROM crm_contract WHERE is_demo=1;
```

---

## 六、生产环境注意事项

🔴 **绝对禁止在生产环境执行 `seed:demo`**

体系提供三层防护：

| 防护层 | 机制 | 位置 |
|---|---|---|
| 1. 环境阻断 | `NODE_ENV=production` 时脚本直接 `exit(1)`，提示 "Production environment cannot load demo data" | `backend/scripts/seed-demo.js` |
| 2. 库名阻断 | 目标库名含 `prod`（且不含 test/dev/demo）时中止 | `backend/scripts/seed-demo.js` |
| 3. 数据标识 | 所有 Demo 数据 `is_demo=1`，即使误入生产也可精准识别与清理 | `database/migrations/095_demo_flag.sql` |

**生产部署检查清单**：
- [ ] `.env` 中 `NODE_ENV=production`
- [ ] 生产 Docker 容器未映射 `backend/scripts/seed-demo.js` 执行入口
- [ ] CI/CD 流水线仅在 test 库执行 seed:demo（`DB_NAME=huakey_crm_test`）
- [ ] 若怀疑误入：`SELECT COUNT(*) FROM sys_user WHERE is_demo=1;` 快速排查

---

## 七、E2E 如何使用

### 7.1 账号配置（`.env.test`）

仓库根目录 `.env.test`（已纳入版本管理，Demo 密码公开无敏感性）：

```env
E2E_ADMIN_USER=demo_admin
E2E_ADMIN_PASSWORD=Demo@123456
E2E_SALES_USER=demo_sales
E2E_SALES_PASSWORD=Demo@123456
E2E_PURCHASE_USER=demo_purchase
E2E_PURCHASE_PASSWORD=Demo@123456
# 兼容旧变量名
E2E_USERNAME=demo_admin
E2E_PASSWORD=Demo@123456
```

模板：`.env.test.example`（复制即用：`cp .env.test.example .env.test`）

### 7.2 自动加载机制

`frontend/playwright.config.js` 启动时自动加载 `.env.test` 到 `process.env`（不覆盖 CI 已注入的值）。测试代码通过环境变量读取账号，**无任何硬编码**：

```js
// frontend/e2e/fixtures/auth.js
function getAdminCredentials() {
  const username = process.env.E2E_ADMIN_USER || process.env.E2E_USERNAME
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD
  if (!username || !password) {
    throw new Error('E2E 测试账号未配置：缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD ...')
  }
  return { username, password }
}
```

### 7.3 本地运行 E2E

```bash
# 1. 确保 test 库已就绪并加载 Demo 数据
#    start-e2e-server.mjs 会自动执行迁移 + seed_test_data + seed:demo
cd frontend
npx playwright test --project=chromium
```

`frontend/scripts/start-e2e-server.mjs` 在本地启动测试环境时会自动调用 `seed:demo`，确保 `demo_admin` 等账号存在。

### 7.4 CI 中运行 E2E

CI 流水线（`.github/workflows/ci.yml` 的 `e2e-test` / `cross-browser-test` job）在基线 schema 就绪后，显式执行 seed:demo：

```yaml
- name: Load Demo seed data (demo_admin / demo_sales / demo_purchase)
  run: cd backend && DB_NAME=huakey_crm_test DB_USER=root DB_PASSWORD=test_root_pass \
       DB_HOST=127.0.0.1 DB_PORT=3306 npm run seed:demo
```

随后 Playwright 通过 `.env.test`（已提交）的 `E2E_ADMIN_USER=demo_admin` 登录测试。

### 7.5 按角色测试（扩展）

需要测试销售/采购视角时，从对应变量读取：

```js
const salesUser = {
  username: process.env.E2E_SALES_USER,
  password: process.env.E2E_SALES_PASSWORD
}
```

---

## 八、文件索引

| 文件 | 用途 |
|---|---|
| [database/migrations/095_demo_flag.sql](../database/migrations/095_demo_flag.sql) | 为核心 12 表添加 `is_demo` 列 |
| [database/migrations/095_demo_flag_down.sql](../database/migrations/095_demo_flag_down.sql) | 回滚 `is_demo` 列 |
| [database/seeds/demo_roles.sql](../database/seeds/demo_roles.sql) | 补齐角色/部门/货币基线 |
| [database/seeds/demo_users.sql](../database/seeds/demo_users.sql) | 3 个 Demo 账号 |
| [database/seeds/demo_customers.sql](../database/seeds/demo_customers.sql) | 客户 + 5 条跟进 |
| [database/seeds/demo_contacts.sql](../database/seeds/demo_contacts.sql) | 联系人 |
| [database/seeds/demo_products.sql](../database/seeds/demo_products.sql) | 3 个产品 |
| [database/seeds/demo_opportunities.sql](../database/seeds/demo_opportunities.sql) | 商机 |
| [database/seeds/demo_quotes.sql](../database/seeds/demo_quotes.sql) | 报价单 + 报价项 |
| [database/seeds/demo_contracts.sql](../database/seeds/demo_contracts.sql) | 合同 |
| [database/seeds/demo_payments.sql](../database/seeds/demo_payments.sql) | 回款计划 + 回款记录 |
| [database/seeds/demo_suppliers.sql](../database/seeds/demo_suppliers.sql) | 供应商 |
| [database/seeds/demo_all.sql](../database/seeds/demo_all.sql) | 聚合入口（按依赖顺序） |
| [database/seeds/demo_cleanup.sql](../database/seeds/demo_cleanup.sql) | 清理脚本（is_demo=1） |
| [backend/scripts/seed-demo.js](../backend/scripts/seed-demo.js) | Node 执行器（环境阻断 + 汇总） |
| [.env.test](../.env.test) | E2E 账号环境变量 |
| [.env.test.example](../.env.test.example) | 账号配置模板 |

---

## 九、快速开始

```bash
# 1. 应用迁移（添加 is_demo 列）
cd database/migrations && node run_migrations.js

# 2. 加载 Demo 数据
cd backend && npm run seed:demo

# 3. 启动后端 + 前端
cd backend && npm run dev   # 端口 5000
cd frontend && npm run dev  # 端口 5173

# 4. 用 demo_admin / Demo@123456 登录系统

# 5. 清理 Demo 数据（如需）
mysql -u root -p huakey_crm < database/seeds/demo_cleanup.sql
```

---

## 十、常见问题

**Q1：重复执行 `seed:demo` 会怎样？**
A：所有 seed SQL 幂等，重复执行会跳过已存在记录，不报错、不覆盖。

**Q2：Demo 数据会出现在生产报表里吗？**
A：不会。生产环境 `seed:demo` 被硬阻断，Demo 数据不存在；且报表查询可加 `WHERE is_demo=0` 过滤（需报表层适配）。

**Q3：`demo_all.sql` 执行报错 "Unknown column 'is_demo'"？**
A：未执行迁移 095。先 `mysql -u root -p huakey_crm < database/migrations/095_demo_flag.sql`。

**Q4：E2E 登录失败 "E2E 测试账号未配置"？**
A：检查仓库根目录是否存在 `.env.test`（可从 `.env.test.example` 复制），且已执行 `seed:demo` 创建账号。

**Q5：CI 中 E2E 失败 "demo_admin 不存在"？**
A：确认 ci.yml 的 e2e-test job 中 `Load Demo seed data` 步骤在 Playwright 之前执行，且 `ci-missing-tables.sql` 已包含 is_demo 列定义。

---

*如需了解表结构审计、主外键关系、风险点等设计细节，请参阅 [DEMO_DATA_AUDIT.md](./DEMO_DATA_AUDIT.md)。*
