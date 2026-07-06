# 第一轮：代码规范审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| 审计文件数 | 200+ |
| 发现的问题 | 17 |
| 🔴 高危 | 3 |
| 🟡 中危 | 6 |
| 🟢 低危 | 5 |
| ℹ️ 建议 | 3 |

## 🔴 高危问题

### 1. Frontend 零 ESLint 覆盖
- **位置**：`frontend/` 整个目录
- **说明**：无 `.eslintrc` 配置、无 `eslint` 依赖，119 个 Vue 文件无任何 lint 检查
- **修复**：添加 ESLint + eslint-plugin-vue 配置

### 2. migrations 目录内含 node_modules
- **位置**：`database/migrations/node_modules/`
- **说明**：误安装的 npm 包（mysql2、dotenv 等十多个包），约 500+ 个文件
- **修复**：删除整个 node_modules 目录和 package.json

### 3. 分页代码 40+ 处重复
- **位置**：28+ 个路由文件
- **说明**：Joi 分页 schema、参数解构、透传逻辑在几乎所有列表接口中重复定义
- **修复**：抽取 `paginate.js` 公共中间件或 Joi schema

## 🟡 中危问题

### 4. Vue 视图文件命名风格混乱
- PascalCase（`Detail.vue`）与全小写（`detail.vue`）在同一目录下并存

### 5. Services 命名双模式
- `XxxService.js`（48个）和 `XxxRouteService.js`（17个）无统一命名约定

### 6. 路由组织架构不一致
- 子目录聚合（contract/、customer/）+ 扁平文件（其余 43 个模块）混用

### 7. Controllers 仅部分采用
- 仅 4 个 Controller，其他模块直接从路由调用 services

### 8. ModuleRegistry 仅 3 个模块注册
- customer、product、report，其他 40+ 模块未使用

### 9. app.js pool 定义位置不当
- 第 293 行使用 pool，但 `const pool = require(...)` 在第 398 行

## 🟢 低危问题

### 10. 路由文件命名混用 camelCase 和 kebab-case
### 11. follow-up 与 followup 两个目录并存（同一个业务域）
### 12. 两份 ESLint 配置并存（根目录 + backend）
### 13. 10 个空目录存在
### 14. lint-staged 仅覆盖 backend

## ℹ️ 建议

### 15. 无 TODO/FIXME 标记——技术债务未被显式追踪
### 16. auth.js 和 metrics.js 直接在路由中写 SQL（未通过 service 层）
### 17. 弃用代码未清理（roles.js 中的旧角色 ID 等）

---

## 优先修复顺序

1. 清理 `database/migrations/node_modules/`
2. 为 frontend 添加 ESLint 配置
3. 抽取分页公共逻辑消除重复
4. 统一 Vue 文件命名规范
5. 决定并推进架构方向（Controllers + ModuleRegistry 去留）
