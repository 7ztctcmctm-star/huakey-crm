# Huakey CRM 系统全面分析报告

> 生成时间：2026-05-27
> 分析范围：全系统（前端+后端+数据库+权限+部署）
> 目标企业：20~50人制造业/外贸企业

---

## 第一阶段：系统分析

---

### 一、当前已有功能

| 模块 | 状态 | 说明 |
|------|------|------|
| 用户登录/注册 | 基本可用 | JWT认证，bcrypt密码，但无登录限流 |
| 客户池 | **相对完善** | CRUD、公海领取、分配、导入、线索管理、数据质量检查 |
| 联系人 | 基本可用 | 基于客户ID的CRUD |
| 跟进记录 | 基本可用 | 跟进类型/内容/下次时间，跟进计划 |
| 商机管理 | 基本可用 | 6阶段漏斗、阶段变更日志、成交概率 |
| 报价管理 | 基本可用 | 报价单+明细、审批流程、折扣计算 |
| 合同管理 | 基本可用 | 合同CRUD、回款计划、实际回款、审批流程 |
| 回款管理 | 基本可用 | 回款计划+实际回款，逾期跟踪 |
| 售后工单 | 基本可用 | 工单CRUD、指派、满意度评价 |
| 产品管理 | 基本可用 | 产品CRUD、分类、参考价/成本价 |
| 供应商管理 | 基本可用 | 供应商档案、联系人、资质证照、评分 |
| 采购管理 | 基本可用 | 采购单、到货验收、付款记录 |
| 部门管理 | 简陋 | 仅61行，基础CRUD |
| 角色管理 | 简陋 | 仅63行，基础CRUD |
| 权限管理 | 基本可用 | RBAC菜单/按钮/数据权限，但有双系统问题 |
| 操作日志 | 基本可用 | 自动记录+手动查看，但未脱敏 |
| 系统配置 | 简陋 | 仅62行，key-value配置 |
| 数据备份 | 简陋 | 基础备份功能 |
| 仪表盘 | 基本可用 | ECharts图表、销售漏斗、今日任务 |
| 全局搜索 | 简陋 | 仅107行，4个实体搜索 |
| 提醒系统 | 基本可用 | 逾期提醒、今日/明日提醒、通知 |
| AI模块 | 初步 | Text-to-SQL，受限SQL执行 |
| 数据分析 | 初步 | 基础分析端点 |
| 团队仪表盘 | 基本可用 | 团队视图 |

---

### 二、当前系统缺陷

#### 2.1 架构层缺陷

**1. 后端"胖路由"架构 — 没有Controller/Service分层**
- 28个路由文件，业务逻辑全部内联在路由处理函数中
- `backend/src/` 空壳目录已删除（2026-06-17）
- `contract.js` 单文件1162行，`report.js` 1190行，`supplier.js` 662行
- 仅客户模块被拆分到 `routes/customer/` 子目录（8个文件）
- **后果**：代码复用困难、测试困难、维护成本指数级上升

**2. 前端没有API层**
- 没有 `frontend/src/api/` 目录
- 所有API URL硬编码在各个Vue组件中（如 `post('/customer/list', ...)`）
- **后果**：改一个接口URL需要搜遍所有组件；无法统一管理API版本

**3. 双套权限系统并存**
- `middleware/permission.js`（新）：`buildDataPermissionWhere()` — 参数化查询
- `utils/permission.js`（旧）：`buildPermissionClause()` — 不同实现
- 同一个 `search.js` 中客户/商机用新系统，合同/报价用旧系统
- `detail.js` 的导出功能用旧系统，列表功能用新系统
- **后果**：两套实现可能不一致，导致数据泄露

**4. 硬编码角色ID**
- `roleId === 1` 代表超级管理员（散见于middleware和多个route文件）
- `roleId === 2` 代表经理（`detail.js` 第75行）
- **后果**：角色ID变化时全局崩溃

#### 2.2 安全层缺陷

**5. 日志系统未脱敏（高危）**
- `middleware/logger.js` 直接记录 `req.body` 到 `sys_operation_log`
- 已存在 `utils/mask.js` 脱敏工具但**未接入**
- 登录密码、客户手机号/邮箱以明文存入数据库
- **违反** AI_RULES.md 第26条

**6. 无登录限流/防暴力破解**
- `rateLimiter.js` 存在但未对 `/api/auth/login` 做特殊限制
- 无账户锁定机制

**7. Token无法撤销**
- Logout不使token失效
- Token有效期7天，无refresh token机制
- JWT payload中的 `viewAll`/`manageAll` 可被伪造

**8. 部分接口缺少权限校验**
- `/api/report/sales-funnel` 仅检查登录，不检查权限/数据范围
- `/api/search/global` 权限检查不一致

#### 2.3 数据层缺陷

**9. `crm_sales_target` 表缺失CREATE TABLE**
- 路由 `target.js` 和多个migration引用，但无建表语句
- 新环境部署会失败

**10. `sys_log` 表无CREATE TABLE**
- 被migration 006的外键引用，但建表语句在根目录SQL文件中
- 与 `sys_operation_log` 功能重复

**11. 数据库初始化文件多处重复**
- `database/initdb/`、根目录 `*.sql`、`deploy_package/` 三套SQL文件
- 可能出现版本漂移

**12. 软删除标准不统一**
- 客户用 `status = 0`
- 其他表用 `deleted_at IS NULL`
- 部分查询未加软删除过滤

#### 2.4 前端缺陷

**13. 登出功能会崩溃**
- `layout/index.vue` 第764行调用 `clearUser()` 但未从 `useUser` 解构
- 用户点击退出时会报 `ReferenceError`

**14. 路由文件名大小写不一致**
- `router/index.js` 引用 `'../views/customer/list.vue'`（小写l）
- 实际文件是 `List.vue`（大写L）
- Windows不区分大小写所以能跑，Linux部署会白屏

**15. 路由权限配置错误**
- `followup/plan` 路由权限设为 `'customer:list'`（复制粘贴错误）
- `payment` 路由权限设为 `'contract'`（应该有独立权限）

**16. 错误处理不一致**
- 部分API调用 `catch { /* ignore */ }` 静默吞错
- `Dashboard.vue` 的 `submitQuickFollow` 不检查 `res.code` 就显示成功
- `goService()` 忽略传入的ID参数

**17. 没有API层导致URL散落**
- 客户列表组件中硬编码了10+个API URL
- 没有统一管理，无法做API版本控制

#### 2.5 代码质量缺陷

**18. 无有效测试**
- 仅4个测试文件，总计约255行
- `auth.test.js`（50行）、`contract.test.js`（70行）、`customer.test.js`（45行）、`supplier.test.js`（90行）
- 覆盖率极低

**19. Joi校验覆盖不全**
- 缺少校验的路由：`dept.js`、`role.js`、`product.js`、`followUp.js`、`service.js`、`report.js`、`search.js`、`log.js`、`user.js`
- 部分pageSize无上限校验（可传999999）

**20. 文件过大**
- `contract.js` 918行、`report.js` 690行、`Dashboard.vue` 963行、`customer/List.vue` 905行、`layout/index.vue` 945行
- 超过500行限制

---

### 三、当前高风险区域

| 风险等级 | 区域 | 原因 |
|----------|------|------|
| **P0 致命** | 日志未脱敏 | 密码/手机号/邮箱明文入库，违反数据安全法规 |
| **P0 致命** | 双套权限系统 | 两套实现可能不一致，存在数据泄露风险 |
| **P0 致命** | 登出崩溃 | 用户无法正常退出系统 |
| **P1 高危** | 硬编码角色ID | 角色管理变更会导致全局权限失效 |
| **P1 高危** | 部分接口无权限校验 | 报表/搜索接口数据泄露 |
| **P1 高危** | Token无法撤销 | 离职员工token在有效期内仍可访问 |
| **P1 高危** | 缺少建表SQL | 新环境部署失败 |
| **P2 中危** | 无登录限流 | 暴力破解风险 |
| **P2 中危** | 路由大小写 | Linux部署白屏 |
| **P2 中危** | 软删除不统一 | 数据一致性风险 |

---

### 四、当前数据库风险

| 风险 | 说明 | 状态 |
|------|------|------|
| `crm_sales_target` 无CREATE TABLE | 新环境部署直接失败 | 待修复 |
| `sys_log` 与 `sys_operation_log` 功能重复 | 应统一为一张表 | 待修复 |
| SQL初始化文件三处重复 | 版本漂移风险 | 待修复 |
| 软删除标准不统一 | status=0 vs deleted_at | 待修复 |
| `sys_user.dept_id` ON DELETE SET NULL | 删除部门后用户成"孤儿" | 待修复 |
| `crm_customer` CASCADE删除 | 删除客户会级联删除联系人/跟进/商机/合同 | 待修复 |
| 连接池上限仅10 | 20-50人并发可能不够 | 待修复 |
| 无读写分离 | 报表查询可能阻塞业务操作 | 待修复 |
| ~~`sys_log` 无归档策略~~ | ~~3.45MB且持续增长~~ | ✅ 已修复（2026-06-17：归档3024条，定时事件每月执行） |
| ~~5张表冗余索引（47对）~~ | ~~INSERT/UPDATE性能开销~~ | ✅ 部分修复（2026-06-17：清理12个冗余索引） |
| ~~销售漏斗SQL错误（P0）~~ | ~~permParams未展开导致?占位符绑定失败~~ | ✅ 已修复（2026-06-18：展开为`[...permParams]`） |
| ~~Migration 056语法错误（P1）~~ | ~~DELIMITER语法mysql2不支持~~ | ✅ 已修复（2026-06-18：移除DELIMITER，简化STARTS表达式） |

---

### 五、当前权限风险

| 风险 | 说明 |
|------|------|
| 双套权限实现 | `middleware/permission.js` 和 `utils/permission.js` 并存 |
| 硬编码roleId=1/2 | 不通过role_code判断，依赖自增ID |
| JWT中携带viewAll/manageAll | token伪造后可提权 |
| 路由meta.permission命名不统一 | 有的用 `'leads'`，有的用 `'customer:list'` |
| 无数据权限审计 | 无法验证每个接口的数据范围是否正确 |
| 前端权限仅隐藏按钮 | 需确保后端也校验（目前大部分有，但不完整） |

---

### 六、当前UI/UX问题

| 问题 | 说明 |
|------|------|
| 无移动端适配 | AI_RULES.md要求移动端支持客户查看/跟进/提醒，当前无响应式设计 |
| 文件名大小写 | Linux部署白屏 |
| API错误处理不一致 | 有的静默失败，有的弹错误提示 |
| Dashboard双次加载 | onMounted + onActivated导致初始加载请求两次 |
| 超大组件文件 | 900+行Vue文件难以维护 |
| 无加载骨架屏 | 列表页首次加载无视觉反馈 |
| 无空状态设计 | 无数据时用户体验差 |

---

### 七、当前系统最需要优先修复的问题（排序）

| 优先级 | 问题 | 原因 |
|--------|------|------|
| **1** | 日志脱敏接入mask.js | 法规合规风险，已有工具但未使用 |
| **2** | 修复登出崩溃(clearUser) | 用户无法退出，是阻塞性BUG |
| **3** | 统一权限系统 | 数据安全基础，越往后越难修 |
| **4** | 补齐缺失的CREATE TABLE | 新环境部署阻塞 |
| **5** | 修复路由大小写 | Linux部署白屏 |
| **6** | 修复路由权限配置错误 | followup/plan和payment权限错配 |
| **7** | 补齐Joi校验 | 多个写操作接口无输入校验 |
| **8** | 硬编码角色ID改为role_code | 权限系统健壮性 |
| **9** | 登录限流 | 安全基线 |
| **10** | 统一软删除标准 | 数据一致性 |

---

## 第二阶段：产品规划

基于：20~50人企业 / 制造业+外贸业务 / 长期维护 / 渐进式开发

---

### P0 — 必须立即做（系统稳定性与安全）

| # | 功能 | 为什么做 | 业务价值 | 增加复杂度 | 影响权限 | 影响数据库 | 影响维护 |
|---|------|----------|----------|------------|----------|------------|----------|
| 1 | **日志脱敏接入mask.js** | 法规合规（PII保护），工具已有但未接入 | 避免数据泄露法律责任 | 低 — 修改logger.js一个文件 | 否 | 否 | 降低 — 合规基线 |
| 2 | **修复登出clearUser崩溃** | 阻塞性BUG，用户无法退出 | 所有用户每天都会用到 | 极低 — 一行修复 | 否 | 否 | 不影响 |
| 3 | **统一权限系统** | 双套并存是定时炸弹，越晚修成本越高 | 数据安全基石 | 中 — 需逐文件迁移 | **是** — 核心改造 | 否 | 大幅降低 |
| 4 | **补齐缺失建表SQL** | 新环境部署直接失败 | 部署能力 | 极低 — 补SQL | 否 | 是 — 补缺失表 | 不影响 |
| 5 | **修复路由大小写/权限配置** | Linux部署白屏+权限错配 | 部署+安全 | 极低 | 否 | 否 | 不影响 |
| 6 | **补齐Joi校验** | 9个路由无输入校验，可被恶意输入攻击 | 安全基线 | 低 — 逐文件加schema | 否 | 否 | 降低 |
| 7 | **硬编码角色ID改role_code** | 角色管理变更导致权限全局失效 | 权限系统健壮性 | 中 | 是 | 否 | 降低 |
| 8 | **登录限流+防暴力破解** | 安全基线，rateLimiter已有 | 账户安全 | 低 | 否 | 否 | 不影响 |
| 9 | **统一软删除标准** | 数据一致性，当前status=0和deleted_at混用 | 数据完整性 | 中 — 需逐步迁移 | 否 | 是 | 降低 |
| 10 | **Token撤销机制** | 离职员工token仍可访问 | 安全闭环 | 中 — 需token黑名单 | 否 | 是 — 需黑名单表 | 中等 |

**为什么这10项是P0：**
- 不做这些，系统在安全/合规/部署层面存在硬伤
- 每一项都是"地基"级别的问题，后续功能越建越多，修复成本越大
- 大部分工具/代码已存在，只需"接上"或"修一行"

---

### P1 — 强烈建议做（核心业务效率）

| # | 功能 | 为什么做 | 业务价值 | 增加复杂度 | 影响权限 | 影响数据库 | 影响维护 |
|---|------|----------|----------|------------|----------|------------|----------|
| 1 | **跟进记录增强** | 当前跟进只有基础CRUD，缺少时间线/附件/提醒联动 | 销售每天高频使用 | 中 | 否 | 中 — 可能加字段 | 中等 |
| 2 | **消息通知中心** | crm_notification表已有，但前端无统一通知面板 | 审批/提醒/逾期都需要 | 中 | 否 | 否 — 表已存在 | 中等 |
| 3 | **待办提醒面板** | 跟进计划/回款逾期/资质到期已有数据，缺统一入口 | 销售/管理层效率 | 中 | 否 | 否 | 中等 |
| 4 | **批量操作** | 客户分配/标签/状态变更当前只能单条操作 | 50人团队效率瓶颈 | 中 | 是 — 需批量权限 | 否 | 中等 |
| 5 | **前端API层抽取** | 当前URL散落各组件，改动成本极高 | 开发效率/可维护性 | 中 — 重构但不改逻辑 | 否 | 否 | 大幅降低 |
| 6 | **后端Controller/Service分层** | 胖路由导致918行单文件，无法测试/复用 | 可维护性/可测试性 | 高 — 但必须做 | 否 | 否 | 大幅降低 |
| 7 | **回款管理增强** | 当前回款页面简陋，缺逾期预警/催款提醒 | 财务核心流程 | 中 | 是 | 中 | 中等 |
| 8 | **客户画像/活跃度** | 跟进频次/成交历史/联系人决策链，当前无汇总 | 销售策略支撑 | 中 | 否 | 低 — 可用视图 | 低 |
| 9 | **私有池** | pool_type字段已存在(ENUM 'public'/'private')，但无功能 | 客户保护策略 | 低 | 是 | 否 — 字段已有 | 低 |
| 10 | **操作日志补全** | 当前日志记录不完整，部分操作无日志 | 审计/合规 | 低 | 否 | 否 | 降低 |

**为什么这10项是P1：**
- 直接影响销售团队日常效率
- 大部分底层数据表/字段已存在，只是前端/后端逻辑未完成
- "消息通知"和"待办提醒"是CRM的核心体验，没有它们系统像个空壳
- API层和Controller分层是防止系统腐化的关键投资

---

### P2 — 后期再做（增强功能）

| # | 功能 | 为什么做 | 业务价值 | 增加复杂度 | 影响权限 | 影响数据库 | 影响维护 |
|---|------|----------|----------|------------|----------|------------|----------|
| 1 | **全局搜索增强** | 当前仅4个实体，需扩展到产品/供应商/采购 | 操作效率 | 低 | 否 | 否 | 低 |
| 2 | **发票状态跟踪** | 合同-回款-发票三联单，当前无发票 | 财务闭环 | 中 | 否 | 是 — 需新表 | 中等 |
| 3 | **订单管理** | 报价→合同→订单的完整销售链 | 销售流程闭环 | 高 | 是 | 是 | 高 |
| 4 | **采购分析** | 采购成本/供应商对比/到货及时率 | 采购决策 | 中 | 否 | 否 — 数据已有 | 中等 |
| 5 | **客户活跃度评分** | 基于跟进频次/最近联系自动评分 | 销售优先级 | 中 | 否 | 是 — 加字段 | 中等 |
| 6 | **移动端适配** | 销售外出需要手机操作 | 外勤场景 | 高 | 否 | 否 | 高 |
| 7 | **审批流程增强** | 当前报价/合同有approval_status但无流程引擎 | 管控 | 高 | 是 | 是 | 高 |
| 8 | **数据导出增强** | 当前导出限制10000条，需分批+权限校验 | 数据分析 | 低 | 是 | 否 | 低 |
| 9 | **Redis缓存接入** | .env已有REDIS配置，Docker已部署Redis | 性能 | 中 | 否 | 否 | 中等 |
| 10 | **自动化测试** | 当前仅4个测试文件，需系统化 | 质量保障 | 高 | 否 | 否 | 降低 |

**为什么这些是P2：**
- 有价值但不是阻塞项
- 大部分需要新表或较大改动，应在基础稳固后做
- 移动端适配工作量大，可延后

---

### P3 — 暂时不要做

| # | 功能 | 为什么不做 | 何时考虑 |
|---|------|-----------|----------|
| 1 | **微服务化** | 违反AI_RULES.md，20-50人规模不需要 | 200+人规模 |
| 2 | **TypeScript迁移** | 工作量巨大，当前JS代码可维护 | 团队>5人前端时 |
| 3 | **WebSocket实时推送** | 增加复杂度，轮询已能满足需求 | 用户>100人时 |
| 4 | **多租户SaaS** | 当前是单企业部署，不需要 | 对外销售时 |
| 5 | **复杂消息队列** | 违反AI_RULES.md，当前无异步需求 | 日请求>10万时 |
| 6 | **AI自动执行** | AI_RULES.md明确禁止AI自动执行危险SQL | 安全评估后 |
| 7 | **国际化i18n** | 团队使用中文，无国际业务需求 | 有海外分公司时 |
| 8 | **暗色模式** | 非核心需求，优先级极低 | UI成熟后 |
| 9 | **第三方ERP集成** | sys_integration表已有但需求不明确 | 业务流程固化后 |
| 10 | **自定义表单/报表引擎** | 过度设计，当前固定报表已够用 | 业务需求驱动时 |

---

## 第三阶段：开发路线图

---

### Phase 1：安全与稳定加固（预计2-3周）

**开发目标：** 修复所有安全漏洞和系统级BUG，建立系统稳定运行的基础

**涉及模块：**
- `backend/middleware/logger.js` — 日志脱敏
- `frontend/src/views/layout/index.vue` — 登出修复
- `backend/middleware/permission.js` + `backend/utils/permission.js` — 权限统一
- `backend/routes/` 多个文件 — Joi校验补齐、角色ID改造
- `backend/middleware/auth.js` — 登录限流、Token撤销
- `database/` — 补建表SQL、软删除统一
- `frontend/src/router/index.js` — 路由修复

**数据库影响：**
- 补 `crm_sales_target` CREATE TABLE
- 新增 `sys_token_blacklist` 表（Token撤销）
- 软删除字段标准化（逐步迁移，不删旧字段）

**权限影响：**
- 统一使用 `middleware/permission.js` 的 `buildDataPermissionWhere()`
- 废弃 `utils/permission.js` 的 `buildPermissionClause()`
- 所有硬编码 `roleId === 1` 改为 `roleCode === 'super_admin'`

**UI影响：**
- 最小 — 仅修复登出、路由大小写
- 无新页面

**风险点：**
- 权限统一是高风险操作，可能影响所有数据查询接口
- 软删除标准变更可能影响已有数据查询
- 必须逐接口测试

**推荐开发顺序：**
1. 日志脱敏（最低风险，立即合入）
2. 登出修复（一行代码）
3. 路由大小写+权限配置修复
4. 补建表SQL
5. Joi校验补齐
6. 登录限流
7. 硬编码角色ID改造
8. Token撤销机制
9. 权限系统统一（最高风险，最后做）
10. 软删除标准统一

---

### Phase 2：核心业务增强（预计3-4周）

**开发目标：** 补齐CRM核心业务功能，让系统真正服务销售团队日常

**涉及模块：**
- 跟进记录 — 时间线/附件/提醒联动
- 消息通知 — 统一通知面板
- 待办提醒 — 统一待办中心
- 客户管理 — 批量操作/私有池/客户画像
- 回款管理 — 逾期预警/催款
- 前端API层 — 抽取所有API调用
- 后端分层 — Controller/Service拆分

**数据库影响：**
- `crm_follow_up` 可能加 `attachment_ids` 字段
- `crm_notification` 表已存在，无需改
- `crm_customer.pool_type` 已存在，无需改
- 新增视图（客户画像汇总）

**权限影响：**
- 批量操作需新增 `customer:batch_assign` 等权限
- 私有池需新增 `customer:private_pool` 权限
- 通知中心需检查 `to_user_id` 防越权

**UI影响：**
- 新增通知面板组件（Header区域）
- 新增待办面板组件
- 客户列表增加批量操作工具栏
- 客户详情增加画像卡片
- 跟进记录改为时间线样式

**风险点：**
- 后端分层重构是最大工作量，但可逐文件迁移
- API层抽取是前端重构，需同步更新所有组件
- 通知实时性问题（当前无WebSocket，用轮询）

**推荐开发顺序：**
1. 前端API层抽取（重构基础）
2. 消息通知面板
3. 待办提醒面板
4. 跟进记录增强
5. 客户私有池
6. 批量操作
7. 回款管理增强
8. 客户画像
9. 后端Controller/Service分层（逐步）
10. 操作日志补全

---

### Phase 3：流程闭环与数据分析（预计3-4周）

**开发目标：** 完善业务流程闭环，增强数据分析能力

**涉及模块：**
- 全局搜索增强
- 发票管理
- 订单管理
- 采购分析
- 客户活跃度评分
- 审批流程
- 数据导出增强
- Redis缓存

**数据库影响：**
- 新增 `crm_invoice` 表
- 新增 `crm_order` 表（如需要）
- `crm_customer` 加活跃度评分字段
- 审批流程可能需新表

**权限影响：**
- 发票/订单需独立权限
- 审批流程涉及角色权限变更

**UI影响：**
- 新增发票管理页面
- 增强全局搜索UI
- 新增采购分析图表
- 审批流程UI

**风险点：**
- 订单管理工作量大，需明确业务流程
- 审批流程如做成通用引擎复杂度高
- 建议先做固定流程

**推荐开发顺序：**
1. 全局搜索增强
2. 数据导出增强
3. 客户活跃度评分
4. Redis缓存接入
5. 采购分析
6. 发票管理
7. 审批流程
8. 订单管理（如有需求）

---

### Phase 4：质量与扩展（预计3-4周）

**开发目标：** 提升系统质量，为长期维护打好基础

**涉及模块：**
- 自动化测试
- 移动端适配
- 性能优化
- 监控告警

**数据库影响：**
- 无新表

**权限影响：**
- 无变更

**UI影响：**
- 移动端响应式布局
- 测试覆盖

**风险点：**
- 移动端适配工作量大
- 测试建设需要持续投入

**推荐开发顺序：**
1. 自动化测试框架搭建
2. 核心接口测试用例
3. 移动端适配（客户/跟进/提醒）
4. 性能优化
5. 监控告警

---

## 第四阶段：Phase 1 任务拆分

> Phase 1 目标：安全与稳定加固
> 共拆分为 10 个任务，按推荐开发顺序排列

---

### TASK-001：日志脱敏接入

**任务目标：** 将已有的 `utils/mask.js` 脱敏工具接入 `middleware/logger.js`，确保日志中不再出现明文密码、手机号、邮箱。

**修改模块：**
- `backend/middleware/logger.js` — 在记录 `req.body` 前调用脱敏函数
- `backend/utils/mask.js` — 可能需扩展脱敏字段覆盖（当前仅手机号/邮箱/身份证，需增加password字段）

**数据库修改：** 无

**前端修改：** 无

**后端修改：**
- `logger.js` 的 `globalLogMiddleware` 中，在 `JSON.stringify(req.body)` 前调用 `maskSensitiveData()`
- 需脱敏的字段：`password`、`old_password`、`new_password`、`phone`、`email`、`id_card`、`bank_card`
- `logAction()` 函数也需对 `params` 参数做脱敏
- 建议在 `mask.js` 中新增通用的 `maskObject(obj, sensitiveKeys)` 函数

**权限修改：** 无

**风险说明：**
- 风险极低 — 仅修改日志记录逻辑，不影响业务功能
- 需确保脱敏后的日志仍可读（保留前3后4位等）
- 需验证已有脱敏函数的正则是否覆盖所有场景

**测试建议：**
- 调用 `/api/auth/login` 检查 `sys_operation_log` 中password是否为 `******`
- 调用客户创建接口检查手机号/邮箱是否脱敏
- 调用修改密码接口检查新旧密码是否脱敏
- 确认脱敏后的日志仍有调试价值

---

### TASK-002：修复登出崩溃

**任务目标：** 修复 `layout/index.vue` 中 `clearUser()` 未定义导致的登出崩溃。

**修改模块：**
- `frontend/src/views/layout/index.vue`

**数据库修改：** 无

**前端修改：**
- 检查 `useUser` composable 是否导出 `clearUser`
- 若已导出：在 `layout/index.vue` 的 import 中加入 `clearUser`
- 若未导出：在 `useUser.js` 中补充 `clearUser` 方法（清除localStorage中的userInfo）
- 同时检查 `useUser` composable 是否有 `clearUser` 方法供Pinia store和localStorage同步清除

**后端修改：** 无

**权限修改：** 无

**风险说明：**
- 风险极低 — 仅修复import缺失
- 需确保登出时同时清除：token、userInfo、可能的缓存数据
- 确认登出后正确跳转到 `/login`

**测试建议：**
- 点击登出按钮，确认不报错
- 确认跳转到登录页
- 确认localStorage中token和userInfo已清除
- 确认刷新页面后不会自动登录

---

### TASK-003：路由大小写 + 权限配置修复

**任务目标：** 修复 `router/index.js` 中的文件名大小写问题和权限配置错误。

**修改模块：**
- `frontend/src/router/index.js`

**数据库修改：** 无

**前端修改：**
- `'../views/customer/list.vue'` → `'../views/customer/List.vue'`（第46行）
- `followup/plan` 路由的 `permission: 'customer:list'` → `'followup:plan'`（第43行）
- `payment` 路由的 `permission: 'contract'` → 评估是否需要独立权限 `'payment'`
- 审查所有路由的 `meta.permission` 值，确保命名一致

**后端修改：**
- 若payment路由改为独立权限，需在 `sys_permission` 表中增加 `payment` 权限记录
- 需在 `permission_data.sql` 种子文件中增加对应记录

**权限修改：**
- 可能新增 `payment:view` 权限

**风险说明：**
- 低风险 — 路由修复
- 权限名称变更需确认后端权限种子数据同步
- 需确保已有角色的权限映射不丢失

**测试建议：**
- Linux环境或Docker中部署测试，确认客户列表页面正常加载
- 以普通销售角色访问 `/followup/plan`，确认权限校验正确
- 以不同角色访问 `/payment`，确认权限隔离正确
- 确认所有路由均可正常访问（无404）

---

### TASK-004：补齐缺失建表SQL

**任务目标：** 补齐 `crm_sales_target` 和其他缺失的CREATE TABLE语句。

**修改模块：**
- `database/migrations/` — 新增迁移文件

**数据库修改：**
- 新增 `database/migrations/032_create_sales_target.sql`：
  ```sql
  CREATE TABLE IF NOT EXISTS crm_sales_target (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    target_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    create_by INT,
    deleted_at DATETIME DEFAULT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    UNIQUE KEY uk_user_period (user_id, year, month)
  );
  ```
- 检查 `sys_log` 表是否确实缺失CREATE TABLE，如缺失则补上
- 检查其他被引用但无建表语句的表

**前端修改：** 无

**后端修改：** 无

**权限修改：** 无

**风险说明：**
- 低风险 — 仅新增建表语句
- 使用 `IF NOT EXISTS` 确保可重复执行
- 需确认字段类型与 `target.js` 中的使用一致

**测试建议：**
- 全新数据库环境执行迁移，确认所有表创建成功
- 运行 `target.js` 的各个端点，确认CRUD正常
- 确认已有数据环境执行迁移无报错

---

### TASK-005：补齐Joi校验

**任务目标：** 为缺少Joi校验的9个路由文件补齐请求参数校验。

**修改模块：**
- `backend/routes/dept.js` — 部门CRUD校验
- `backend/routes/role.js` — 角色CRUD校验
- `backend/routes/product.js` — 产品CRUD校验
- `backend/routes/followUp.js` — 跟进记录校验
- `backend/routes/service.js` — 售后工单校验
- `backend/routes/report.js` — 报表查询参数校验
- `backend/routes/search.js` — 搜索关键词校验
- `backend/routes/log.js` — 日志查询参数校验
- `backend/routes/user.js` — 用户管理校验

**数据库修改：** 无

**前端修改：** 无

**后端修改：**
- 每个文件新增 Joi schema 定义
- 每个写操作路由添加 `validate(schema)` 中间件
- 每个列表接口添加 pageSize 上限校验（max: 200）
- `search.js` 的 keyword 参数添加长度限制（min: 2, max: 100）

**权限修改：** 无

**风险说明：**
- 中低风险 — 校验收紧可能导致已有合法请求被拒绝
- 需确保校验规则与数据库字段约束一致
- 建议逐文件添加，不要一次性全部加上
- 先加最危险的接口（写操作），再加查询接口

**测试建议：**
- 对每个修改的接口测试：正常请求、缺少必填字段、超长字段、非法类型
- 测试 pageSize=999999 是否被正确拒绝
- 测试搜索 keyword=1字符是否被拒绝
- 测试搜索 keyword=超长字符串是否被截断
- 确认已有前端请求不被误拦截

---

### TASK-006：登录限流

**任务目标：** 为登录接口添加速率限制，防止暴力破解。

**修改模块：**
- `backend/middleware/rateLimiter.js` — 可能需增加登录专用限流器
- `backend/routes/auth.js` — 登录路由添加限流中间件
- `backend/app.js` — 确认限流中间件挂载

**数据库修改：** 无

**前端修改：** 无

**后端修改：**
- `rateLimiter.js` 中新增 `loginLimiter`：
  - 窗口：15分钟
  - 最大尝试：5次（同一IP）
  - 返回 429 状态码 + 友好提示
- 在 `/api/auth/login` 路由上应用 `loginLimiter`
- 考虑是否增加账户锁定（同一用户名5次失败后锁定30分钟）
- 锁定逻辑涉及数据库，需在 `sys_user` 表加 `lock_until` 字段或用Redis

**权限修改：** 无

**风险说明：**
- 低风险 — 仅增加防护层
- 需注意反向代理环境下IP获取的准确性
- 限流数据存储方式：内存 vs Redis（当前Redis默认禁用，建议先用内存）

**测试建议：**
- 连续6次错误密码登录，确认第6次返回429
- 等待15分钟后确认可以再次登录
- 正确密码登录确认不受限流影响
- 测试不同IP的限流隔离

---

### TASK-007：硬编码角色ID改造

**任务目标：** 将所有 `roleId === 1` 和 `roleId === 2` 的硬编码改为基于 `role_code` 的判断。

**修改模块：**
- `backend/middleware/auth.js` — token生成时携带role_code
- `backend/middleware/permission.js` — super admin判断改为role_code
- `backend/routes/customer/detail.js` — `canManageCustomer` 中的roleId===2
- `backend/routes/customer/pool.js` — 可能有硬编码
- `backend/routes/customer/assign.js` — 可能有硬编码
- `backend/routes/search.js` — 可能有硬编码
- `backend/routes/report.js` — 可能有硬编码
- 其他包含 `roleId === 1` 或 `roleId === 2` 的文件

**数据库修改：** 无

**前端修改：**
- `frontend/src/router/index.js` — admin判断逻辑（当前用 `roleId === 1`）
- `frontend/src/composables/useUser.js` — `isAdmin`/`isBoss` 计算属性
- `frontend/src/utils/permission.js` — 可能有硬编码判断

**后端修改：**
- `auth.js` 的 `generateToken()` 中增加 `roleCode` 字段
- `middleware/auth.js` 解析token时增加 `req.user.roleCode`
- 所有 `roleId === 1` 改为 `roleCode === 'super_admin'`
- 所有 `roleId === 2` 改为 `roleCode === 'sales_manager'`（需确认角色code值）
- 需同步修改JWT payload结构

**权限修改：**
- 不新增权限，但改变权限判断逻辑的基础

**风险说明：**
- **高风险** — 涉及所有权限判断逻辑
- JWT payload结构变更意味着旧token失效，用户需重新登录
- 需全量搜索所有 `roleId` 引用点
- 建议在JWT中同时保留 `roleId` 和 `roleCode`，逐步迁移

**测试建议：**
- 所有角色（超级管理员/老板/经理/销售/财务）分别测试登录+核心操作
- 测试管理员权限不受影响
- 测试经理的数据范围权限不受影响
- 测试普通销售的数据隔离不受影响
- 测试旧token是否正确处理（应提示重新登录）

---

### TASK-008：Token撤销机制

**任务目标：** 实现Token黑名单机制，使Logout真正失效token，支持管理员强制下线。

**修改模块：**
- `backend/routes/auth.js` — Logout时将token加入黑名单
- `backend/middleware/auth.js` — 验证token时检查黑名单
- `database/migrations/` — 新增黑名单表

**数据库修改：**
- 新增 `database/migrations/033_create_token_blacklist.sql`：
  ```sql
  CREATE TABLE IF NOT EXISTS sys_token_blacklist (
    id INT PRIMARY KEY AUTO_INCREMENT,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id INT,
    expire_at DATETIME NOT NULL,
    reason VARCHAR(50),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expire (expire_at),
    INDEX idx_user (user_id)
  );
  ```

**前端修改：**
- 确认logout调用后正确清除本地token
- 401响应处理（request.js已有）

**后端修改：**
- `auth.js` 的 `/logout` 路由：将当前token的hash存入黑名单表
- `middleware/auth.js`：验证JWT后查询黑名单表，命中则拒绝
- 考虑性能：可使用 `node-cache`（已安装）缓存黑名单，减少数据库查询
- 定时任务：定期清理过期的黑名单记录（expire_at < NOW()）
- 管理员接口：`POST /api/user/:id/force-logout` 将该用户所有token加入黑名单

**权限修改：**
- 新增 `user:force_logout` 权限（管理员强制下线）

**风险说明：**
- 中风险 — 每次请求增加一次黑名单查询（需缓存优化）
- JWT密钥变更会使所有token失效，需提前通知用户
- 黑名单表会持续增长，需定时清理

**测试建议：**
- 登录→登出→用旧token访问接口→确认返回401
- 管理员强制下线某用户→该用户请求返回401
- 验证缓存命中率（高频接口不应每次都查DB）
- 黑名单记录过期后自动清理

---

### TASK-009：权限系统统一

**任务目标：** 统一 `middleware/permission.js` 和 `utils/permission.js` 两套权限实现，消除数据泄露风险。

**修改模块：**
- `backend/utils/permission.js` — 废弃或改为转发到middleware
- `backend/middleware/permission.js` — 确保功能完整
- `backend/routes/customer/detail.js` — 导出功能迁移
- `backend/routes/search.js` — 合同/报价搜索迁移
- 所有引用 `utils/permission.js` 的文件

**数据库修改：** 无

**前端修改：** 无

**后端修改：**
- 第一步：全量搜索 `require('../../utils/permission')` 或 `require('../utils/permission')`，列出所有引用文件
- 第二步：确认 `middleware/permission.js` 的 `buildDataPermissionWhere()` 能覆盖所有场景
- 第三步：逐文件将 `getDataPermission()` + `buildPermissionClause()` 替换为 `checkDataPermission()` + `buildDataPermissionWhere()`
- 第四步：将 `utils/permission.js` 中的函数改为调用middleware的实现（保持向后兼容）
- 第五步：确认无引用后删除旧实现

**权限修改：** 无（统一实现，不改变权限语义）

**风险说明：**
- **最高风险任务** — 涉及所有数据查询接口的权限判断
- 必须逐接口测试，确保数据范围不扩大也不缩小
- 建议逐文件迁移，不要一次性全部替换
- 需要完整的角色-数据范围测试矩阵

**测试建议：**
- 准备测试矩阵：6个角色 × 所有模块 × 数据范围
- 超级管理员：应看到所有数据
- 老板：应看到全部/部门数据
- 经理：应看到部门数据
- 销售：应只看到自己的数据
- 重点测试：导出功能、搜索功能（这两个目前用旧系统）
- 对比迁移前后的查询结果是否一致

---

### TASK-010：软删除标准统一

**任务目标：** 统一软删除标准为 `deleted_at IS NULL`，消除 `status = 0` 和 `deleted_at` 混用。

**修改模块：**
- `backend/routes/customer/detail.js` — 删除操作改为设置deleted_at
- `backend/routes/customer/pool.js` — 查询条件统一
- `backend/routes/customer/assign.js` — 查询条件统一
- 所有查询 `crm_customer` 的文件

**数据库修改：**
- 新增迁移文件 `034_unify_soft_delete.sql`：
  - 将 `crm_customer.status = 0` 的记录同步设置 `deleted_at = NOW()`
  - 不删除status字段（保持向后兼容）
  - 不改变其他表的deleted_at逻辑（已经是标准）

**前端修改：** 无

**后端修改：**
- `customer/detail.js` 的删除操作：从 `SET status = 0` 改为 `SET deleted_at = NOW(), status = 0`
- 所有查询 `crm_customer` 的地方：确保同时检查 `status != 0` 和 `deleted_at IS NULL`
- 逐步将 `status != 0` 条件替换为 `deleted_at IS NULL`
- 保持双条件查询一段时间，确认稳定后移除 `status != 0`

**权限修改：** 无

**风险说明：**
- 中风险 — 改变客户查询逻辑
- 需确保回收站功能仍能正确显示已删除客户
- 数据迁移SQL需在测试环境验证

**测试建议：**
- 删除客户→确认deleted_at被设置
- 客户列表→确认已删除客户不显示
- 回收站→确认已删除客户可显示
- 恢复客户→确认deleted_at被清空
- 公海回收→确认不回收已删除客户
- 统计报表→确认已删除客户不计入

---

## 开发规则提醒

### 禁止

- 一次性生成整个系统
- 一次性修改多个核心模块
- 擅自重构系统
- 修改无关代码
- 跳过分析直接写代码

### 必须

- 小步迭代开发
- 一次只完成一个任务
- 每一步都可回滚
- 每一步都可测试
- 每一步都保证系统稳定

### 未经确认

禁止进入下一任务。
