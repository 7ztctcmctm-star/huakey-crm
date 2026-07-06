# 第四轮：前端审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| 审计 Vue 文件 | 88 视图 + 30+ 组件 |
| 发现的问题 | 19 |
| 🔴 高危 | 3 |
| 🟡 中危 | 8 |
| 🟢 低危 | 5 |
| ℹ️ 建议 | 3 |

## 🔴 高危问题

### 1. 登录页 captcha SVG 未经过 sanitize（XSS 风险）
- **位置**：`frontend/src/views/login/index.vue:52`
- **问题**：`v-html="captchaSvg"` 直接渲染后端返回的 SVG，未经过 DOMPurify
- **修复**：使用 `v-safe-html` 指令或 `sanitize()` 包裹

### 2. Token 明文 localStorage + SSE URL 传参
- **位置**：`frontend/src/utils/request.js:19`、`frontend/src/utils/sse.js`
- **问题**：JWT token 明文存 localStorage，SSE 连接通过 URL 查询参数传输 token
- **修复**：SSE 改用 httpOnly cookie 认证

### 3. CustomerDetail 路由无权限守卫
- **位置**：`frontend/src/router/index.js:76-80`
- **问题**：`/customer/detail/:id` 没有 `meta.permission`，任何登录用户可通过 URL 直接访问
- **修复**：添加 `meta: { permission: 'customer:list' }` 或在组件内做后端权限校验

## 🟡 中危问题

### 4. NotificationBadge SSE 连接未在 onUnmounted 中断开
### 5. keep-alive 缓存组件缺少 onDeactivated 清理（ECharts 实例未 dispose）
### 6. CustomerList 缺少 onActivated 刷新逻辑
### 7. DOMPurify 允许的 href 协议未限制（javascript: / data:）
### 8. backup.vue setTimeout 无 onUnmounted 清理
### 9. SearchOverlay blur setTimeout 无清理（低概率，200ms）
### 10. 路由守卫 dynamic import 缺少 try-catch 保护
### 11. report/index.vue Promise.all 和 fetchPurchaseCost 缺少 .catch()

## 🟢 低危问题

### 12. Pinia 安装了但无任何 store 定义（死依赖）
### 13. 8 个组件超过 500 行（最大 973 行）
### 14. v-permission 指令仅在 mounted 时执行一次，非响应式
### 15. v-safe-html 指令零使用（基础设施存在但未被使用）
### 16. GlobalErrorBoundary 未覆盖布局组件（HeaderBar/Sidebar/AiChat）

## ℹ️ 建议

### 17. 无权限刷新机制——权限变更后需重新登录
### 18. 多处空 `.catch(() => {})` 静默吞错
### 19. userInfo 多处分散从 localStorage 读取

## 良好方面
- 事件监听管理规范：所有 addEventListener 有 removeEventListener
- 定时器清理覆盖良好（layout、SearchOverlay、useCountUp、useChart）
- 全局 axios 拦截器提供统一的错误处理安全网
- 权限指令使用广泛（覆盖主要 CRUD 操作）
- GlobalErrorBoundary 提供了 Vue 层的错误边界

## 优先修复顺序

1. captcha SVG XSS：加 sanitize
2. SSE token URL 传参：改用 cookie
3. 敏感路由补权限元信息
4. NotificationBadge SSE 断开
5. DOMPurify href 协议限制
6. Promise 链补 .catch()
7. CustomerList 添加 onActivated
8. keep-alive 组件添加 onDeactivated
