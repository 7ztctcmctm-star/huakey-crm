# Huakey CRM - Changelog

---

# 2026-06-22

## 前端API层抽取

- 新建 `frontend/src/api/` 目录，建立统一 API 入口
- 新建 `frontend/src/api/customer.js`：客户模块 API（list/detail/add/update/delete/assign/batch-assign/convert/export/360-view/release/assign-rules 等 24 个函数）
- 新建 `frontend/src/api/followUp.js`：跟进模块 API（list/add/update/delete/plan 等 7 个函数）
- 重构 `Customer/List.vue`：10 个 request 调用替换为 API 函数
- 重构 `Customer/Detail.vue`：11 个 request 调用替换为 API 函数（360 视图/联系人/跟进/分配/释放）
- 重构 `Customer/AssignRules.vue`：5 个 request 调用替换为 API 函数（规则 CRUD + 销售用户列表）
- 新建 `frontend/src/api/contract.js`：合同模块 API（list/detail/add/update/delete/approve/export/payment 等 12 个函数）
- 新建 `frontend/src/api/opportunity.js`：商机模块 API（list/add/update/delete/stage/funnel/detail/log 等 8 个函数）
- 重构 `contract/list.vue`：11 个 request 调用替换为 API 函数（列表/删除/模板/导出/回款/审批）
- 重构 `contract/detail.vue`：4 个 request 调用替换为 API 函数（详情/回款添加/回款删除）
- 重构 `opportunity/list.vue`：7 个 request 调用替换为 API 函数（列表/新增/编辑/删除/推进/漏斗/详情）
- 新建 `frontend/src/api/service.js`：售后工单模块 API（list/detail/add/update/delete/assign/batch-assign/start/finish/confirm/types/status-list/priority-list 等 13 个函数）
- 新建 `frontend/src/api/supplier.js`：供应商模块 API（list/detail/add/update/delete/performance/contact/qualification/rating/ranking/compare 等 15 个函数）
- 新建 `frontend/src/api/purchase.js`：采购模块 API（list/detail/add/update-status/receipt/payment/statistics 等 7 个函数）
- 新建 `frontend/src/api/product.js`：产品模块 API（list/add/update/delete/categories/prices 等 8 个函数）
- 重构 `service/index.vue`：14 个 request 调用替换为 API 函数（列表/新增/编辑/删除/分配/批量分配/开始/完成/确认/类型/状态/优先级）
- 重构 `supplier/list.vue`：3 个 request 调用替换为 API 函数（列表/新增/编辑/删除）
- 重构 `supplier/detail.vue`：9 个 request 调用替换为 API 函数（详情/绩效/评分/联系人/资质）
- 重构 `supplier/ranking.vue`：2 个 request 调用替换为 API 函数（排名/对比）
- 重构 `purchase/list.vue`：4 个 request 调用替换为 API 函数（列表/新增/状态变更/统计）
- 重构 `purchase/detail.vue`：4 个 request 调用替换为 API 函数（详情/状态变更/收货/付款）
- 重构 `product/index.vue`：8 个 request 调用替换为 API 函数（列表/新增/编辑/删除/分类/价格管理）
- 新建 `frontend/src/api/report.js`：报表模块 API（21 个函数）
- 新建 `frontend/src/api/approval.js`：审批模块 API（11 个函数）
- 新建 `frontend/src/api/knowledge.js`：知识库模块 API（25 个函数）
- 新建 `frontend/src/api/email.js`：邮件模块 API（7 个函数）
- 新建 `frontend/src/api/competitor.js`：竞品模块 API（6 个函数）
- 新建 `frontend/src/api/inventory.js`：库存模块 API（6 个函数）
- 新建 `frontend/src/api/calendar.js`：日历模块 API（4 个函数）
- 新建 `frontend/src/api/tag.js`：标签模块 API（5 个函数）
- 新建 `frontend/src/api/notification.js`：通知模块 API（3 个函数）
- 重构 23 个辅助模块 Vue 文件：report(4)/approval(3)/knowledge(5)/email(3)/calendar(1)/tags(1)/notification(2)/competitor(2)/inventory(2) 共计 ~76 个 request 调用替换为 API 函数
- **API 层总计**：17 个模块文件，196 个函数，覆盖全部核心+辅助模块
- 新建 `frontend/src/api/quote.js`：报价模块 API（6 个函数）
- 新建 `frontend/src/api/finance.js`：财务模块 API（8 个函数）
- 补充 `customer.js`：batchClaimCustomer + autoAssignCustomer
- 补充 `contract.js`：getPaymentSummary + getMergedPayments + exportPayments + exportPaymentStatement + searchContract
- 重构 `quotation/list.vue` + `edit.vue`：8 个 request 调用替换为 quote API 函数
- 重构 `customer/pool.vue`：8 个 request 调用替换为 customer API 函数（含命名冲突修复）
- 重构 `payment/index.vue` + `reminders.vue` + `reconciliation.vue` + `analysis.vue`：13 个 request 调用替换为 finance/contract API 函数
- **API 层最终总计**：21 个模块文件，216 个函数
- 新建 `frontend/src/api/system.js`：系统管理 API（18 个函数：用户/角色/部门/权限/日志/备份/币种）
- 新建 `frontend/src/api/hr.js`：人力资源 API（10 个函数：员工/组织架构/提成）
- 新建 `frontend/src/api/automation.js`：自动化 API（11 个函数：工作流/智能提醒/分配规则）
- 新建 `frontend/src/api/config.js`：配置 API（4 个函数）
- 新建 `frontend/src/api/platform.js`：开放平台 API（5 个函数：API密钥/Webhook/文档）
- 新建 `frontend/src/api/integration.js`：集成 API（3 个函数）
- 新建 `frontend/src/api/procurementPlan.js`：采购计划 API（4 个函数）
- 补充 `customer.js`：getLeadsList + convertLead + claimLead + markLeadLost + getLeadsStats
- 重构 system(7) + leads(1) + hr(3) + automation(3) + settings(3) + procurement(2) 共 19 个 Vue 文件
- **API 层最终总计**：28 个模块文件，271 个函数，覆盖全部业务模块
- 新建 `frontend/src/api/survey.js`（5 函数）+ `scoring.js`（4）+ `social.js`（3）+ `target.js`（2）+ `analysis.js`（7）+ `auth.js`（6）+ `ai.js`（5）+ `recycle.js`（3）+ `search.js`（1）
- 补充 `followUp.js`：+9 函数（模板/日历/提醒/批量/统计）
- 补充 `customer.js`：+5 函数（模板/质量检查/导入预览/确认）
- 补充 `email.js`：+1 函数（getEmailStats）
- 补充 `notification.js`：+3 函数（getReminderCenter/getPaymentOverdue/getMyReminders）
- 重构 Dashboard/TeamDashboard + survey(6) + scoring(2) + social(1) + target(1) + analysis(2) + ai(2) + login(1) + profile(1) + recycle(1) + search(1) + email(3) + followup(3) + follow-up(2) + notification(1) + layout(1) + components(4) 共 34 个 Vue 文件
- **API 层最终总计**：36 个模块文件，300+ 个函数
- 残留 ~133 个 request 调用为动态路径端点/PUT/DELETE 操作，暂不抽取
- API 层最终收尾：21个API文件补充函数（competitor/email/hr/survey/scoring/automation/procurementPlan/platform/integration/finance/approval/contract/quote/customer/followUp/social/supplier/report/system/inventory）
- Vue文件替换：40+个Vue文件全部替换为 API 函数调用
- 残留 request.xxx() 调用：469 → 1（仅 composables/useUser.js 的 /auth/me）
- 构建验证通过

## Bug修复

- **[P0] 修复跟进列表数据泄露**：POST /api/follow-up/list 补 checkDataPermission + buildDataPermissionWhere，防止跨用户查看跟进记录
- **[P1] 修复报价列表500错误**：crm_quote 与 crm_currency 表 collation 不匹配（utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci），JOIN 时添加 COLLATE 子句
- **[P1] 修复端口配置**：根目录 .env PORT 从 5000 改为 9527，与 backend/.env 保持一致
- **[P1] 修复测试账号密码**：种子数据用户密码哈希更新，boss/sales_wang/sales_li 等账号可正常登录

## Redis缓存接入（P1）

- 新建 backend/config/redis.js：Redis客户端封装，支持 getCache/setCache/clearByPrefix
- 新建 backend/middleware/cache.js：缓存中间件，自动判断是否启用，支持GET/POST请求
- app.js：REDIS_ENABLED=true 时自动连接Redis，失败降级为无缓存模式
- customer/detail.js：客户列表缓存60秒，增删改时自动清除缓存
- report.js：销售漏斗/概览仪表盘缓存300秒
- 缓存key包含userId，避免不同权限用户读到他人缓存
- REDIS_ENABLED=false 时所有新增代码被短路跳过，行为与修改前完全一致

## Joi校验补全（P1）

- service.js: list/add/update/delete/assign/rate 6个路由补 Joi schema
- report.js: sales-funnel/payment/performance/customer-analysis 等查询参数补 queryValidate
- search.js: /global 补 keyword 校验（min:2, max:100）
- log.js: list/export 补分页+过滤参数校验

## Token撤销机制（P1）

- 新建 sys_token_blacklist 表，存储已注销token的SHA256哈希
- middleware/auth.js: 验证token时增加黑名单检查
- auth.js /logout: 登出时将token写入黑名单
- app.js: 每天凌晨3点定时清理过期黑名单记录

---

# 2026-06-18

## Bug修复（P0/P1）

- **[P0] 修复销售漏斗SQL错误**：`opportunity.js` funnel端点 `permParams` 未展开导致 `?` 占位符绑定失败，改为 `[...permParams]` 展开
- **[P1] 修复Migration 056语法错误**：移除 `DELIMITER $$` 语法（mysql2不支持），简化 `STARTS` 表达式
- **[P0] 修复6模块list接口权限漏洞**：contract/invoice/quote/purchase/service/supplier 的 list 路由缺少 `checkPermission` 中间件，任何已登录用户可绕过功能权限访问列表
- **[P2] 修复followPlan内联数据权限**：改用 `checkDataPermission` + `buildDataPermissionWhere` 替代内联角色判断
- **[P2] 修复followupTemplate权限不一致**：`requireManager` 改为 `requireAdmin`，删除重复的 `isAdmin` 检查

## 数据完整性

- **Migration 059**：为核心业务表添加13个外键约束（crm_customer/follow_up/follow_plan/opportunity/contract/quote/invoice → sys_user/crm_customer），全部 ON DELETE SET NULL
- **Migration 060**：为辅助表添加11个外键约束（stage_log/pool_log/calendar/email/notification/payment_reminder/sales_target/competitor_encounter）
- **输入校验补全**：assign.js（2路由）、leads.js（3路由）、reminder.js（5路由）添加 Joi schema 校验

## 错误处理标准化

- **后端错误日志**：全局错误中间件增加请求上下文（userId/method/path/ip/body）
- **进程异常处理**：`unhandledRejection` 标准化日志格式，`uncaughtException` 延迟1秒退出让Docker重启
- **前端Vue错误处理**：添加 `app.config.errorHandler`，生产环境显示友好提示避免白屏

## 操作日志增强

- **字段级变更追踪**：supplier/product/quote/invoice 的 update 路由补 `logFieldChanges`，记录变更前后值
- 现有 customer/detail.js、contract.js、opportunity.js 已有 fieldLog（确认完整）

## 部署脚本优化

- **sync-test.bat**：添加 `chcp 65001`、git clean检查、排除 `*.tar.gz`
- **push-prod.bat**：移除不可靠的 `sudo docker npm install`，改用 tar pipe 同步方式
- **deploy-all.bat**：全部改用ASCII英文，避免编码问题

---

# 2026-06-17

## 代码清理（P1/P2）

- 删除 `backend/src/` 空壳目录（6个空目录，从未实现）
- 删除 `app.js` 中未使用的 `res.success`/`res.error` 响应辅助方法
- 新建 `backend/config/roles.js` 角色常量定义，替代硬编码 roleId
- 更新 `backend/middleware/admin.js` 使用 ROLES 常量，新增 `requireManager` 中间件
- 更新 `backend/routes/hr.js` 使用共享 `requireManager` 代替内联定义

## 数据库优化

- 新建 `sys_log_archive` 归档表，归档30天前的日志（3024条已归档）
- 新建 `evt_archive_sys_log` 定时事件，每月自动归档
- `sys_log` 表从 3.45MB 优化至 2.88MB
- 清理5张表共12个冗余索引：`crm_customer`(3)、`crm_follow_up`(2)、`crm_contract`(3)、`crm_opportunity`(2)、`crm_payment_plan`(2)

---

# 2026-05-27

## 安全

- 修复.env泄露风险
- 更新JWT_SECRET
- 增加.env.example

---

## Docker

- 增加uploads volume持久化

---

## 权限

- 修复RBAC权限判断问题

---

## BUG修复

- 修复登录跳转异常
- 修复客户分页异常

---

## 文档

- 新增AI开发规则
- 新增系统架构文档
