---
name: fixer-cron
description: 定时任务 rowCount bug
tools: Read, Edit
---

改 backend/app.js 的 log-cleanup 定时任务：

将 `result.rowCount` 改为 `result[0].affectedRows`，同时将 `const result = await pool.query(...)` 改为 `const [result] = await pool.query(...)`。

MySQL2 的 pool.query 返回 [rows, fields]，DELETE 语句返回的 affectedRows 在 result[0] 中。
