# 前端权限收口：高危按钮补 v-permission + 权限刷新机制（C2，2026-10-21）

> 对应《全面审计与企业级优化方案 2026-10-16》Phase C 步骤 C2。
> 目标：消灭「页面有按钮、后端 403」的死按钮；权限变更后前端缓存即时失效。

## 一、改动总览

| # | 项 | 文件 | 说明 |
|---|---|---|---|
| 1 | 六个页面高危按钮补守卫 | `views/system/user.vue`、`views/system/dept.vue`、`views/system/tags.vue`、`views/competitor/index.vue`、`views/competitor/detail.vue`、`views/product/index.vue` | 见第二节映射表 |
| 2 | 403 触发权限刷新 | `utils/request.js` + `composables/useUser.js` | 新增 `refreshPermissions()`；403 时带 10s 冷却触发一次 |
| 3 | SSE 权限变更推送 | `services/userRouteService.js`（后端）+ `utils/sse.js`（前端） | 角色/部门变更 → 推 `permission-changed` → 前端强制刷新 |
| 4 | 移除 pinia | `package.json` / `package-lock.json` / `src/tests/setup.js` | main.js 从未 `app.use(pinia)`，全仓无 store 定义 |

## 二、按钮 ↔ 后端门禁映射（事实源 = 后端路由中间件）

| 页面:按钮 | 后端门禁 | 前端守卫 | 备注 |
|---|---|---|---|
| user.vue 新增用户 | `checkPermission('system:user:add')` | `v-permission="'system:user:add'"` | 码由 boss+hr 持有 |
| user.vue 编辑 / 重置密码 | `checkPermission('system:user:edit')` | `v-permission="'system:user:edit'"` | 重置密码后端同码 |
| user.vue 删除 | `checkPermission('system:user:delete')` | `v-permission="'system:user:delete'"` | |
| user.vue 保存（新增/编辑共用） | add 或 edit | `v-permission="['system:user:add','system:user:edit']"` | 任一写权限即可见，后端按动作分流 |
| dept.vue 新增/编辑/删除/保存 | **`requireAdmin`** | `v-if="isAdmin"` | 见下方说明① |
| tags.vue 新增/编辑/删除/保存 | `checkPermission('tag') + requireManager` | `v-if="isManager"` | 见下方说明② |
| competitor/index.vue 新增/编辑/删除/保存 | `competitor:add/edit/delete` | 同名 `v-permission` | 码由 boss+manager 持有 |
| competitor/detail.vue 新增/删除 交锋与情报 | 增改用 `competitor:edit`，删除用 `competitor:delete` | 同名 `v-permission` | |
| product/index.vue 删除价格 / 添加价格 | `checkPermission('product')` | `v-permission="'product'"` | C1 已评估：价格端点统一 product 码 |
| product/index.vue 保存（新增/编辑共用） | add 或 edit | `v-permission="['product:add','product:edit']"` | 页面原有 add/edit/delete 守卫，本次补齐保存 |

**说明①（dept 为何不用 v-permission）**：`routes/dept.js` 的 add/update/delete 挂的是
`requireAdmin` 而非权限码。该中间件放行 `manageAll`（库中实际仅 boss；super_admin/admin
为 `config/roles.js` 注明的遗留 code）。前端 `isAdmin`（manageAll）与之严格同义。
注意 hr 可经路由 `permission:'system:user'` 打开组织架构页，但增改删会 403——
按钮必须按 `isAdmin` 隐藏，不能按页面可见性推断。

**说明②（tags 为何不用 v-permission）**：`routes/tag.js` 的 `POST /manage` 是
`checkPermission('tag') + requireManager` 成对。`tag` 码七角色全持有、不构成区分，
有效门禁是 `requireManager`（manageAll 或 roleCode==='manager'）。
`composables/useUser.js` 新增的 `isManager` computed 与之对齐（含语义注释）。

## 三、权限缓存失效机制（两层）

### 3.1 被动层：403 触发一次强制刷新

`utils/request.js` 响应拦截器 403 分支：非 `/auth/me`、非登录页时，距上次刷新超过
10s 则触发 `refreshPermissions()`，再弹错误提示。冷却窗口避免「用户本就无权限时
每个 403 都打一次 /auth/me」的放大效应；在途去重由 useUser 内部保证。

### 3.2 主动层：SSE 单通道推送

- 后端 `services/userRouteService.js` `updateUser`：`role_id` 或 `dept_id` 变更时，
  在既有 `clearPermissionCache(id)` 之后 `sseManager.send(id, { type: 'permission-changed', action: 'refresh' })`
  （best-effort，try/catch 包裹，推送失败不影响更新主流程）。
  部门变更也推送的原因：`/auth/me` 下发的 dataPermissions 随部门走。
- 前端 `utils/sse.js` `onmessage`：`payload.type === 'permission-changed'` 时调用
  `refreshPermissions()`，其余消息仍走既有 `messageCallbacks` 分发（通知链路不变）。

### 3.3 `refreshPermissions` 语义（composables/useUser.js）

绕过 `authChecked` 短路重新请求 `/auth/me` 并更新 `userInfo`；模块级 `refreshPromise`
做在途去重；返回刷新后是否仍处于登录态。刷新后 `v-permission` 指令依赖的
`userInfo.value.permissions` 更新，按钮即时显隐（指令在 mounted 时求值，
动态显隐依赖组件重渲染——列表行按钮随表格数据刷新，对话框按钮随打开时机求值，
均在实际使用路径上覆盖）。

## 四、测试

| 测试 | 覆盖 |
|---|---|
| `tests/unit/composables/useUser.test.js`（+4 例） | `isManager` 四种角色形态；`refreshPermissions` 绕过短路重拉、并发去重、失败清空 |
| `tests/unit/utils/sse-permission.test.js`（新，2 例） | `permission-changed` 触发刷新；普通通知/坏 JSON 不触发且不抛 |
| `tests/unit/userRouteServiceSse.test.js`（新，4 例） | 角色/部门变更推送；无关字段不推；推送失败不影响主流程 |
| `tests/user.test.js`（既有 11 例） | HTTP 层回归（sseManager 无连接时为 no-op） |
| `views/templateBindings.test.js` | 六个改动 SFC 全量编译 |

结果：前端 vitest 串行 **25 文件 / 159 例全绿**（首跑 1 例登录表单 30s 超时未复现，
属 vitest.config.js 注释与 MEMORY 已记录的 flake 家族）；后端相关套件 15+4+4 全绿；
`eslint --max-warnings=0` 零告警；前端生产构建通过。

> ⚠️ 过程教训（已转为测试加固）：`refreshPermissions` 最初只作为 `useUser()` 返回值
> 属性存在，而 `utils/sse.js` 按**模块级命名导出**导入——首版 SSE 单测因整模块 mock
> 掩盖了该缺失，是**生产构建**（rollup 命名导出检查）抓出来的。已将 `refreshPermissions`
> 提为模块级命名导出（useUser() 返回值保留同名属性，双通道可用），并把 SSE 单测改为
> 只 mock 底层 request、走真实调用链，防再被 mock 掩盖。

## 五、与计划原文的偏差及理由

计划第 1 条要求 dept.vue:33 / tags.vue:42 也「补 v-permission」。实测这两个页面的
后端写入门禁是**角色中间件而非权限码**（见第二节说明①②），补权限码会出现
「按钮照显、点了 403」（tag 码全员持有）或「该看到的人被隐藏」（dept 无 CRUD 码）。
故改用与后端同语义的 `isAdmin` / `isManager` 角色守卫，并在 `useUser` 中补
`isManager` 共享 computed。此偏差已在代码注释与本文件留痕。

## 六、遗留

- 对话框类按钮的 `v-permission` 在 mounted 时求值：若用户权限在对话框打开期间
  被变更，已渲染的对话框不会自动隐藏按钮（SSE 刷新只更新 userInfo，不主动关闭对话框）。
  实际影响极小（需恰好命中秒级窗口），记录备查。
- 前端无 ESLint（项目既定，靠 templateBindings 全量 SFC 编译兜底）；
  D2 步骤计划给 frontend 配 ESLint，届时可将本类守卫纳入静态检查。
