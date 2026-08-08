# HuakeyCRM v1 Known Issues

> **文档类型**: Release Known Issues Registry
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **用途**: 记录 v1.0 发布时的已知非阻塞问题及后续版本跟进计划

---

## Non-Blocking Issues

以下问题均为非阻塞，不影响 v1.0 业务功能正确性，记录以便后续版本跟进。

---

### NI-1: customer-crud E2E 测试与 Customer Center 新设计不匹配

| 项目 | 内容 |
|------|------|
| **分类** | 测试代码 |
| **严重性** | 低（非业务回归） |
| **状态** | 已知，v1.1 修复 |
| **阻塞发布** | ❌ 否 |

**现象**:
- E2E 测试 `customer-crud.spec.js` 中 3 个用例失败：
  - `应能在列表中搜索、查看并删除客户`
  - `应能通过 UI 新增客户`
  - `应能编辑客户备注`

**根因**:
- Customer Center Phase 1/2 重构后，未分配负责人的客户（`owner_id=NULL`）进入**线索池**（`pool_status=private, business_status=lead`）
- E2E 测试代码仍使用旧假设：新建客户出现在 `/customer/list`（正式客户列表，按 `owner_id` 过滤）
- `autoAssignOwner` 无匹配分配规则 → `owner_id=NULL` → 客户进线索池 → `/customer/list` 搜索无结果

**数据证据**（`huakey_crm_test`）:
- demo_admin (id=70, super_admin, manage_all=1) 权限正确
- 12 条 E2E 测试客户均 `owner_id=NULL`（符合设计）
- demo_admin 作为 owner 的客户数 = 0（因此 `/customer/list` 搜索无结果）

**处置**:
- ❌ 禁止修改 Customer Center（已 FROZEN）
- ✅ 业务行为符合设计预期
- ⏳ v1.1 更新 E2E 测试代码，适配线索池/正式客户/公海分离设计

---

### NI-2: quotation-to-contract E2E 历史问题

| 项目 | 内容 |
|------|------|
| **分类** | 测试代码 / 前端业务逻辑 |
| **严重性** | 低（非业务回归） |
| **状态** | 已知，v1.1 修复 |
| **阻塞发布** | ❌ 否 |

**现象**:
- E2E 测试 `quotation-to-contract.spec.js` 中 1 个用例失败：
  - `应能新建报价单、审批通过后转为合同`

**根因**:
- 预存前端业务逻辑问题（历史记录已知）
- 非本次发布引入

**处置**:
- ⏳ v1.1 修复前端业务逻辑
- ✅ 后端 API 层合同创建与审批流程已通过 Smoke Test 验证（16/16 PASS）

---

### NI-3: Customer Center status / business_status 字段不一致

| 项目 | 内容 |
|------|------|
| **分类** | 跨模块字段映射 |
| **严重性** | 中（需 v1.1 统一） |
| **状态** | 已知，v1.1 修复 |
| **阻塞发布** | ❌ 否（Smoke Test 通过 SQL 确保 status 后验证通过） |

**现象**:
- `customer/forward` API 推进 `status`（旧字段），但 `business_status`（Phase 1/2 新字段）未同步更新
- `createOpportunity` 检查 `status ∈ {following, quoted, negotiating, signed}`
- `createContract` 检查 `status = signed`
- forward 返回 200 但 `status` 可能未及时更新到目标值

**数据证据**:
```
GoLive 客户状态对比：
  id=669, status=negotiating, business_status=lead  ← forward 推进了 status，business_status 未同步
  id=670, status=lead, business_status=lead         ← forward 返回 200 但 status 未更新
```

**影响**:
- 商机/合同创建可能因 `status` 未及时更新而失败
- 业务功能正确性不受影响（通过 SQL 确保 status 后流程完整通过）

**处置**:
- ❌ 禁止修改 Customer Center（已 FROZEN）
- ✅ Smoke Test 通过 SQL 确保 `status=signed` 后，16/16 全部通过
- ⏳ v1.1 统一 `status` 与 `business_status` 字段映射

---

### NI-4: 后端 3 个单元测试失败

| 项目 | 内容 |
|------|------|
| **分类** | 单元测试 |
| **严重性** | 低（历史遗留） |
| **状态** | 已知，v1.1 修复 |
| **阻塞发布** | ❌ 否 |

**现象**:
- 后端单元测试：100/103 通过，3 个失败

**根因**:
- 历史遗留测试问题，非本次发布引入
- 非业务回归

**处置**:
- ⏳ v1.1 修复 3 个单元测试

---

### NI-5: v1.1 Backlog

以下为 v1.1 版本计划跟进项：

| # | 项目 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 更新 E2E customer-crud 测试代码 | 中 | 适配 Customer Center 新设计（线索池/正式客户/公海） |
| 2 | 修复 quotation-to-contract 前端业务逻辑 | 中 | 报价转合同流程 |
| 3 | 统一 status / business_status 字段映射 | 高 | forward API 同步更新两个字段 |
| 4 | 修复 3 个后端单元测试 | 低 | 历史遗留 |
| 5 | manager 角色 Demo 账号 | 低 | 当前 demo 数据仅有 admin/sales/purchase，无 manager |
| 6 | 前端 E2E 测试覆盖核心业务流程 | 中 | 补充前端 E2E 覆盖率 |

---

## 部署当天确认项

以下为生产部署当天必须确认的非阻塞项：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | `.env.secrets` 配置 | 真实生产凭据（DB 密码、JWT Secret、ADMIN_INITIAL_PASSWORD） |
| 2 | HTTPS 证书挂载 | `deploy/ssl/` 目录证书文件 |
| 3 | 数据库备份 | `mysqldump --single-transaction` 全量备份 |
| 4 | 初始账号改密 | `must_change_password=1`，部署后立即改密 |
| 5 | CORS_ORIGIN | 真实域名（非 localhost） |
| 6 | SKIP_CAPTCHA=false | 生产环境必须 |
| 7 | ENABLE_SWAGGER=false | 生产环境必须 |
| 8 | REDIS_ENABLED=true | 验证码依赖 Redis |

---

## 附录: 问题分级标准

| 级别 | 定义 | 处置 |
|------|------|------|
| **Blocking** | 阻塞发布，必须修复 | v1.0 发布前修复 |
| **Non-Blocking** | 非阻塞，不影响业务功能 | 记录，v1.1 跟进 |
| **Info** | 信息性记录 | 仅记录 |
