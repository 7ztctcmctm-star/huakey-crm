# API 版本策略

## 当前版本

- **v1**: `/api/v1/*` — 当前主版本
- **旧路径**: `/api/*` — 已于 2026-07-27 移除 307 兼容重定向，旧路径直接返回 404

## 变更记录

| 时间 | 变更 |
|------|------|
| 2026-06-30 | 所有路由正式迁移到 `/api/v1/`；`/api/` 保留 307 重定向 |
| 2026-07-27 | 移除 `/api/` 到 `/api/v1/` 的 307 重定向；部署脚本、Nginx、Docker healthcheck 统一升级为 `/api/v1/` |

## 重定向行为

> 自 2026-07-27 起，旧路径 `/api/xxx` 的 307 兼容重定向已移除。
> 请求旧路径时将直接返回 `404 Not Found`，请所有客户端使用 `/api/v1/xxx`。

## 前端配置

`frontend/src/utils/request.js` 中 `baseURL` 已设置为 `/api/v1`：

```js
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  // ...
});
```

`VITE_API_BASE_URL` 必须设置为 `/api/v1` 或完整域名路径，旧 `/api` 前缀不再可用。

## 后端路由挂载

`backend/app.js`：

```js
app.use('/api/v1', apiRouter);
app.use('/api/v1/survey', responseFormat, surveyRoutes);

// 不再提供 /api 旧前缀兼容，所有请求必须使用 /api/v1
```

## 测试路径

后端测试统一使用 `/api/v1/` 路径，例如：

```js
app.use('/api/v1/auth', authRoutes);
// ...
await request(app).post('/api/v1/auth/login');
```

## 后续版本规划

- **v2** 发布时：
  1. 在 `app.js` 中新增 `app.use('/api/v2', apiV2Router)`
  2. 将 `/api/v1` 加入 Sunset 重定向链
  3. 更新前端 `baseURL` 为 `/api/v2`
  4. 更新本文档

## 验收检查项

- [x] `/api/v1/health` 返回 200
- [x] 旧 `/api/health` 不再返回 307（直接 404）
- [x] 前端请求全部走 `/api/v1/`
- [x] 后端测试路径全部更新为 `/api/v1/`
- [x] Nginx / Docker healthcheck / 部署脚本全部使用 `/api/v1/`
- [x] 全量测试通过
