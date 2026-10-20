# 步骤 C1 · 裸奔端点补权限

> 目标：把 `backend/routes` 下**只有 `authenticateToken`、没有功能权限码**的读端点收口到既有
> `checkPermission('码') + checkDataPermission(模块, 归属列)` 模式，并同步权限码与角色矩阵。
>
> 关联：`docs/customer-permission-standard.md`（客户域权限标准）、
> `backend/scripts/init_role_permissions.js`（权限码唯一真源）。

---

## 一、已收口端点

| # | 端点 | 新增守卫 | 授权角色 | 判定理由 |
|---|------|----------|----------|----------|
| 1 | `GET /api/v1/log/detail/:id` | `checkPermission('system:log')` | boss, hr | 日志详情含全公司操作轨迹（谁看了哪个客户、谁改了报价）。与 `POST /list` 同码 |
| 2 | `GET /api/v1/log/modules` | `checkPermission('system:log')` | boss, hr | 日志域元数据。避免「有码的列表 + 裸奔的字典」这种半边收口 |
| 3 | `GET /api/v1/invoice/detail/:id` | `checkPermission('invoice:view')` **+** `checkDataPermission('invoice','create_by')` | boss, manager, finance | **IDOR 修复**：原 `WHERE i.id = ?` 全表直查，改一下 URL 的 id 就能读任意发票 |
| 4 | `GET /api/v1/procurement-plan/list` | `checkPermission('purchase')` | boss, manager, purchase | 含供应商、单价、金额 |
| 5 | `GET /api/v1/procurement-plan/detail/:id` | `checkPermission('purchase')` | 同上 | 计划明细，与 /list 同码避免割裂 |
| 6 | `GET /api/v1/procurement-plan/stats` | `checkPermission('purchase')` | 同上 | 聚合口径同样暴露采购规模 |
| 7 | `POST /api/v1/target/list` | `checkPermission('target')` | boss, manager | 返回**全员**目标 + 实际成交/回款 = 绩效薪酬看板，不可对 sales 开放。前端 `router/index.js:407` 该页本就要求 `permission:'target' + admin:true`，口径一致 |
| 8 | `GET /api/v1/integration/email-log` | `checkPermission('system')` | boss | 外发邮件审计记录（收件人/主题/结果）。与本文件其它端点统一 |
| 9 | `GET /api/v1/product/:id/prices` | `checkPermission('product')` | boss, manager, sales, purchase, engineer | 价格表，**不含成本价**（详见第四节） |
| 10 | `GET /api/v1/product/:id/price` | `checkPermission('product')` | 同上 | 报价取价入口，销售必须可用；兜底取 `crm_product.price`（售价） |

## 二、评估后**刻意保持公开**的字典类端点

这些端点不挂功能码，只在代码注释里写明结论。判定为公开的共同前提：
① 返回的是**字典/枚举**，不含客户、金额等业务数据；② 跨域全链路依赖，加码会导致正常业务断裂。

### 2.1 ⚠️ 与 120 迁移不变式的冲突（踩坑记录）

`tests/db/migrationGuard.test.js:120` 强制 **manager 的权限码条数 == boss 的条数**
（120 迁移确立：manager 功能权限 = boss，差异只体现在数据权限 `dept_and_sub`）。

首轮改动只把 `invoice:view` / `system:cron` 加进 boss，跑完脚本后
`boss=121 / manager=119` ⇒ 该不变式立刻变红。
**结论：任何新增功能码都必须 boss 与 manager 同龄添加**，否则 CI 必挂。
上述 4 个码（含补登记的 `log:delete`、`api_platform`）已两边同步。

---

| 端点 | 结论 | 依据 |
|------|------|------|
| `GET /api/v1/currency/list` | 保持公开 | 币种字典。报价/合同/发票/采购的币种下拉都依赖它，使用者横跨 sales/purchase/finance/engineer；若挂 `system:currency`（仅 boss）销售连报价单都开不出来。写操作 `PUT /:id`、`DELETE /:id` 已配 `system:currency`，读写分治 |
| `GET /api/v1/currency/rates` | 保持公开 | 仅 `code → exchange_rate` 映射，报价换算基础字典，无行级归属概念 |
| `GET /api/v1/config/overdue-days` | 保持公开 | 单值展示参数。逾期高亮必须对所有能看到列表的角色口径一致，差别授权会让同一批客户在不同账号下显示不同状态。真正的配置读写（`GET /list` / `POST /update`）已由 `system` + `requireManager` 守护 |
| `GET /api/v1/service/types` | 保持公开 | **不查库**，返回文件内硬编码中文枚举（安装/维修/保养/培训/投诉/咨询/退换货/其他），等价于前端常量 |
| `GET /api/v1/service/status-list` | 保持公开 | 同上，硬编码状态码→标签映射 |
| `GET /api/v1/service/priority-list` | 保持公开 | 同上，硬编码优先级枚举 |
| `GET /api/v1/customer/assign/my-subordinates` | 保持公开 | **天然自收敛**：`WHERE u.status=1 AND u.manager_id = ?`，参数取 `req.user.userId`。无下属的用户只会得到空数组，不存在越权读他人团队。且只返回人员信息，不含业务数据 |

## 三、cronJobs：GET → POST + 权限码

`routes/cronJobs.js` 原先把 4 个**写操作**挂在 GET 上：

- `daily-scoring` → 供应商评分落库 + 资质状态更新 + 到期检查
- `clean-logs`   → `DELETE FROM sys_log`
- `auto-release` → 批量改 `crm_customer.owner_id` + 插 `crm_pool_log`
- `generate-reminders` → 插入跟进提醒

**风险**：GET 语义上应当安全、可缓存、可预取；爬虫、浏览器预加载、聊天软件链接预览、
代理缓存都可能**静默触发**删日志或改客户归属，且日志里无法区分「调度」与「误触」。

**改造**：

1. 4 个端点 `router.get` → `router.post`，统一守卫链
   `[authenticateToken, checkPermission('system:cron'), requireAdmin]`；
2. 保留 `requireAdmin` 作为纵深防御 —— 即便将来误把 `system:cron` 授予 manager，
   `requireAdmin` 仍会拦住这些破坏性写操作；
3. 为 4 条 GET 路径注册**显式 405** 兼容层，返回 `Allow: POST` 并提示正确方法。
   没有它，老的外部调度会拿到 404，表现为「不报错但再也不执行」——这类静默失败最难排查；
4. 405 兼容层同样先过 `authenticateToken`：未登录应得 401 而不是 405，
   否则等于向匿名用户泄露端点清单；
5. **`backend/vercel.json` 的 `crons` 配置已摘除** —— Vercel Cron 只发 GET，无法调用
   POST 端点；且本项目已部署于群晖 NAS（docker compose），常规调度由
   `backend/cron/scheduler.js`（node-cron，`timezone: 'Asia/Shanghai'`）承担，
   4 个 HTTP 端点降级为**管理员应急补跑通道**。

---

## 四、本次发现的**新问题**（未擅自修改，需确认）

### 4.1 成本价对 sales 开放（真正的敞口，不在任务书列出的两个端点）

任务书要求评估 `product.js:196,247` 的成本价问题。**实测结论：这两个端点不含成本价** ——
`getProductPrices` 只 SELECT `unit_price`（售价），`crm_product_price` 表也没有成本列；
`getDefaultPrice` 的兜底取自 `crm_product.price`（售价）。

真正的敞口在 **`POST /api/v1/product/list`**：

| 项 | 内容 |
|---|---|
| 位置 | `services/productService.js:26` 的 `listProducts`，显式 `SELECT ... cost_price` |
| 权限 | `routes/product.js:109` 仅 `checkPermission('product')` |
| 后果 | `product` 码由 **boss/manager/sales/purchase/engineer** 全部持有 ⇒ sales 可拿到成本价，进而推算毛利 |
| 现状缓解 | 前端 `views/product/index.vue:59` 用 `v-if="isAdmin"` 隐藏了「成本价」列 |

⚠️ 但 **UI 隐藏 ≠ 数据受控**：字段仍在 HTTP 响应体里，打开 devtools / 抓包即可见。

处理建议（待你拍板）：给 `POST /product/list` 挂 `checkFieldPermission('product')`，
按角色裁剪 `cost_price`；或把成本价拆到独立的 `product:cost` 端点。因涉及
「销售是否可见毛利」这一业务口径，**未擅自改动**。

### 4.2 两个"孤儿权限码"：路由在用，但从未登记

新增的守卫测试（见第五节）扫出两处既存缺陷 —— 码在路由里被 `checkPermission()` 引用，
却从未在 `init_role_permissions.js` 登记，因此**没有任何角色持有**：

| 权限码 | 使用位置 | 影响 |
|--------|----------|------|
| `log:delete` | `routes/log.js` 的 `POST /delete` | 删除日志功能对所有非 boss 角色 403，等于不可用 |
| `api_platform` | `routes/api-platform.js` 全部 13 个端点 | API 密钥/ Webhook 管理对所有非 boss 角色不可用 |

已做的处理：**只登记、不放宽**。在 `permission-definitions.js` 中补登记这两个码
（并补齐 `api_platform` 模块 registry 声明的 5 个契约码），授权面保持原样 —— 仅授予 boss，
因为原本也只有 boss（靠 `manage_all=1` 绕过）能进。

是否要把 `api_platform:*` 放宽到 manager（其 `requireManager` 配对暗示了这一意图），**等你确认**。

---

## 五、守卫测试

`backend/tests/unit/permission-hardening-c1.test.js`

不启服务、不连库：`require` 各路由模块后遍历 Express 的 `router.stack`，
**反射**出「方法 + 路径 → 权限码」映射再断言。好处是断言的是**路由定义本身** ——
将来有人误删或改错 `checkPermission`，这里立刻变红，而请求级测试常因 mock 过强而漏过。

覆盖：

1. 上表 10 个端点必须挂载预期权限码，且**不重复叠加**；
2. `GET /invoice/detail/:id` 必须功能码与行级数据权限**双门齐备**；
3. 上表 7 个字典端点**不得**挂任何功能码（防止有人"顺手加固"导致业务断裂）；
4. cron 的 4 个端点只注册 POST，GET 只能是指向拒绝层的单条路由；
5. 权限码与角色矩阵一致性：新码必须登记、必须至少有一个角色持有；
   持有 `invoice`（列表）的角色必须同时持有 `invoice:view`（详情）。

反射依赖 `middleware/permission.js` 在返回的函数上挂了
`.permissionCodes` / `.dataPermissionSpec` 元数据（顺带让权限治理脚本可扫描）。

**反向验证**：临时摘掉 `log.js /modules` 的 `checkPermission('system:log')` 后测试如期变红
（1 failed / 24 passed），恢复后复绿 —— 确认断言真实有效，不是"永远绿"。

---

## 六、回滚方式

- 路由改动：逐文件 `git revert` 即可，均为中间件链增删，无数据变更。
- 权限码登记：`init_role_permissions.js` 默认**只增不删**；已登记的新码若需撤销，
  需显式 `--force-clean`（会删除白名单外关联，谨慎）。
- `vercel.json` 的 `crons` 摘除：若仍在 Vercel 部署，需同步恢复并改回 GET 端点。
