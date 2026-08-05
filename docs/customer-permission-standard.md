# 客户中心权限标准

> 生成时间：2026-08-04
> 范围：客户中心（潜客池 / 正式客户 / 公海池）权限码统一规范

---

## 一、命名规范

### 1.1 格式

```
{模块}:{操作}
```

- 模块名：小写，复数形式（`leads` / `pool` / `customer`）
- 操作名：小写动词（`view` / `add` / `edit` / `delete` / `release` / `claim` / `convert` / `assign` / `import` / `export`）
- 分隔符：冒号 `:`

### 1.2 动词约定

| 动词 | 语义 | 说明 |
|------|------|------|
| `view` | 查看 | 列表/详情/导出查询 |
| `add` | 新增 | 创建记录 |
| `edit` | 编辑 | 修改/推进/回退/跟进 |
| `delete` | 删除 | 删除记录 |
| `release` | 释放 | 释放到公海 |
| `claim` | 认领 | 从公海/线索池认领 |
| `convert` | 转化 | 潜客转正式 |
| `assign` | 分配 | 分配负责人 |
| `import` | 导入 | 批量导入 |
| `manage` | 高级管理 | 激活/流失等高级操作 |

> 注：项目历史代码使用 `add`（非 `create`）、`edit`（非 `update`），遵循代码库现有约定，不强行重命名。

---

## 二、权限树

```
customer（客户管理 - 菜单）
├── customer:list（客户列表 - 菜单）
├── customer:view（查看客户）
├── customer:add（新增客户）
├── customer:edit（编辑客户/跟进/推进/回退）
├── customer:delete（删除客户）
├── customer:assign（分配负责人）
├── customer:import（导入客户）
├── customer:export（导出客户）
├── customer:release（释放到公海）
└── customer:manage（高级管理 - 激活/流失）

leads（潜客池 - 菜单）
├── leads:view（查看线索）
├── leads:add（录入线索）
├── leads:claim（认领线索）
├── leads:convert（转化为客户）
└── leads:release（释放线索）

pool（公海池 - 菜单）
├── pool:view（查看公海）
├── pool:claim（认领公海客户）
└── pool:assign（分配公海客户）
```

### 已删除的旧权限码

| 旧码 | 替换为 | 删除原因 |
|------|--------|----------|
| `customer:pool` | `pool:view` + `pool:claim` + `customer:release` | 098 引入新码后，旧码与新码并存导致前后端权限检查不一致 |
| `backup:create` | `backup:add` | 全项目统一为 add/edit/delete 风格（迁移 101） |
| `leads:create` | `leads:add` | 同上（迁移 101） |
| `user:create` | `system:user:add` | 与 system:user:add 语义重复，统一命名后删除（迁移 101） |

---

## 三、角色权限矩阵

| 权限码 | 销售(sales) | 主管(manager) | 管理员(boss) |
|--------|:-----------:|:-------------:|:------------:|
| `leads` (菜单) | ✓ | ✓ | ✓ |
| `leads:view` | ✓ | ✓ | ✓ |
| `leads:add` | ✓ | ✓ | ✓ |
| `leads:claim` | ✓ | ✓ | ✓ |
| `leads:convert` | ✓ | ✓ | ✓ |
| `leads:release` | ✗ | ✓ | ✓ |
| `customer` (菜单) | ✓ | ✓ | ✓ |
| `customer:list` (菜单) | ✓ | ✓ | ✓ |
| `customer:view` | ✓ | ✓ | ✓ |
| `customer:add` | ✓ | ✓ | ✓ |
| `customer:edit` | ✓ | ✓ | ✓ |
| `customer:delete` | ✓ | ✓ | ✓ |
| `customer:import` | ✓ | ✓ | ✓ |
| `customer:export` | ✓ | ✓ | ✓ |
| `customer:assign` | ✗ | ✓ | ✓ |
| `customer:release` | ✗ | ✓ | ✓ |
| `customer:manage` | ✗ | ✓ | ✓ |
| `pool` (菜单) | ✓ | ✓ | ✓ |
| `pool:view` | ✓ | ✓ | ✓ |
| `pool:claim` | ✓ | ✓ | ✓ |
| `pool:assign` | ✗ | ✓ | ✓ |

> 管理员(boss) 因 `manage_all=1` 自动绕过权限检查，权限分配用于菜单/按钮可见性控制。

---

## 四、路由权限映射

### 4.1 后端路由 → 权限码

| 端点 | 权限码 | 文件 |
|------|--------|------|
| `POST /api/v1/leads` | `leads:view` | routes/leads.js |
| `POST /api/v1/leads/convert` | `leads:convert` | routes/leads.js |
| `POST /api/v1/pool` | `pool:view` | routes/pool.js |
| `POST /api/v1/pool/claim` | `pool:claim` | routes/pool.js |
| `POST /api/v1/pool/release` | `customer:release` | routes/pool.js |
| `POST /api/v1/customers` | `customer:view` | routes/customers.js |
| `POST /api/v1/customers/list` | `customer:view` | routes/customers.js |
| `POST /api/v1/customers/add` | `customer:add` | routes/customers.js |
| `POST /api/v1/customers/update` | `customer:edit` | routes/customers.js |
| `POST /api/v1/customers/delete` | `customer:delete` | routes/customers.js |
| `GET /api/v1/customers/detail/:id` | `customer:view` | routes/customers.js |
| `POST /api/v1/customers/forward` | `customer:edit` | routes/customers.js |
| `POST /api/v1/customers/backward` | `customer:edit` | routes/customers.js |
| `POST /api/v1/customers/export` | `customer:view` | routes/customers.js |
| `POST /api/v1/customer/assign` | `customer:assign` | routes/customer/assign.js |
| `POST /api/v1/customer/batch-assign` | `customer:assign` | routes/customer/assign.js |
| `POST /api/v1/customer/claim` | `pool:claim` | routes/customer/assign.js |
| `POST /api/v1/customer/batch-claim` | `pool:claim` | routes/customer/assign.js |
| `POST /api/v1/customer/release` | `customer:release` | routes/customer/assign.js |
| `POST /api/v1/customer/batch-release` | `customer:release` | routes/customer/assign.js |
| `POST /api/v1/customer/pool-log` | `pool:view` | routes/customer/assign.js |
| `POST /api/v1/customer/import` | `customer:import` | routes/customer/import.js |

### 4.2 前端路由 → 权限码（router meta）

| 路由 | 权限码 | 说明 |
|------|--------|------|
| `/leads` | `leads:view` | 潜客池 |
| `/customer/list` | `customer:view` | 正式客户 |
| `/pool` | `pool:view` | 公海池 |
| `/customer/detail/:id` | `customer:view` | 客户详情 |
| `/customer/assign-rules` | `customer:assign` | 分配规则 |

### 4.3 前端按钮 → 权限码（v-permission）

| 页面 | 按钮 | 权限码 |
|------|------|--------|
| leads/List.vue | 新增潜客 | `leads:add` |
| leads/List.vue | 转为正式 | `leads:convert` |
| leads/List.vue | 编辑 | `leads:add` |
| pool/List.vue | 认领 | `pool:claim` |
| CustomerTable.vue | 新增客户 | `customer:add` |
| CustomerTable.vue | 导入Excel | `customer:import` |
| CustomerTable.vue | 导出Excel | `customer:export` |
| CustomerTable.vue | 跟进 | `customer:edit` |
| CustomerTable.vue | 分配 | `customer:assign` |
| CustomerTable.vue | 推进/回退 | `customer:edit` |
| CustomerTable.vue | 编辑 | `customer:edit` |
| CustomerTable.vue | 删除 | `customer:delete` |

---

## 五、迁移记录

### 迁移 098：新增 leads/pool 独立权限码（已完成）

- 新增 `leads:view` / `leads:create` / `leads:claim` / `leads:convert` / `leads:release`
- 新增 `pool:view` / `pool:claim` / `pool:assign`
- 新增 `customer:release` / `customer:assign`（api 类型）/ `customer:manage`
- 兼容映射：`customer:list` → `leads:view` + `customer:view`
- 兼容映射：`customer:pool` → `pool:view` + `pool:claim`
- 保留旧码 `customer:pool` 不删除

### 迁移 100：删除旧码 customer:pool（本次）

- 删除 `sys_permission` 中 `code='customer:pool'` 的定义
- 清理 `sys_role_permission` 中 `customer:pool` 的关联记录
- 删除前保险映射（幂等）：确保拥有 `customer:pool` 的角色已获得 `pool:view` + `pool:claim` + `customer:release`

### 代码层面迁移（本次）

| 文件 | 变更 |
|------|------|
| `backend/routes/customer/center.js` | release-to-pool: `customer:pool` → `customer:release`；claim-pool: `customer:pool` → `pool:claim` |
| `backend/routes/customer/assign.js` | /claim + /batch-claim: → `pool:claim`；/release + /batch-release: → `customer:release`；/pool-log: → `pool:view` |
| `backend/routes/customer/module.js` | permissions 数组移除 `customer:pool`，新增 `customer:release` / `pool:view` / `pool:claim` |
| `backend/scripts/init_role_permissions.js` | 删除 `customer:pool` 菜单定义；boss/manager/sales 角色权限列表替换为新码 |
| `database/seeds/permission_data.sql` | 删除 `customer:pool` 菜单，新增 `pool` 菜单 |
| `frontend/src/views/pool/List.vue` | 认领按钮 `customer:pool` → `pool:claim` |
| `frontend/src/views/leads/List.vue` | 新增 `customer:add` → `leads:add`；转正式 `customer:edit` → `leads:convert`；编辑 `customer:edit` → `leads:add` |
| `frontend/src/views/system/role.vue` | sales 预设 `customer:pool` → `pool` + `pool:view` + `pool:claim` |
| `backend/tests/assign.test.js` | mock 权限 `customer:pool` → `pool:claim` + `customer:release` + `pool:view` |

---

## 六、验证结果

| 验证项 | 结果 |
|--------|------|
| 后端测试 | 100 suites / **978 passed** |
| 前端测试 | 9 suites / **37 passed** |
| 前端 Build | exit 0，**无 Vue 编译警告**（23.64s） |
| `customer:pool` 代码残留 | **0**（仅历史 migration 和文档中有引用，属正常） |

---

## 七、其他模块权限树（补全）

> 以下为 CRM 其他业务模块的权限树，统一遵循 `add/edit/delete` 命名风格。

```
supplier（供应商 - 菜单）
├── supplier:add（新增供应商）
├── supplier:edit（编辑供应商）
└── supplier:delete（删除供应商）

opportunity（商机 - 菜单）
├── opportunity:add（新增商机）
├── opportunity:edit（编辑商机/推进阶段）
└── opportunity:delete（删除商机）

quotation（报价 - 菜单）
├── quotation:add（新增报价）
├── quotation:edit（编辑报价/发送/转合同）
└── quotation:delete（删除报价）

contract（合同 - 菜单）
├── contract:view（查看合同）
├── contract:add（新增合同）
├── contract:edit（编辑合同）
└── contract:delete（删除合同）

product（产品 - 菜单）
├── product:view（查看产品）
├── product:add（新增产品）
├── product:edit（编辑产品）
└── product:delete（删除产品）

purchase（采购 - 菜单）
├── purchase:add（新增采购/入库/出库/调整）
├── purchase:edit（编辑采购）
├── purchase:delete（删除采购）
├── purchase:request（采购申请）
├── purchase:comparison（采购比价）
└── purchase:approve（采购审批）

service（服务工单 - 菜单）
├── service:add（新增工单）
├── service:edit（编辑工单/分配/处理/确认）
└── service:delete（删除工单）

invoice（发票 - 菜单）
├── invoice:add（新增发票）
├── invoice:edit（编辑发票）
├── invoice:delete（删除发票）
└── invoice:export（导出发票）

backup（数据备份 - 菜单）
├── backup:add（创建备份/查看列表/删除备份）
└── backup:restore（恢复备份）
```

---

## 八、注意事项

1. **部署时必须按顺序执行迁移 098 → 100 → 101**：
   - 098：引入新权限码 + 兼容映射
   - 100：删除旧码 `customer:pool`
   - 101：统一命名 `backup:create`→`backup:add`、`leads:create`→`leads:add`、删除 `user:create`
2. **角色权限缓存**：迁移执行后，需清除权限缓存（`permissionCache`），避免延迟生效。
3. **customer:list 保留**：旧码 `customer:list`（菜单权限）仍保留，098 已将其映射到 `leads:view` + `customer:view`。未在本次删除范围内。
4. **customer:assign 类型**：`init_role_permissions.js` 定义为 `button` 类型，098 迁移又定义为 `api` 类型。当前以 `button` 类型为准（init 脚本会覆盖），098 的 `api` 类型记录在生产库中可能存在重复，建议后续清理。
5. **未使用的权限码**：`leads:release` / `pool:assign` / `customer:manage` 已在 098 定义并分配给 manager，但路由中暂未使用，为未来功能预留。
6. **命名规范固化**：全项目 CRUD 权限统一使用 `add/edit/delete`，禁止新模块使用 `create/update/remove`。领域专用模块（如 leads/pool/approval）可使用领域动词（claim/convert/release/approve），但需在本文档登记。
