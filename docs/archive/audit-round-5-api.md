# 第五轮：API 审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| 审计路由文件 | 70+ |
| 发现的问题 | 17 |
| 🔴 高危 | 3 |
| 🟡 中危 | 7 |
| 🟢 低危 | 4 |
| ℹ️ 建议 | 3 |

## 🔴 高危问题

### 1. saveUser 前后端 HTTP 方法不匹配（生产 Bug）
- **位置**：`frontend/src/api/system.js:5` + `backend/routes/user.js:66`
- **问题**：前端 `request.put('/user/update', data)` 但后端只注册了 `router.post('/update', ...)`
- **影响**：编辑用户功能在生产环境返回 404
- **修复**：将前端改为 `request.post('/user/update', data)`

### 2. savePermission 接口路径不匹配
- **位置**：`frontend/src/api/system.js:22` + `backend/routes/permission.js`
- **问题**：前端调用 `/permission/save`，后端无此路由（实际是 `/add` 和 `/update-node`）
- **影响**：保存权限节点功能在生产环境返回 404
- **修复**：前端应区分新增/编辑，分别调用 `/permission/add` 和 `/permission/update-node`

### 3. 旧 /api 路径 Sunset 日期临近
- **位置**：`backend/app.js:361`
- **问题**：Sunset 日期 2026-08-01，距今仅 28 天
- **修复**：延后 Sunset 日期或直接移除此重定向

## 🟡 中危问题

### 4. follow-up 相关 URL 前缀不一致
- `/follow-up`、`/followup-templates`、`/follow-plan` 三种写法

### 5. 大量 CRUD 操作使用 POST 而非 PUT/DELETE
- 80% 的路由模块从未使用 PUT 或 DELETE

### 6. error.code 可能为非数字导致 Express 内部错误
- `res.status(error.code || 500)` 模式，当 error.code 为非数字字符串时出错

### 7. 日期参数命名混用 camelCase 和 snake_case
- `report/analytics.js` 同一文件内混用 `startDate` 和 `start_date`

### 8. paginationFields 死代码
- `validate.js` 定义了 `paginationFields` 但无任何路由使用

### 9. survey 模块独立挂载绕过限流和日志
- `app.use('/api/v1/survey')` 不在 apiRouter 内

### 10. 业务错误码系统完全未使用
- `errors/codes.js` 定义了 19 个结构化错误码（如 401001），但无任何路由导入 ErrorCodes

## 🟢 低危问题

### 11. survey 模块独立挂载绕过了 apiLimiter
### 12. 辅助响应函数（utils/response.js）复用率低
### 13. Swagger 文档覆盖率仅 18.6%（13/70+ 文件）
### 14. errorHandler 的 500 消息不友好

## ℹ️ 建议

### 15. ModuleRegistry 试点范围窄（仅 3/42 模块）
### 16. 推广 utils/response.js 辅助函数
### 17. 全量推进 Swagger 文档

---

## 优先修复顺序

1. 修复 saveUser 的 HTTP 方法不匹配
2. 修复 savePermission 的路由不匹配
3. 推迟或移除旧 `/api` 重定向 Sunset
4. 统一 follow-up URL 前缀
5. 统一日期参数命名风格（snake_case）
6. 启用 paginationFields 复用
