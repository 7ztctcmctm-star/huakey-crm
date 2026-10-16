# Sales Analytics Permission Validation

> **验证日期**: 2026-08-07
> **类型**: 数据权限闭环验证（Phase 5.5.4）

---

## 1. 验证范围

Sales Analytics 四个接口的数据权限：
```
GET /analytics/sales/overview
GET /analytics/sales/funnel
GET /analytics/contract/revenue
GET /analytics/payment/collection
```

## 2. 角色权限矩阵

| 角色 | 数据范围 | 实现 |
|------|---------|------|
| admin/super_admin | 全部 | manageAll → 无过滤 |
| manager | 本部门 + 子部门 | RECURSIVE CTE dept_tree |
| sales | 仅自己 | owner_id = ? |

## 3. 验证结果

### Backend 集成测试（5/5 通过）

| # | 用例 | 结果 |
|---|------|------|
| 1 | admin: overview 无 owner 过滤（全部） | ✅ |
| 2 | manager: 含部门+子部门过滤（RECURSIVE） | ✅ |
| 3 | sales: 只能看自己 owner_id | ✅ |
| 4 | sales: funnel 也应用 owner_id 过滤 | ✅ |
| 5 | sales: contract revenue 用 create_by 过滤 | ✅ |

### 发现并修复的问题

**缺陷**：`salesAnalyticsService.buildScope` 的 manager 分支原先只用 `dept_id = 当前部门`（不含子部门），与 RBAC 权威 `checkDataPermission` 的 `dept_and_sub`（递归 getSubDeptIds）语义不符。

**修复**：改用 MySQL 8 `WITH RECURSIVE dept_tree` 递归获取本部门+所有子部门，与 `getSubDeptIds` 语义一致。

### 完整后端测试
106/107 套件（1033/1034），唯一失败为 pre-existing `businessFlow.customer.test.js`（与 Analytics 无关）。

## 4. 检查项

| 检查 | 结果 |
|------|------|
| 无数据越权 | ✅ sales 仅 owner_id，manager 部门范围，admin 全部 |
| 无缓存污染 | ✅ analytics 接口未加 cache 中间件（实时查询） |
| 无前端硬编码数据 | ✅ SalesAnalytics.vue 全部从 API 获取 |
| 无权限绕过 | ✅ 所有接口走 authenticateToken + buildScope |

## 5. 前端验证

- SalesAnalytics.vue 含 loading/empty/error 三状态
- API 403/error 时显示 el-alert（前端测试 test 3 覆盖 error 状态）
- 前端组件测试 3/3 通过，完整前端测试 40/40，build 通过

---

*验证完成。Analytics 权限闭环已建立，修复仅限 Analytics 范围（buildScope），未改 RBAC 模型/数据库/其他模块。*
