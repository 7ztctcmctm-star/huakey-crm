# API 版本策略

## 当前版本

- **v1**: `/api/v1/*` — 当前主版本
- **旧路径**: `/api/*` — 兼容重定向至 `/api/v1/*`，预计 2026-08-01 下线

## 变更记录

| 时间 | 变更 |
|------|------|
| 2026-06-30 | 所有路由正式迁移到 `/api/v1/`；`/api/` 保留 307 重定向 |

## 重定向行为

请求旧路径 `/api/xxx` 时：

- 返回 HTTP `307 Temporary Redirect`
- 响应头包含：
  - `Deprecation: true`
  - `Sunset: Sat, 01 Aug 2026 00:00:00 GMT`
- 跳转目标：`/api/v1/xxx`

> 307 重定向会保留原始请求方法（POST/PUT/DELETE 等），因此旧客户端在兼容期内可无缝使用。

## 前端配置

`frontend/src/utils/request.js` 中 `baseURL` 已设置为 `/api/v1`：

```js
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  // ...
});
```

如需在特定环境回退到旧路径，可设置环境变量 `VITE_API_BASE_URL=/api`。

## 后端路由挂载

`backend/app.js`：

```js
app.use('/api/v1', apiRouter);
app.use('/api/v1/survey', responseFormat, surveyRoutes);

// 旧路径兼容重定向
app.use('/api', (req, res) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Aug 2026 00:00:00 GMT');
  res.redirect(307, '/api/v1' + req.originalUrl.replace(/^\/api/, ''));
});
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
- [x] `/api/health` 返回 307 并携带 `Deprecation` / `Sunset` 头
- [x] 前端请求全部走 `/api/v1/`
- [x] 后端测试路径全部更新为 `/api/v1/`
- [x] 全量测试通过
