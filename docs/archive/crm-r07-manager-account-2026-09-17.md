# R-07 manager 演示账号 —— 完成报告（2026-09-17）

> 编制：David ｜ 依据：PRD《HuakeyCRM 下一步》P1 · R-07
> 结论：**R-07 验收项全部达成**；过程中发现并修掉 2 个连带缺陷（均与 manager 视角可用性直接相关）。

---

## 一、验收项对照

| PRD 验收标准 | 结果 | 证据 |
|---|---|---|
| 可用 manager 账号登录 | ✅ | `demo_manager` / `Demo@123456` 登录返回 `code 200` |
| 权限码**仅含 manager 范围** | ✅ | `/auth/me` 返回 `permissionsCount = 79`，与 `sys_role_permission` 中 manager 角色的 79 条**完全一致**；`system:role = false`（无系统管理权限）；`dashboard = true` |
| **roleCode 驱动，无硬编码 roleId** | ✅ | 登录返回 `roleCode = 'manager'`；本轮新增代码一律按 `roleCode` / `dataPermissions` 判定（详见 §三） |
| 非破坏性（仅新增演示数据） | ✅ | 只在 `database/seeds/demo_users.sql` 追加 1 条 `INSERT IGNORE`；脚本幂等（重复执行不覆盖既有账号） |

新增账号：`demo_manager`（id=10，role=**manager**，dept=**Demo演示部门**，`is_demo=1`，密码与其它演示账号统一）。

---

## 二、⚠️ 一处重要更正（我此前的结论有误）

此前在 R-05 报告与工作记忆中我写过：

> 「`sys_data_permission` 里 **role 4(manager) 无任何配置行** ⇒ manager 实际落到默认 `self`；要『看团队』必须补 `data_scope='dept'`（影响全系统，需拍板）」

**该结论是错的**，系排查 SQL 用错列名/口径所致。实际数据：

| 角色 | `sys_role.view_all / manage_all` | `sys_data_permission.data_scope` |
|---|---|---|
| boss(1) | 1 / 1 | `all`（多模块） |
| finance(2) | 1 / 0 | — |
| super_admin(3) | 1 / 1 | — |
| **manager(4)** | **0 / 0** | **`dept_and_sub`（12 个模块：customer/contract/opportunity/quotation/report/service/…）** |
| sales(5) | 0 / 0 | `self` |

⇒ **「manager 看本部门及下级部门」本来就是配置好的，不需要任何拍板**。

**真正的缺陷是另一件事**：前端的「团队筛选」显隐判据只看 `viewAll/manageAll`（两个都是 0），
于是 **manager 明明有 dept_and_sub 却看不到筛选器** —— 与 PRD §4.1「团队筛选（boss/manager）」不符。已修，见 §三-1。

---

## 三、连带修复的 2 个缺陷

### 1. 前端「团队筛选」显隐判据过窄（R-05 遗留缺口）

| 项 | 内容 |
|---|---|
| 根因 | `useUser.canViewAll = viewAll \|\| manageAll`；manager 两者皆 0 ⇒ 筛选项被隐藏（尽管其数据范围是 dept_and_sub） |
| 修法 | 新增 `useUser.canViewTeam`：**优先看后端 `dataPermissions`**（`all` / `dept` / `dept_and_sub` 视为可看他人数据），`viewAll/manageAll` 仍视为真；`useDashboardFilters.ownerFilterEnabled` 改用它 |
| 边界 | 前端判据只控制**筛选器显隐**；真正的可见范围由后端 `buildOwnerOverrideFilter` 强制 |

### 2. 后端成员筛选授权**不支持 `dept_and_sub`** ⇒ manager 的筛选会被静默忽略

| 项 | 内容 |
|---|---|
| 根因 | `buildOwnerOverrideFilter` 原先只处理 `type === 'all'` 与 `'dept'`；而 `req.dataPermission.type` 是 `sys_data_permission.data_scope` 的**原值**，manager 为 `dept_and_sub` ⇒ 落到「忽略」分支（按钮显示了却不起作用，比隐藏更糟） |
| 修法 | 补 `dept_and_sub`（本部门 + 子部门，复用 `getSubDeptIds`）与 `custom`（`custom_dept_ids`）；顺带让 `getSubDeptIds(parentId, poolOverride)` 支持注入连接，使其可被单测覆盖（生产行为不变） |
| 测试 | `tests/unit/ownerOverrideFilter.test.js` 扩到 **12 例**（含 manager 场景：子部门命中 / 本部门命中 / 范围外忽略 / 查不到人 / 自定义部门集） |

### 3. 修复过程中新发现的第 3 个缺陷：成员列表接口越权/不可用

修好显隐后实测发现 manager 页面出现 **`403 POST /api/v1/user/list`** ——
工具栏拉「团队成员」用的是**系统管理接口**（需 `system:user` 权限）。两重问题：

- manager **没有**该权限（**这是正确的**）⇒ 下拉为空，筛选器形同虚设；
- 即便给权限也不妥：**不该把全公司用户列表交给部门经理**。

修法：新增 **`GET /report/team-members`**，由后端**按调用者数据范围**返回成员
（`all` → 全部在职；`dept` → 本部门；`dept_and_sub` → 本部门+子部门；`custom` → 指定部门集；`self` → 仅自己），
前端工具栏改调该接口。单测 `tests/unit/dashboardTeamMembers.test.js` **7 例**锁定口径。

---

## 四、验证证据（全部实测）

### 4.1 单测

| 套件 | 结果 |
|---|---|
| `ownerOverrideFilter.test.js`（12 例） | ✅ |
| `dashboardTeamMembers.test.js`（7 例） | ✅ |
| `dashboardScope.test.js` / `reportAnalyticsScope.test.js` | ✅ |
| 前端 `useUser.test.js`（含新增 `canViewTeam` 4 例，共 11 例） | ✅ |
| 后端全量回归 | 见 §4.3 |

### 4.2 浏览器实测（`demo_manager` 登录）

```
登录 code = 200
/auth/me = { username: demo_manager, roleCode: manager, roleId: 4,
             viewAll: false, manageAll: false, permissionsCount: 79 }
数据范围 = ["dept_and_sub"]，覆盖模块数 = 12
关键权限码: dashboard = true | system:role = false
顶栏 = { pickers: 1, teamSelects: 1 }                       ← 团队筛选已可见（修复前不可见）
团队筛选可选成员 = ["Demo管理员","Demo部门经理","Demo采购","Demo销售","Demo销售2"]  ← 修复前为空
经理看到的 KPI = 本月销售额 ¥3,500,000 / 新增客户 1 / 合同数 1 / 回款 ¥1,050,000 / 进行中商机 ¥1,000,000
控制台错误 = []      ≥400 响应 = []                          ← 修复前的 403 已消除
```

KPI 与 boss 视角接近，说明 **`dept_and_sub` 范围真的生效**（演示数据均归 Demo 演示部门）。

### 4.3 回归

| 范围 | 结果 |
|---|---|
| 后端全量 | ✅ **122 套件 / 1178 用例 全绿**（跑前已按迁移重建测试库，故 `contactSinglePrimary` 等亦通过） |
| 前端全量 | ⚠️ 全量 `npx vitest run` 曾报 **4 失败**；经逐文件单跑定位，已全部厘清（见下） |

**前端 4 失败的定位结论**（关键：区分「我引入」与「既有债」）：

| 失败用例 | 全量表现 | 单跑结果 | 定性 |
|---|---|---|---|
| `SalesAnalytics.test.js` | canvas 报错 | **仍失败**（单跑也挂）→ 已修复 | **我引入**：R-05 把漏斗改为 ECharts 真渲染后，jsdom 无 canvas。修法：mock 掉 `useChart` 图表层，并把「阶段名出现在 DOM 文本」的断言改为「阶段名进入图表 option」（校验点挪到 `initChart` 的 spy），现 **3/3 通过** |
| `router/guards.test.js` | 30s 超时 | 单跑全过 | **既有债**：全量并行时的资源/隔离问题，与本次改动无关（guards 未被我触碰） |
| `utils/request.test.js` | 30s 超时 | 单跑全过 | 同上（既有债） |
| `views/Login.test.js` | 30s 超时 | 单跑全过（4/4） | 同上（既有债） |

 ⇒ **本次改动引入的前端回归只有 SalesAnalytics 一处，已修复**；guards/request/Login 的超时属全量并行下的既有测试健康债，单跑均绿，非本任务所致。R-07 验收项未受任何影响。

---

## 五、遗留 / 建议

1. **`teamDashboardService.js:374` 仍有硬编码 roleId 判权**（`if (!viewAll && roleId !== ROLES.ADMIN)`）——
   与本轮修掉的 `dashboardService` 属同类问题，且 `ROLES` 数字常量与现库错位。**建议下一轮清理**（未动，避免本轮范围扩散）。
2. 「团队筛选」当前用 `ownerId` 精确到**人**；PRD 的「团队筛选」若需按**部门**维度筛选，需另加部门选择器（本轮未做）。
3. `finance(2)` 角色 `view_all=1` 但无 `sys_data_permission` 配置 —— 其数据范围口径建议一并复核（未在本轮范围）。
