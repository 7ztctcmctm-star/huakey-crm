# Huakey CRM - System Architecture

## 整体架构

前后端分离架构。

---

## Frontend

frontend/

主要职责：

- 页面展示
- 表单
- 权限显示
- API调用

核心模块：

- views/
- router/
- api/
- permission/
- components/
- composables/
- constants/
- stores/
- utils/
- assets/
- directives/

---

## Backend

backend/

主要职责：

- API
- 权限控制
- 业务逻辑
- 数据处理

核心模块：

- routes/
- controllers/
- services/
- middleware/
- utils/
- config/
- scripts/
- tests/
- docs/
- src/（空壳目录，未实际使用）
- app.js（入口文件）

---

## Database

MySQL 8.0，群晖Docker部署。

主要表（48张）：

crm_业务表（32张）：

- crm_customer
- crm_contact
- crm_follow_up
- crm_follow_plan
- crm_follow_up_reminder
- crm_opportunity
- crm_opportunity_stage_log
- crm_quote
- crm_quote_item
- crm_product
- crm_contract
- crm_payment_plan
- crm_payment
- crm_service_order
- crm_pool_log
- crm_assign_log
- crm_supplier
- crm_supplier_contact
- crm_supplier_qualification
- crm_supplier_rating
- crm_customer_supplier_relation
- crm_scoring_rule
- crm_qualification_reminder
- crm_purchase_order
- crm_purchase_item
- crm_purchase_receipt
- crm_purchase_payment
- crm_attachment
- crm_ai_suggestion
- crm_notification
- crm_invoice
- crm_sales_target

sys_系统表（15张）：

- sys_user
- sys_role
- sys_dept
- sys_log
- sys_permission
- sys_role_permission
- sys_data_permission
- sys_config
- sys_operation_log
- sys_backup_record
- sys_validation_rule
- sys_data_quality_report
- sys_analysis_config
- sys_integration
- sys_email_log

其他：

- schema_migrations

---

## RBAC权限架构

高风险模块。

涉及：

- 登录
- token
- 角色
- 权限
- 数据范围

修改必须谨慎。

---

## 部署架构

### 生产环境（Docker + 群晖NAS）
- 前端+后端：一体化Docker容器（huakey-app）
- 数据库：MySQL 8.0 Docker容器（huakey-mysql）
- 端口：应用6789，MySQL 3307
- 地址：192.168.0.200:6789

### 本地开发（Docker Compose）
- frontend（内置 Nginx，非独立服务）
- backend
- mysql

---

## 文件上传

- **生产环境：** 本地磁盘 + multer（Docker volume持久化）
- **本地开发：** `uploads/` 目录（multer + 本地磁盘）
- Docker volume: `app-uploads:/app/uploads`

---

## AI模块

AI模块仅允许：

- 数据分析
- 查询辅助

禁止：

- 自动执行危险SQL

---

## 中间件

middleware/

- auth（JWT认证）
- logger（操作日志，当前未接入脱敏）
- permission（权限校验）
- rateLimiter（限流）
- validate（请求校验）

---

## 配置模块

config/

- config.default（默认配置）
- database（数据库连接池）

---

## 独立脚本

根目录独立脚本：

- `analyze_query.js`（SQL查询分析）
- `backup.js`（数据库备份）
- `create_sys_log_table.js`（日志表初始化）
- `optimize_indices.js`（索引优化）

`backend/scripts/` 目录：

- `auto_release.js`（公海自动回收）
- `backup.js`（备份脚本）
- `generate_reminders.js`（提醒生成）
- `overdue_reminder.js`（逾期提醒）

---

## 前端路由

共28个路由，主要分组：

- 客户管理（列表/详情/公海）
- 联系人管理
- 跟进记录
- 商机管理
- 报价管理（列表/编辑）
- 合同管理（列表/详情）
- 回款管理
- 售后工单
- 产品管理
- 供应商管理
- 采购管理
- 用户管理
- 部门管理
- 角色管理
- 权限管理
- 操作日志
- 系统配置
- 仪表盘
- 个人中心

---

## API路由

共27组API端点，/api前缀：

- /api/auth（登录认证）
- /api/user（用户管理）
- /api/dept（部门管理）
- /api/role（角色管理）
- /api/permission（权限管理）
- /api/customer（客户管理）
- /api/followUp（跟进记录）
- /api/followPlan（跟进计划）
- /api/opportunity（商机管理）
- /api/quote（报价管理）
- /api/contract（合同管理）
- /api/product（产品管理）
- /api/service（售后服务）
- /api/supplier（供应商管理）
- /api/purchase（采购管理）
- /api/log（操作日志）
- /api/report（报表统计）
- /api/upload（文件上传）
- /api/recycle（回收站）
- /api/reminder（提醒管理）
- /api/config（系统配置）
- /api/backup（数据备份）
- /api/analysis（数据分析）
- /api/ai（AI模块）
- /api/integration（集成接口）
- /api/target（目标管理）
- /api/teamDashboard（团队仪表盘）

---

## 定时任务

4 个定时任务：

| 调度 | 任务 | 环境 |
|------|------|------|
| 每天 01:00 | 公海自动回收 | node-cron（本地）/ Vercel Cron（生产） |
| 每天 02:00 | 供应商评分 + 资质检查 | 同上 |
| 每天 03:00 | 过期日志清理（保留90天） | 同上 |
| 每天 08:30 | 跟进提醒生成 | 同上 |

- 生产环境通过 node-cron 在Docker容器内执行
- 本地开发同样使用 node-cron
- 参见 `backend/app.js`

---

## 当前技术债务

当前存在：

- 测试不足（tests/已存在4个测试文件：auth/contract/customer/supplier）
- 权限逻辑分散
- Redis未完全接入
- 日志系统不足
- 缺少错误监控
- TypeScript缺失
- docs/目录已存在但内容较少

---

## 后续目标

未来目标：

- 权限中心化
- Redis缓存
- 自动化测试
- TypeScript
- WebSocket
- 日志监控
