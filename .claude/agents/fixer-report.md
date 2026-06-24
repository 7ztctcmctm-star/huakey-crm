---
name: fixer-report
description: 给 report.js 3个端点补权限
tools: Read, Edit, Bash
---

只改 backend/routes/report.js，给以下 3 个端点加 checkPermission('report')：

1. GET /overview — router.get('/overview', authenticateToken, checkPermission('report'), cache(300), ...
2. GET /today-tasks — router.get('/today-tasks', authenticateToken, checkPermission('report'), cache(30), ...
3. GET /quick-stats — router.get('/quick-stats', authenticateToken, checkPermission('report'), cache(120), ...

checkPermission 已在文件顶部引入，无需额外 import。
