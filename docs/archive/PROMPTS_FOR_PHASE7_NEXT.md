<!--
  Phase 7: 新功能开发 — 详细 Prompt（函数级）
  生成日期: 2026-06-30
  基准: 系统架构审计 v2.0
  前提: IMPLEMENTATION_PLAN 94/94 done, 67/67 suites 501/501 tests
  待做: 7 项新任务，总计 12 小时
-->

# Phase 7 — 详细 Prompt（函数级）

---

## 任务 A: sys_log 双表并存清理 (1h, 需 MySQL)

### 背景
logger.js 写入 sys_log，但 sys_operation_log 表也在 migrations 中存在。日志双写致审计追溯不完整。

### A1. 诊断 (15min)
在 MySQL 中执行：
  SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('sys_log', 'sys_operation_log');
在 backend/ 中扫描引用：
  rg "sys_log" backend/ --count
  rg "sys_operation_log" backend/ --count

### A2. 函数 (30min)
在 backend/services/logService.js（如不存在则新建）：

  queryTableUsage(pool):
    查询 sys_log 和 sys_operation_log 两表的行数、最新记录时间
    返回 { sys_log: { rows, latest }, sys_operation_log: { rows, latest } }

  scanCodeReferences():
    使用 child_process.execSync 运行 rg 命令
    统计每个表在 backend/ 中被引用的文件数和行数
    返回 { sys_log: { files, lines }, sys_operation_log: { files, lines } }

  cleanupDualLogs(pool, usage):
    如果 sys_operation_log 行数=0 且引用=0: DROP TABLE sys_operation_log
    如果两表都有数据: 打印警告，建议人工合并
    更新 logger.js 确保只写一张表

### A3. 验收
- logger.js 只引用一张日志表
- 废弃表已删除或迁移已注释

---

## 任务 B: 采购申请流程 (3-4h, 需 MySQL)

### B1. 数据库 migration 066 (15min)
新建 database/migrations/066_create_purchase_request.sql:

  CREATE TABLE crm_purchase_request (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    request_no VARCHAR(50) UNIQUE,
    dept_id INT,
    applicant_id INT NOT NULL,
    expected_amount DECIMAL(12,2),
    reason TEXT,
    status ENUM('draft','pending','approved','rejected','ordered') DEFAULT 'draft',
    approved_by INT,
    approved_at DATETIME,
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_applicant (applicant_id),
    INDEX idx_status (status)
  );

新建 066 对应的 down 脚本（DROP TABLE IF EXISTS crm_purchase_request）。

### B2. Service: purchaseRequestService.js (30min)
新建 backend/services/purchaseRequestService.js，导出以下函数：

  generateRequestNo(pool):
    生成唯一编号: PR + YYYYMMDD + 3位序号(当天自增)
    例: PR20260630001

  createRequest(pool, data, userId):
    data: { title, dept_id, expected_amount, reason }
    调用 generateRequestNo()，INSERT 到 crm_purchase_request
    status = 'draft'
    返回 { id, request_no }

  listRequests(pool, params):
    params: { page, pageSize, status, applicant_id, keyword }
    建 WHERE 子句: 申请人只能看自己的(applicant_id=userId)，管理员看全部
    ORDER BY created_at DESC, LIMIT/OFFSET
    返回 { list, total }

  getRequest(pool, id, userId):
    SELECT by id，验证权限: 本人或管理员可看
    返回 request 对象或 null

  submitRequest(pool, id, userId):
    验证: 只有 draft 状态可提交，只有本人可提交
    UPDATE status = 'pending'
    返回 true / 抛出业务错误

  approveRequest(pool, id, userId):
    验证: userId 是管理员(manageAll || ADMIN_ROLE_CODES)
    验证: 状态须为 'pending'
    UPDATE status='approved', approved_by=userId, approved_at=NOW()
    返回 true

  rejectRequest(pool, id, userId, reason):
    验证: userId 是管理员
    验证: 状态须为 'pending'
    UPDATE status='rejected', reject_reason=reason, approved_by=userId
    返回 true

  cancelRequest(pool, id, userId):
    验证: 仅本人可撤销
    验证: 状态为 'draft' 或 'pending'
    UPDATE status='cancelled' (需先在 ENUM 中加入，或标记为 'rejected')
    返回 true

### B3. 路由: purchase/request.js (20min)
新建 backend/routes/purchase/request.js，挂载 authenticateToken：

  POST /list
    body: { page, pageSize, status, keyword }
    handler: purchaseRequestService.listRequests(pool, { ...params, applicant_id })
    权限: 管理员看全部，非管理员只查自己的(applicant_id=req.user.userId)

  POST /create
    body: { title, dept_id, expected_amount, reason }
    handler: createRequest → 201

  POST /submit/:id
    handler: submitRequest → 200

  POST /approve/:id
    body: (optional) { comment }
    handler: approveRequest → 200

  POST /reject/:id
    body: { reason }
    handler: rejectRequest → 200

  POST /cancel/:id
    handler: cancelRequest → 200

在 app.js 或模块注册器中挂载: apiRouter.use('/purchase', require('./routes/purchase/request'))

### B4. 前端 (1.5h)
新建 3 个 Vue 组件：

  frontend/src/views/purchase/RequestList.vue:
    Props: 无
    Data: list[], loading, pagination, filters{ status, keyword }
    Methods: fetchList(), handlePageChange(), handleSearch()
    Template: el-table + el-pagination + 状态筛选(el-select) + 新建按钮

  frontend/src/views/purchase/RequestForm.vue:
    Props: isEdit(boolean), requestData(object)?
    Data: form{ title, dept_id, expected_amount, reason }
    Methods: submitForm(), validateForm()
    Template: el-form + el-input/el-input-number/el-input(type=textarea)

  frontend/src/views/purchase/ApprovalList.vue:
    Data: list[], loading
    Methods: approveRequest(id), rejectRequest(id)
    Template: el-table(待审批列表) + 通过/驳回按钮 + 驳回理由弹窗

在 frontend/src/router/index.js 添加路由：
  /purchase/requests → RequestList, meta: { permission: 'purchase:request' }
  /purchase/request/create → RequestForm
  /purchase/approvals → ApprovalList, meta: { permission: 'purchase:approve' }

### B5. 验收
- 创建申请 → 提交 → 管理员批准/驳回 → 状态流正确
- 非管理员只能看到自己的申请
- 3 个前端页面正常渲染

---

## 任务 C: 采购比价管理 (2-3h, 需 MySQL)

### C1. 数据库 migration 067 (15min)
新建 database/migrations/067_create_purchase_comparison.sql：

  CREATE TABLE crm_purchase_comparison (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comparison_no VARCHAR(50) UNIQUE,
    request_id INT,
    title VARCHAR(200) NOT NULL,
    product_name VARCHAR(200),
    quantity DECIMAL(10,2),
    unit VARCHAR(20),
    status ENUM('draft','completed','cancelled') DEFAULT 'draft',
    selected_supplier_id INT,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_request (request_id)
  );

  CREATE TABLE crm_purchase_comparison_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comparison_id INT NOT NULL,
    supplier_id INT NOT NULL,
    unit_price DECIMAL(12,2),
    total_price DECIMAL(12,2),
    delivery_days INT,
    payment_terms VARCHAR(200),
    remark TEXT,
    FOREIGN KEY (comparison_id) REFERENCES crm_purchase_comparison(id),
    FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id)
  );

### C2. Service: purchaseComparisonService.js (30min)
新建 backend/services/purchaseComparisonService.js：

  generateComparisonNo(pool):
    生成比价单号：BJ + YYYYMMDD + 3位序号

  createComparison(pool, data, userId):
    data: { request_id?, title, product_name, quantity, unit }
    INSERT to crm_purchase_comparison

  listComparisons(pool, params):
    params: { page, pageSize, status, keyword }
    带 supplier_count 子查询

  getComparisonDetail(pool, id):
    主表 JOIN crm_purchase_comparison_item JOIN crm_supplier
    返回 { comparison, items[{ supplier_name, unit_price, total_price, delivery_days }] }

  addSupplierQuote(pool, comparisonId, quoteData):
    quoteData: { supplier_id, unit_price, total_price, delivery_days, payment_terms, remark }
    INSERT to crm_purchase_comparison_item
    UPDATE 主表 supplier_count+1

  selectSupplier(pool, comparisonId, supplierId, userId):
    UPDATE selected_supplier_id = supplierId, status = 'completed'
    自动计算最优: 最低总价(优先级1) + 最短交期(优先级2)
    返回 selected supplier

  cancelComparison(pool, id, userId):
    UPDATE status = 'cancelled'

### C3. 路由: purchase/comparison.js (20min)
  POST /list                    → listComparisons
  POST /create                  → createComparison
  GET  /detail/:id              → getComparisonDetail
  POST /:id/add-quote           → addSupplierQuote
  POST /:id/select-supplier     → selectSupplier
  POST /:id/cancel              → cancelComparison

### C4. 前端 (1h)
  frontend/src/views/purchase/ComparisonList.vue:
    表格列: 比价单号/标题/产品/供应商数/状态/操作

  frontend/src/views/purchase/ComparisonDetail.vue:
    比价对比表: 各供应商(名称/单价/总价/交期/付款条件)
    el-radio-group 选中供应商 → 调用 selectSupplier

### C5. 验收
- 创建比价单 → 添加 3 家供应商报价 → 选中最低价 → 状态变 completed
- 对比表清晰展示价格/交期差异

---

## 任务 D: 字段级权限 (2h)

### D1. 敏感字段注册表 (15min)
新建 backend/config/fieldPermissions.js：

  module.exports = {
    product:       ['cost_price'],
    quote:         ['cost_price'],
    purchase_item: ['unit_price', 'total_price'],
    supplier:      ['bank_account', 'tax_id', 'contact_phone', 'contact_email'],
    contract:      ['contract_amount'],
  };

### D2. 中间件: checkFieldPermission (30min)
在 backend/middleware/permission.js 中新增导出：

  function checkFieldPermission(module) {
    const FIELD_PERMISSIONS = require('../config/fieldPermissions');
    const sensitiveFields = FIELD_PERMISSIONS[module] || [];
    return (req, res, next) => {
      const isAdmin = req.user.manageAll
        || (req.user.roleCode && ADMIN_ROLE_CODES.has(req.user.roleCode))
        || req.user.roleId === ROLES.ADMIN;
      req.restrictedFields = isAdmin ? [] : sensitiveFields;
      next();
    };
  }

同时在 module.exports 中导出 checkFieldPermission。

### D3. 过滤工具函数 (15min)
在 backend/middleware/permission.js 中新增：

  function stripRestrictedFields(data, restrictedFields) {
    if (!restrictedFields || !restrictedFields.length) return data;
    if (Array.isArray(data)) {
      data.forEach(item => restrictedFields.forEach(f => delete item[f]));
    } else if (typeof data === 'object') {
      restrictedFields.forEach(f => delete data[f]);
    }
    return data;
  }

### D4. 路由挂载 (30min)
在以下路由中添加 checkFieldPermission 并调用 stripRestrictedFields：

  product.js:
    router.use(checkFieldPermission('product'))
    在 list handler 中: result.list = stripRestrictedFields(result.list, req.restrictedFields)

  quote.js:
    router.use(checkFieldPermission('quote'))
    在 list/detail handler 中过滤 cost_price

  purchase.js:
    对采购明细的 list handler: stripRestrictedFields(items, req.restrictedFields)

  supplier.js:
    router.use(checkFieldPermission('supplier'))
    对 supplier detail: stripRestrictedFields(data, req.restrictedFields)

  contract.js:
    router.use(checkFieldPermission('contract'))
    对 contract list/detail: stripRestrictedFields

### D5. 测试 (30min)
新建 backend/tests/fieldPermission.test.js：

  describe('字段级权限'):
    it('管理员看到 cost_price'):
      mock admin user(manageAll=true)，请求 product/list
      expect response.data.list[0].cost_price toBeDefined()

    it('普通销售看不到 cost_price'):
      mock sales user(manageAll=false, roleCode='sales')
      expect response.data.list[0].cost_price toBeUndefined()

    it('采购员看不到 supplier 银行账号'):
      mock purchase user
      expect supplier.bank_account toBeUndefined()

### D6. 验收
- 非管理员无法看到 product/quote 的 cost_price
- 管理员不受限制
- 测试 3/3 通过

---

## 任务 E: 通知 REST API (1.5h)

### E1. 表确认/创建 (10min)
确认 crm_notification 表结构（如不存在则建）：
  id, user_id, type, title, content, is_read, link_url, created_at

### E2. Service: notificationService.js (25min)
新建 backend/services/notificationService.js：

  listNotifications(pool, userId, params):
    params: { page, pageSize, unread_only }
    SELECT * FROM crm_notification WHERE user_id = userId
    AND (unread_only ? is_read=0 : 1=1)
    ORDER BY created_at DESC
    返回 { list, total, unread_count }

  markAsRead(pool, id, userId):
    UPDATE crm_notification SET is_read = 1 WHERE id=? AND user_id=?
    返回 affectedRows

  markAllAsRead(pool, userId):
    UPDATE crm_notification SET is_read=1 WHERE user_id=? AND is_read=0
    返回 updated count

  getUnreadCount(pool, userId):
    SELECT COUNT(*) FROM crm_notification WHERE user_id=? AND is_read=0
    返回 { count }

  createNotification(pool, data):
    data: { user_id, type, title, content, link_url }
    INSERT → 调用 sseManager.broadcast(user_id, notification)
    返回 { id }

### E3. 路由: notification.js (20min)
新建 backend/routes/notification.js：

  GET  /list           → listNotifications
  POST /read/:id       → markAsRead
  POST /read-all       → markAllAsRead
  GET  /unread-count   → getUnreadCount

所有路由挂载 authenticateToken。

### E4. 前端 (30min)
更新 frontend/src/views/notification/index.vue：

  data: notifications[], unreadCount, loading
  methods:
    fetchNotifications(page, unreadOnly) — 调用 GET /list
    handleRead(id) — 调用 POST /read/:id → 更新本地 is_read + unreadCount-1
    handleReadAll() — 调用 POST /read-all → 全部标记 + unreadCount=0
    handleClick(notification) — 标记已读 + router.push(link_url)

  created/mounted: 初始化 fetchNotifications + EventSource 监听(已有 SSE)

顶部导航组件 frontend/src/components/layout/HeaderBar.vue 中显示未读 badge：

  computed: unreadBadge() — 从 notification store 或父组件传入

### E5. 验收
- 通知列表分页展示，未读高亮
- 单条标记已读后计数更新
- 全部已读后 badge 清零
- SSE 新通知实时追加到列表

---

## 任务 F: NAS Nginx 反向代理容器 (1h)

### F1. Nginx 配置文件 (20min)
新建 deploy/nginx-synology.conf：

  server {
    listen 80;
    server_name localhost;

    location /api/ {
      proxy_pass http://app:5000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Trace-Id $http_x_trace_id;
    }

    location /uploads/ {
      proxy_pass http://app:5000;
      proxy_cache STATIC;
      proxy_cache_valid 200 1h;
    }

    location / {
      proxy_pass http://app:5000;
      proxy_cache STATIC;
      proxy_cache_valid 200 30m;
      gzip on;
      gzip_types text/css application/javascript image/svg+xml;
    }
  }

### F2. Docker Compose 更新 (15min)
在 docker-compose.synology.yml 添加 nginx 服务：

  nginx:
    image: nginx:alpine
    container_name: crm-nginx
    ports: ['80:80']
    volumes:
      - ./deploy/nginx-synology.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [app]
    restart: unless-stopped
    networks: [crm-network]
    deploy:
      resources:
        limits: { memory: 64M }

### F3. 验证 (10min)
- docker-compose up 后 curl localhost:80/api/health 返回 200
- 访问前端页面正常
- docker stats nginx 确认内存 < 64MB

---

## 任务 G: 仪表盘角色看板 (1.5h)

### G1. 角色工具函数 (10min)
在 Dashboard.vue 中添加 computed：

  computed: {
    dashboardType() {
      const rc = this.$store.state.user?.roleCode || '';
      if (['super_admin','admin'].includes(rc)) return 'manager';
      if (['purchase','hr','finance','engineer'].includes(rc)) return 'purchase';
      return 'sales';
    }
  }

### G2. 子看板组件 (45min)
新建 3 个组件（如果已有则复用现有内容）：

  frontend/src/components/dashboard/SalesDashboard.vue:
    Props: 无
    Template: 销售漏斗(ECharts) + 今日跟进任务列表 + 本月业绩进度
    数据: GET /api/report/sales-funnel + /api/follow-up/today

  frontend/src/components/dashboard/PurchaseDashboard.vue:
    Template: 采购订单统计卡片 + 待审批申请数 + 最近采购列表
    数据: GET /api/report/purchase-cost + /api/purchase/request?status=pending

  frontend/src/components/dashboard/ManagerDashboard.vue:
    Template: KPI卡片(客户总数/本月新增/合同额/回款额) + 团队业绩排行
    数据: GET /api/report/overview + /api/team-dashboard

### G3. Dashboard.vue 重构 (20min)
合并已有组件（StatsCards/SalesChart/PendingTasks）到对应子看板中：

  <template>
    <SalesDashboard v-if="dashboardType === 'sales'" />
    <PurchaseDashboard v-else-if="dashboardType === 'purchase'" />
    <ManagerDashboard v-else />
  </template>

### G4. 验收
- 销售角色登录: $显示 SalesDashboard（漏斗+任务）
- 采购角色登录: $显示 PurchaseDashboard（订单+审批）
- 管理员登录: $显示 ManagerDashboard（KPI+团队）

---

## 执行建议（最终版）

| 顺序 | 任务 | 预计 | 依赖 | 可并行 |
|------|------|------|------|--------|
| 1 | A: sys_log 双表清理 | 1h | 无 | ✅ |
| 2 | B: 采购申请流程 | 3-4h | 无 | ✅ |
| 3 | C: 采购比价管理 | 2-3h | B (关联申请) | ❌ |
| 4 | D: 字段级权限 | 2h | 无 | ✅ |
| 5 | E: 通知 REST API | 1.5h | 无 | ✅ |
| 6 | F: NAS Nginx 容器 | 1h | 无 | ✅ |
| 7 | G: 仪表盘角色看板 | 1.5h | 无 | ✅ |

**并行策略**: A + B + D + E + F + G 六项可同时启动。C 需等 B 完成（比价关联采购申请）。
**总计**: 12 小时，建议 2 天完成（Day1: A+B+D，Day2: C+E+F+G）。
