# 客户中心重构收尾报告（Cleanup）

> 生成时间：2026-08-04
> 范围：客户中心拆分（潜客池 / 正式客户 / 公海池）后的回归修复 + Dead Code 清理 + 测试同步

---

## 一、修改文件列表

### 1. 测试同步（断言对齐已迁移的 API / 数据模型）

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/tests/unit/api/customer.test.js` | 4 个断言 `/customer/*` → `/customers/*`（Phase 5 端点迁移） |
| `backend/tests/unit/services-cronService.test.js` | `getNearRecycleCustomers` 参数补 `POOL_STATUS.PRIVATE`；`autoReleaseCustomers` SQL `pool_status = 1` → `pool_status = ?`，参数 `['sea',[1]]` → `['sea','sea',[1]]` |
| `backend/tests/cronJobs.test.js` | auto-release UPDATE 断言 `pool_status = 1` → `pool_status = ?`，参数 `['sea',[1,2]]` → `['sea','sea',[1,2]]` |
| `backend/tests/services/customerService.test.js` | `releaseCustomer` UPDATE 断言 `pool_status = 1` → `pool_status = ?`，补参数 `['sea',1]` |
| `backend/tests/config.test.js` | 补 `process.env.WECHAT_WEBHOOK_URL`（`testNotification` 前置检查，`sendText` 已 mock） |

### 2. Dead Code 清理

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/api/customer.js` | 删除 10 个 0 引用 export（见下节） |

---

## 二、删除的废弃代码

### 前端废弃组件（6 个，整文件删除）

均位于 `frontend/src/components/customer/`，全仓 0 引用（`@/components/customer/...` 路径无 import）：

| 文件 | 废弃原因 |
|------|----------|
| `BatchActions.vue` | 批量操作已下沉到各独立 List 页内联 |
| `ContactList.vue` | 联系人列表已内联到 `views/customer/Detail.vue` |
| `CustomerFilter.vue` | 与 `views/customer/components/CustomerFilter.vue` 同名重复，新代码用后者 |
| `CustomerInfo.vue` | 0 引用 |
| `CustomerTable.vue` | 与 `views/customer/components/CustomerTable.vue` 同名重复 |
| `FollowUpTimeline.vue` | 跟进时间线已内联到 Detail 页 |

> 保留：`SalesTimeline.vue`（被 `views/customer/Detail.vue` 引用）

### 前端废弃 API 导出（10 个，从 `api/customer.js` 删除）

全仓 Grep 确认前端业务代码 0 引用（匹配项均在 api 文件自身定义处、后端同名方法、docs 文档、后端测试）：

| 函数 | 废弃原因 |
|------|----------|
| `claimCustomer` | 公海认领走新 `/pool/claim`（pool.js API） |
| `convertCustomer` | 文件内已标 `@deprecated`，由 `forwardCustomer`/`backwardCustomer` 替代 |
| `convertToCustomer` | 潜客转化走新 `/leads/convert` |
| `batchClaimCustomer` | 0 引用 |
| `autoAssignCustomer` | 自动分配迁至 `automation/assign-rules` |
| `importCustomers` | 旧版整体上传，已由 `getCustomerTemplate`+`importPreview`+`importConfirm` 三步式替代 |
| `getFollowPlanList` | 跟进计划合并到 `crm_follow_up`（is_plan=1） |
| `addFollowPlan` | 同上 |
| `completeFollowPlan` | 同上 |
| `cancelFollowPlan` | 同上 |

### 后端废弃服务（1 个，整文件删除）

| 文件 | 废弃原因 |
|------|----------|
| `backend/services/followPlanRouteService.js` | 文件头标 `@deprecated`，逻辑已合并至 `followUpService.js`，对应 `/follow-plan/*` 路由已返回 410 Gone，全仓 0 引用 |

---

## 三、修复的测试

| 测试文件 | 失败用例 | 根因 | 修复方式 |
|----------|----------|------|----------|
| `frontend customer.test.js` | 4 个 API 路径断言 | Phase 5 端点 `/customer/*` → `/customers/*`，测试未同步 | 同步断言路径 |
| `backend services-cronService.test.js` | `getNearRecycleCustomers` ×2、`autoReleaseCustomers` ×1 | 迁移 097 将 `pool_status` 从 TINYINT(0/1) 改为 VARCHAR('private'/'sea') 并参数化，测试仍用旧字面量 | 同步参数与 SQL 断言 |
| `backend cronJobs.test.js` | `auto-release` 批量更新 | 同上 | 同上 |
| `backend customerService.test.js` | `releaseCustomer` UPDATE | 同上 | 同上 |
| `backend config.test.js` | `test-notification` 返回 400 | `testNotification` 检查 `WECHAT_WEBHOOK_URL` 未配置即抛 AppError，测试未设环境变量（`sendText` 已 mock） | 补 `process.env.WECHAT_WEBHOOK_URL` |

> 共修复 5 个测试文件、10 个失败用例。**未修改任何业务代码**，仅同步测试断言与测试环境。

---

## 四、当前测试结果

### 前端（frontend）

```
npm test
Test Files  9 passed (9)
     Tests  37 passed (37)
```

### 后端（backend）

```
npm test
Test Suites: 100 passed, 100 total
     Tests: 978 passed, 978 total
```

---

## 五、当前 Build / Lint 结果

### 前端 Build

```
npm run build
✓ built in 23.27s
```

- exit code 0
- **无 Vue 编译警告**
- `utils/time.js` 正常打包为 `time-C5uTeYnh.js`

### 后端 Lint

```
npm run lint (eslint .)
✖ 8 problems (0 errors, 8 warnings)
```

- **0 errors**
- 8 warnings 均为**既有问题，非本次改动引入**：
  - `routes/pool.js:20` `checkDataPermission` 未使用
  - `services/customerService.js:14` `isValidPoolStatus` 未使用、`:1081` `reason` 未使用
  - `backend/tmp/*.js`（4 个临时脚本：空 block / 未使用变量）

> 前端无 ESLint 配置（根目录 `.eslintrc.js` 的 `ignorePatterns` 明确忽略 `frontend/`），前端检查以 `npm run build` 的 Vue 编译警告为准，已清零。

---

## 六、残留技术债（需确认，不阻塞下一模块）

以下均**非 Dead Code**（仍被活跃调用或属兼容设计），需业务确认后处理：

### 1. `leadsService.js` @deprecated 标注矛盾

`backend/services/leadsService.js` 文件头标 `@deprecated`，但 `customerController.js` 仍活跃调用其 7 个方法（`getLeadsList`/`convertLead`/`batchConvert`/`importLeads`/`claimLead`/`markLeadLost`/`getLeadsStats`）。标注与使用不符，需确认是移除标注还是完成迁移。

### 2. `legacyStatusToCode` 旧数字状态兼容映射

`backend/services/customerService.js:46-58` 与 `customerDetailService.js:14-24` 各有一份 `legacyStatusToCode`，用于迁移 070/097 后的过渡兼容。若旧前端已全量切换到新字符串状态码，可删除。

### 3. `customer:pool` 权限码与新码并存

迁移 098 引入新权限码（`pool:view`/`pool:claim`/`customer:release`），但旧码 `customer:pool` 仍保留并被多处使用：
- `frontend/src/views/pool/List.vue:66` 认领按钮 `v-permission="'customer:pool'"`
- `backend/routes/customer/{module,center,assign}.js` 多处 `checkPermission('customer:pool')`
- `backend/scripts/init_role_permissions.js`、`database/seeds/permission_data.sql`、`frontend/src/views/system/role.vue` 角色/权限预设

存在前后端权限码不一致风险（前端用旧码，后端新 `pool.js` 路由用 `pool:claim`），需统一迁移。

### 4. `/customer/*` 兼容层端点

前后端均保留 `/customer/*` 兼容层（内部调用相同 controller）。属设计上的向后兼容，旧书签/外链过渡期保留。

### 5. `backend/tmp/` 临时脚本

4 个临时脚本产生 lint warnings，按项目约定（tmp/ 不应进入生产仓库）应在部署前清理。

### 6. 既有 lint warnings（非客户模块）

`routes/pool.js`、`services/customerService.js` 的未使用变量（`checkDataPermission`/`isValidPoolStatus`/`reason`）属既有问题，按"不要修改无关模块"未处理。

---

## 七、是否可以进入下一模块开发

**可以。**

判定依据：
1. ✅ 所有测试通过（前端 37/37，后端 978/978）
2. ✅ 前端 Build 通过，无 Vue 编译警告
3. ✅ 后端 Lint 0 errors（8 warnings 均为既有、非本次引入）
4. ✅ Dead Code 已清理（6 废弃组件 + 10 废弃 API + 1 废弃服务文件）
5. ✅ 失败测试已全部修复（10 个用例，仅改测试断言，未动业务代码）
6. ⚠️ 残留技术债均为"需确认"项（兼容层 / 标注矛盾 / 权限码迁移），不阻塞功能开发，建议在下一迭代专项处理权限码统一（技术债 #3）

---

## 八、本次未处理项说明

按"不要修改无关模块"约束，以下未在本任务处理：

- `customer:pool` 权限码统一迁移（涉及前后端 + DB + 角色预设，建议专项）
- `leadsService.js` @deprecated 标注修正（需业务确认迁移方向）
- `legacyStatusToCode` 兼容层删除（需确认旧前端全量切换）
- `backend/tmp/` 临时脚本清理（部署前运维操作）
- 既有 lint warnings（pool.js / customerService.js 未使用变量）
