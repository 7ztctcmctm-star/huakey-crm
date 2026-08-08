# Sales Analytics Permission Validation

> **验证日期**: 2026-08-07 | **类型**: 数据权限闭环验证

## 1. 角色权限矩阵
| 角色 | 数据范围 | 实现 |
|------|---------|------|
| admin/super_admin | 全部 | manageAll -> 无过滤 |
| manager | 本部门+子部门 | RECURSIVE CTE dept_tree |
| sales | 仅自己 | owner_id = ? |

## 2. 验证结果
Backend 集成测试 5/5 通过:
1. admin: overview 无 owner 过滤 ✅
2. manager: RECURSIVE 部门+子部门 ✅
3. sales: owner_id = ? ✅
4. sales: funnel owner 过滤 ✅
5. sales: contract revenue create_by 过滤 ✅

## 3. 发现并修复
缺陷: buildScope manager 原先只用 dept_id=当前部门(不含子部门), 与 checkDataPermission dept_and_sub 不符。
修复: WITH RECURSIVE dept_tree 递归获取本部门+子部门。

完整后端测试 106/107 (唯一失败 pre-existing businessFlow.customer)。

## 4. 检查项
- 无数据越权: sales=owner, manager=dept范围, admin=全部 ✅
- 无缓存污染: analytics 无 cache 中间件 ✅
- 无前端硬编码: 全从 API 获取 ✅
- 无权限绕过: authenticateToken + buildScope ✅

## 5. 前端验证
SalesAnalytics.vue loading/empty/error 三状态, 前端测试 3/3, 完整 40/40, build 通过。
