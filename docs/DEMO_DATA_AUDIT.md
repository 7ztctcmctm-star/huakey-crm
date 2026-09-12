# HuakeyCRM Demo 数据体系 — 数据库结构审计报告

> 审计日期：2026-08-03
> 审计范围：12 类核心业务表 + 现有 seed/demo 机制
> 审计目的：为「标准 Demo 数据初始化体系」提供 schema 基线与风险识别

---

## 一、审计结论概览

| 维度 | 结论 |
|---|---|
| 业务链完整性 | ✅ 客户→联系人→商机→报价→报价项→产品 / 合同→回款计划→回款 / 跟进 全链外键就绪 |
| Demo 标识机制 | ❌ 当前无任何 `is_demo` / `data_source` / `is_test` 字段（仅 `crm_report_config.data_source` 无关） |
| 角色/部门基线 | ⚠️ 测试库仅 4 个角色（ADMIN/MANAGER/SALES/super_admin），缺 HR/PURCHASE/FINANCE/ENGINEER/BOSS；部门表为空；货币表为空 |
| 现有 seed 机制 | 🟡 `seed_test_data.sql`（配置导出）+ `test_data_modules.sql`（模块验证）+ `init_role_permissions.js`，但无统一 demo 体系 |
| 生产数据污染风险 | 🔴 必须引入标识机制 + 环境保护，否则 demo 数据混入生产无法区分 |

---

## 二、核心表结构（12 类）

### 2.1 用户表 `sys_user`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK AUTO | 用户ID |
| username | varchar(50) UNI | 登录名 |
| password | varchar(255) | bcrypt 哈希 |
| real_name | varchar(50) | 真实姓名 |
| phone / email | varchar | 联系方式 |
| dept_id | int FK→sys_dept | 部门 |
| role_id | int FK→sys_role | 角色 |
| status | tinyint | 1=启用 0=禁用 |
| manager_id | int FK→sys_user | 直属上级 |
| must_change_password | tinyint | 1=需改密 |
| password_changed_at | datetime | 密码修改时间 |
| deleted_at | datetime | 软删除 |

### 2.2 角色权限表

| 表 | 关键字段 | 说明 |
|---|---|---|
| `sys_role` | id, name, **code**(UNI), view_all, manage_all, status | 角色（code 为业务标识） |
| `sys_permission` | id, name, **code**(UNI), type(menu/button/api), parent_id, path | 权限点 |
| `sys_role_permission` | role_id, permission_id | 角色-权限关联 |
| `sys_data_permission` | role_id, module, data_scope(all/dept_and_sub/dept/self/custom) | 数据范围 |
| `crm_user_permission` | user_id, permission_id | 用户级权限覆盖 |
| `sys_dept` | id, name, parent_id, sort | 部门树 |

**角色现状**（测试库基线）：
```
id=1  code=ADMIN        (系统管理员)
id=2  code=MANAGER      (部门经理)
id=3  code=SALES        (销售)
id=11 code=super_admin  (超级管理员)
```
⚠️ 缺少 HR/PURCHASE/FINANCE/ENGINEER/BOSS。`backend/config/roles.js` 的 `ROLE_CODES` 定义了完整 8 种角色 code（super_admin/admin/boss/sales/hr/purchase/finance/engineer），Demo seed 需补齐。

### 2.3 客户表 `crm_customer`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| company_name | varchar(200) | 公司名称 |
| contact_name / phone / email | varchar | 主联系人冗余 |
| industry / source / level | varchar | 行业/来源/等级 |
| owner_id | int FK→sys_user | 负责人（NULL=公海） |
| status | varchar(32) | **状态机**：lead/sea/following/quoted/negotiating/signed/lost/paused |
| customer_type | varchar(20) | prospect/... |
| pool_status | tinyint | 公海缓存（以 owner_id IS NULL 为准） |
| last_follow_time | datetime | 最后跟进时间 |
| original_lead_id | int | 线索来源 |
| deleted_at | datetime | 软删除 |

### 2.4 联系人表 `crm_contact`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| customer_id | int FK→crm_customer | 所属客户 |
| name / position / phone / email / wechat | varchar | 联系信息 |
| is_decision | tinyint | 是否决策人 |
| is_primary | tinyint | 是否主联系人 |
| deleted_at | datetime | 软删除 |

### 2.5 商机表 `crm_opportunity`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| customer_id | int FK→crm_customer | |
| name | varchar(200) | 商机名称 |
| expected_amount | decimal(15,2) | 预期金额 |
| expected_date | date | 预计成交日 |
| stage | tinyint | 阶段 1-N |
| win_rate | tinyint | 赢率 |
| owner_id | int FK→sys_user | |
| deleted_at | datetime | |

### 2.6 跟进记录表 `crm_follow_up`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| customer_id | int FK→crm_customer | |
| contact_id | int FK→crm_contact | |
| follow_type | varchar(20) | 跟进类型（电话/拜访/邮件/...） |
| content | text | 跟进内容 |
| next_time / next_content | datetime/varchar | 下次跟进 |
| create_by | int FK→sys_user | |
| is_plan | tinyint | 0=实际跟进 1=跟进计划 |
| plan_status | varchar(20) | pending/completed/overdue/cancelled |
| finish_time | datetime | 计划完成时间 |
| deleted_at | datetime | |

### 2.7 产品表 `crm_product`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| name | varchar(200) | |
| code | varchar(50) UNI | 产品编码 |
| category / unit | varchar | 分类/单位 |
| price | decimal(15,2) | 售价 |
| cost_price | decimal(15,2) | 成本价（**敏感字段**） |
| stock | int | 库存 |
| status | tinyint | 1=启用 |
| deleted_at | datetime | |

### 2.8 报价表 `crm_quote` + `crm_quote_item`

**crm_quote**：
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| quote_no | varchar(50) UNI | 报价单号 |
| customer_id | int FK→crm_customer | |
| opportunity_id | int FK→crm_opportunity | |
| amount / discount / final_amount | decimal | 总额/折扣/最终额 |
| currency / exchange_rate | | 币种/汇率 |
| status | tinyint | 1=草稿 2=已发送 3=已确认 4=已失效 |
| approval_status | tinyint | 1=待审批 2=通过 3=拒绝 |
| approver_id | int | 审批人 |
| create_by | int FK→sys_user | |
| deleted_at | datetime | |

**crm_quote_item**：quote_id FK→crm_quote, product_id FK→crm_product, product_name, quantity, unit_price, total_price

### 2.9 合同表 `crm_contract`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| contract_no | varchar(50) UNI | 合同号 |
| customer_id | int FK→crm_customer | |
| opportunity_id | int FK→crm_opportunity | |
| quote_id | int FK→crm_quote | 来源报价 |
| amount | decimal(15,2) | 合同金额 |
| sign_date / delivery_date | date | 签订/交付日 |
| payment_terms | varchar(500) | 付款条款 |
| status | tinyint | 1=执行中 ... |
| approval_status | tinyint | 审批状态 |
| create_by | int FK→sys_user | |
| deleted_at | datetime | |

### 2.10 回款表 `crm_payment_plan` + `crm_payment`

**crm_payment_plan**：
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| contract_id | int FK→crm_contract | |
| plan_date | date | 计划回款日 |
| plan_amount | decimal(15,2) | 计划金额 |
| status | enum | pending/partial/completed/overdue |
| paid_amount | decimal(15,2) | 已回金额 |
| overdue_days | int | 逾期天数 |
| create_time / update_time | datetime | （迁移 094 补齐） |

**crm_payment**：contract_id FK→crm_contract, plan_id FK→crm_payment_plan, pay_date, pay_amount, pay_method

### 2.11 供应商表 `crm_supplier`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| supplier_no | varchar(50) | 供应商编号 |
| name | varchar(200) UNI | 名称 |
| type | enum | 类型（原材料/设备/服务） |
| level | enum | 等级（A/B/C/D） |
| contact_person / contact_phone / contact_email | varchar | 联系方式（**contact_phone/email 敏感字段**） |
| rating | decimal(2,1) | 评分 |
| owner_id | int FK→sys_user | |
| create_by | int FK→sys_user | |
| deleted_at | datetime | |

### 2.12 审批流程表 + 附件表

**审批**：
- `crm_approval_workflow`：id, name, type(quote/contract/purchase/discount), status, create_by
- `crm_approval_step`：workflow_id FK, step_order, step_name, approver_type(user/role/dept), approver_id FK→sys_user, is_required
- `crm_approval_record`：workflow_id FK, business_type, business_id, step_id FK, approver_id FK→sys_user, status(pending/approved/rejected)

**附件** `crm_attachment`：id, business_type, business_id, file_name, file_path, file_size, file_type, create_by

**货币** `crm_currency`：code(UNI), name, symbol, exchange_rate, is_default, status

---

## 三、主外键关系图（业务链）

```
sys_dept ←── sys_user (dept_id)
              │
              ├── manager_id ──→ sys_user (自引用，直属上级)
              ├── role_id ──→ sys_role ←── sys_role_permission ──→ sys_permission
              │
              ▼ (owner_id / create_by)
         crm_customer ──┬── crm_contact (customer_id)
                         ├── crm_opportunity (customer_id) ──┬── crm_quote (opportunity_id)
                         │                                   └── crm_contract (opportunity_id)
                         ├── crm_follow_up (customer_id, contact_id, create_by)
                         │
                         ├── crm_quote (customer_id, create_by)
                         │      └── crm_quote_item (quote_id) ──→ crm_product (product_id)
                         │
                         ├── crm_contract (customer_id, quote_id, create_by)
                         │      ├── crm_payment_plan (contract_id)
                         │      │      └── crm_payment (plan_id)
                         │      ├── crm_payment (contract_id)
                         │      ├── crm_attachment (business_type, business_id)
                         │      └── crm_approval_record (business_type, business_id)
                         │
                         └── crm_attachment (business_type, business_id)

         crm_supplier (owner_id, create_by ──→ sys_user)
         crm_approval_workflow (create_by) ── crm_approval_step (workflow_id, approver_id)
```

---

## 四、Demo 数据需覆盖的业务闭环

```
demo_admin / demo_sales / demo_purchase (用户)
        │
        ▼
部门（Demo 部门）→ 角色补齐（boss/sales/purchase/finance/engineer）
        │
        ▼
客户「广东华信汽车零部件有限公司」(status=signed)
        ├── 联系人「陈志明」(采购经理, is_primary=1, is_decision=1)
        ├── 商机「2026年华信汽车自动化生产线升级项目」(expected_amount=3500000)
        │       └── 报价「QT-202607001」(3 项产品, final_amount=3500000, approval_status=通过)
        │              ├── 自动化输送生产线 1800000
        │              ├── 视觉检测系统 800000
        │              └── MES数据采集模块 900000
        ├── 合同「HT-202609001」(amount=3500000, sign_date, status=执行中)
        │       └── 回款计划（3 期：30% 已收 / 60% 待收 / 10% 未到期）
        │              └── 回款记录（第 1 期 1050000 已收）
        ├── 跟进记录（5 条，含实际跟进 + 计划）
        └── 供应商「佛山精工自动化有限公司」(独立关联，owner_id=demo_purchase)
```

---

## 五、缺少字段分析

### 5.1 Demo 标识字段（核心缺失）

| 表 | 缺失字段 | 建议方案 |
|---|---|---|
| sys_user | is_demo | TINYINT(1) DEFAULT 0 |
| crm_customer | is_demo | TINYINT(1) DEFAULT 0 |
| crm_contact | is_demo | TINYINT(1) DEFAULT 0 |
| crm_opportunity | is_demo | TINYINT(1) DEFAULT 0 |
| crm_follow_up | is_demo | TINYINT(1) DEFAULT 0 |
| crm_product | is_demo | TINYINT(1) DEFAULT 0 |
| crm_quote | is_demo | TINYINT(1) DEFAULT 0 |
| crm_contract | is_demo | TINYINT(1) DEFAULT 0 |
| crm_payment_plan | is_demo | TINYINT(1) DEFAULT 0 |
| crm_payment | is_demo | TINYINT(1) DEFAULT 0 |
| crm_supplier | is_demo | TINYINT(1) DEFAULT 0 |
| crm_approval_workflow | is_demo | TINYINT(1) DEFAULT 0 |

**选型决策**：采用 `is_demo TINYINT(1) DEFAULT 0`（而非 `data_source`），原因：
1. 布尔语义清晰，查询简单 `WHERE is_demo=1`；
2. 索引体积小；
3. 不与现有 `crm_report_config.data_source` 语义混淆；
4. 可加复合索引 `(deleted_at, is_demo)` 加速过滤。

### 5.2 基线数据缺失（测试库现状）

| 缺失项 | 影响 | 补充方式 |
|---|---|---|
| HR/PURCHASE/FINANCE/ENGINEER/BOSS 角色 | demo_purchase 无角色可分配 | demo_roles.sql 用 INSERT IGNORE 补齐 |
| sys_dept 部门数据 | 用户无部门归属 | demo_roles.sql 补 Demo 部门；**test_data_modules.sql 亦已自带（N-04，2026-09-12）** |
| crm_currency 货币数据 | 报价/合同 currency 外键无值 | demo_roles.sql 补 CNY/USD 货币 |

---

## 六、风险点与应对

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| R1 | Demo 数据混入生产，无法区分清理 | 🔴 高 | 引入 `is_demo` 字段 + 迁移 095；生产环境 seed 脚本硬阻断 |
| R2 | 生产环境误执行 seed 覆盖真实用户 | 🔴 高 | `NODE_ENV=production` 时脚本直接退出；账号 INSERT IGNORE 幂等 |
| R3 | quote_no / contract_no UNIQUE 冲突 | 🟡 中 | Demo 用固定前缀 `DEMO-QT-` / `DEMO-HT-`，避免与真实单号冲突 |
| R4 | 审批记录 approver_id 外键约束 | 🟡 中 | approver_id 必须指向已存在的 demo 用户 |
| R5 | 客户 status 状态机校验 | 🟡 中 | Demo 客户直接设 `signed` 终态，不触发流转校验 |
| R6 | 敏感字段（cost_price/bank_account） | 🟡 中 | Demo 数据用脱敏占位值，不真实财务数据 |
| R7 | 密码哈希一致性 | 🟡 中 | 统一用 bcrypt(Demo@123456)，与现有 `authService` 兼容 |
| R8 | 软删除 deleted_at 干扰 | 🟢 低 | Demo 数据 deleted_at=NULL，清理时单独 UPDATE |
| R9 | 公海池 owner_id 语义 | 🟢 低 | Demo 客户 owner_id=demo_sales（非 NULL，非公海） |
| R10 | E2E 账号硬编码 | 🟡 中 | 改用 `.env.test` 环境变量，fixtures 从 env 读取 |

---

## 七、现有 seed/demo 机制盘点

| 文件/脚本 | 用途 | 复用价值 |
|---|---|---|
| `database/seeds/seed_test_data.sql` | 从 prod 导出配置（角色/权限/部门/admin 用户），有库名校验 | ✅ 环境保护逻辑可复用 |
| `database/seeds/test_data_modules.sql` | 模块验证测试数据（老板/销售/客户/跟进/商机） | 🟡 业务数据参考；**2026-09-12 已修复至当前 schema**（见下） |
| `backend/scripts/init_role_permissions.js` | 角色权限初始化 | ✅ 角色补齐参考 |
| `.github/ci/test-users.sql` | CI 测试用户（admin，密码 huakey123） | 🟡 与 demo 账号体系独立 |
| `frontend/e2e/fixtures/api-helpers.js` | E2E 默认账号（E2E_USERNAME/E2E_PASSWORD env） | ✅ 已支持 env，需补 .env.test |
| `deploy/init-complete.sql` | 生产初始化 DDL+DML（含 admin 用户） | ✅ schema 基线 |

**结论**：现有机制分散，无统一 demo 标识，无环境隔离。需建立标准化 `database/seeds/demo_*.sql` 体系 + `npm run seed:demo` 执行器 + 生产环境保护。

> **2026-09-12 补充：`test_data_modules.sql` schema 漂移已修复**
>
> 该文件是**手工执行**的历史 seed，不被任何脚本引用（`grep` 实证：仅出现在文档中）。
> 实测它整体停留在旧 schema，四个问题：
>
> | # | 问题 | 修复 |
> |---|---|---|
> | 1 | 第 12 行 `USE huakey_crm;` 硬编码库名，与自带的「非 test/dev 库则中止」守卫自相矛盾，且违反迁移规范（禁止 USE） | 已移除，改以连接默认库为准 |
> | 2 | 8 处 `INSERT INTO crm_customer` 的 `status` 用**数字 1/2** —— 迁移 070 已把该列改为 `VARCHAR(32) NOT NULL DEFAULT 'following'`，数字是旧格式 | 按 070 的权威映射改为字符串（1→`following`、2→`signed`） |
> | 3 | 全部漏写 `business_status`（097 定义 `NOT NULL DEFAULT 'lead'`）→ 客户全被压成 `lead`，被 `listFormalCustomers` 整体过滤，**列表恒为空**（与演示 seed 的 `7620c2c` 同源缺陷） | 显式写入，与 `status` 一致 |
> | 4 | 全部漏写 `pool_status` | 显式写入 `'private'`（这些客户均有 owner） |
>
> **为什么问题 3 必须连同问题 2 一起修**：迁移 110（`sync_customer_business_status`）确立
> 了「`status` 为权威、`business_status` 镜像 `status`」的对账规则，其 `WHERE status IN
> ('lead','following',...)` 只匹配**字符串**。若只补 `business_status` 而 `status` 仍写数字，
> 110 的修正条件永不命中，两个字段会长期漂移。故二者必须同为字符串。
>
> 另修两处数字语义残留：逾期提醒的 `c.status NOT IN (2,3) AND c.status != 0`
> 改为 `business_status IN ('following','quoted','negotiating')`（按业务语义「只提醒活跃阶段客户」，
> 排除终态与线索）；尾部验证查询 `WHERE status != 0` 改为 `deleted_at IS NULL`
> （016 迁移注释明确「统一软删除方式，当前用 status=0」，deleted_at 才是当前判据）。
>
> **第三处修复：环境守卫原是死代码（2026-09-12 真库实测发现）**
> 原守卫写法 `SELECT IF(...,(SELECT \`ABORT__NOT_A_TEST_DATABASE\`), ...)` 在 MySQL 下
> **任何库上都报 ERROR 1054** —— MySQL 解析阶段即校验标识符，与 IF 分支无关。
> 已改用 `PREPARE`/`EXECUTE` 动态 SQL，并双向实测（测试库放行 / 非测试库中止）。
> 详见 `crm-e2e-diagnosis-and-responsive-fix.md` §11.8.1。
>
> **验证（已闭环）**：
> 1. 静态校验脚本确认全部 19 条 INSERT 的列数/值数一致（`crm_customer` 8 条全 OK）。
> 2. **真库实测**（2026-09-12）：以 `mysqldump --no-data` 建临时库 `huakey_seed_test_tmp`，
>    按真实顺序执行 `seed_test_data.sql` → 本文件，**退出码 0、零错误**：
>    - `business_status` 分布 = `following 129` / `signed 13`，**`lead` 堆积 0**
>    - 正式客户列表可见 **142 条**（修复前模拟为 **0**）
>    - 逾期提醒 **10 条**（修复前为 0）
>    - 110 号对账 `remaining_drift = 0`（两字段严格镜像）
>    验证后临时库已删除，未触碰任何既有库。
>
> **遗留**：该 seed 硬编码 `dept_id = 1/2`，隐含要求 `sys_dept` 预置数据
> （`seed_test_data.sql` 的 `INSERT IGNORE ... SELECT ... FROM sys_dept` 在结构空库上是空操作）。
> 建议后续让该 seed 自带部门数据。

> **N-04 已闭环（2026-09-12）**
>
> **根因**：`test_data_modules.sql` 在「结构空库」上必然失败 —— 没有脚本/迁移会创建
> `sys_dept` 的 id=1/2 记录，外键 `fk_user_dept` 一律 1452。同时连带发现 `seed_test_data.sql`
> 第 14 行 `USE huakey_crm;` 会**把执行连接切到生产库**，使上一行的环境守卫完全失效（守卫
> 检查的是切换前的库名）。
>
> **修复**：
> | 文件 | 改动 |
> |---|---|
> | `database/seeds/test_data_modules.sql` | 新增 §1 部门兜底段：`INSERT IGNORE INTO sys_dept (id,name) VALUES (1,'总经办'),(2,'销售部')` + 按名兜底补插；改用 `@boss_dept_id / @sales_dept_id` 按名解析，**移除全部硬编码 dept_id=1/2**；尾部新增 6 行部门归属自检 |
> | `database/seeds/seed_test_data.sql` | 移除 `USE huakey_crm;`（守卫绕过+违反迁移规范+生产安全隐患） |
> | `scripts/verify-seeds.sh` | 移除「前置补齐 sys_dept」workaround（seed 已自带），改为 4 项 N-04 专项断言（部门存在/用户 dept_id 非 NULL/老板归属总经办/经理销售归属销售部） |
>
> **修复策略**采用 `database/seeds/demo_roles.sql` 的既有模式：固定 id + 按名兜底 + 按名查询。
> 这种方式**同时兼容**两种场景：
> - 干净库：固定 id 走 `INSERT IGNORE` 成功，按名查询得到正确 id
> - 生产克隆库：固定 id 1/2 已被占用（总经办/人力资源部），按名兜底新增 `id=901 销售部`，
>   原数据完全不被破坏
>
> **验证（双场景零库均通过，2026-09-12）**：
>
> | 场景 | 操作 | 结论 |
> |---|---|---|
> | 1. **结构空库**（`sys_dept=0`） | 跑修复后的两个 seed | ✅ 10/10 断言全绿；用户部门归属全部正确 |
> | 2. **生产克隆库**（`sys_dept` 已有 id=1总经办/id=2人力资源部） | 跑修复后的两个 seed | ✅ 零错误；`id=1/2` 数据保留；新增 `id=901 销售部`；用户归属正确 |
> | 3. **反向验证**（结构空库 + 硬编码 dept_id=1） | 用旧写法插 sys_user | ✅ **精准复现** `ERROR 1452 fk_user_dept` 失败 |
>
> **回归**：
> - 前端单测：15 files / 57 tests ✅
> - 后端 db 测试：6 suites / 78 tests ✅
> - 验证脚本 `scripts/verify-seeds.sh`：10/10 断言 ✅
> - E2E（navigation.spec.js）：在跑（见下）


---

## 八、下一步实施建议（第二至九阶段）

1. **迁移 095**：为核心 12 表添加 `is_demo TINYINT(1) DEFAULT 0`，附 `_down.sql`
2. **demo_roles.sql**：补齐缺失角色 + Demo 部门 + 货币 + 3 个 demo 用户（幂等）
3. **demo_*.sql**：按业务链顺序生成客户→联系人→商机→产品→报价→合同→回款→供应商→跟进→审批
4. **demo_all.sql**：聚合入口，按依赖顺序 source 所有子文件
5. **seed:demo 执行器**：Node 脚本，环境阻断 + 幂等 + 日志
6. **.env.test**：E2E 账号环境变量
7. **文档 GUIDE**：使用说明 + 清理脚本 + 生产警示

---

*审计完成。后续实施以本报告为基线。*
