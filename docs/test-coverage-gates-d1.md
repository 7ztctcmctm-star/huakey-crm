# D1 · 测试盲区补全 + 覆盖率门槛（2026-10-22）

> 计划步骤 D1（`docs/full-audit-optimization-plan-2026-10-16.md`）交付记录。

## 一、六处盲区补全（64 个新用例）

计划点名的盲区逐一落地，全部沿用 `tests/notification.test.js` 的
「mock pool + mock controller + supertest」模式（按 SQL 内容路由，不按调用顺序）：

| 文件 | 套件/用例 | 覆盖要点 |
|---|---|---|
| `tests/leads.test.js` | 9 | 列表转发与 `dataPermission` 透传（self/all）、`leads:view` 缺失 403、未登录 401、`lead_level` 非法 400、`id=0` 拒绝；convert 转发 id+userId、`leads:convert` 缺失 403 |
| `tests/metrics.test.js` | 7 | 上报 204 与 INSERT 五参顺序、rating/page_url 缺省落 NULL、未登录 401、value 非数字/type 超长/type 缺失 400 |
| `tests/sse.test.js` | 3 | 未登录 401、token 缺 userId 401 且不建连；鉴权通过后 SSE 三响应头 + `:ok\n\n` 握手 + `sseManager.add(userId,res)`（原生 http 客户端，收首块即断，避免长连接挂起） |
| `tests/poolRoutes.test.js` | 14 | 公海列表分页/level 枚举/pageSize≤200、`pool:view` 403、claim 幂等键透传、release 独立权限码 `customer:release`（持有 pool:* 仍 403）、transfer 六端点（by-customer 的 dataPermission fail-closed self、candidates 空 body、my-pending pageSize≤100） |
| `tests/services-contractExportService.test.js` | 12 | 状态映射 1-4+未知、敏感字段剥离（中英文表头）、keyword/status 进 SQL（权限参数在前）、空结果合法 xlsx；导入：空文件/超 500 拒绝、缺字段与合同不存在计入 errors、Excel 序列号按北京时区归一化、deadlock 回滚+release |
| `tests/services-contractPaymentService.test.js` | 19 | 权限闸门（404/403/本人/manageAll）、update 先查老记录、delete 不存在 400、listPayments 三分 tab + 权限子句 + LIMIT/OFFSET 推导、statement 双 sheet 与回款率（0 元客户 100%） |

### 过程中发现并固定的模式

- **authenticateToken 会用 DB 新鲜值覆盖前置注入的 `req.user`**：token payload 与
  被测用户必须一致；pool mock 需按 SQL+roleId 分流（`sys_role` 查 manage_all）。
- **模块加载期副作用**：`routes/metrics.js` 顶部即执行 `CREATE TABLE IF NOT EXISTS`，
  mock pool 的 query 必须有默认 Promise 返回（`.catch` 链）。
- **SSE 长连接**：supertest 对不自然结束的流会挂起，改原生 `http.get` + 收首块 `destroy`。

## 二、覆盖率门槛收紧（40 → 55）+ 只升不降约定

新增用例后实测（`--coverageReporters=json-summary`，全量 165 套件/1603 用例）：

| 指标 | 实测 | 新门槛 | 原门槛 |
|---|---|---|---|
| lines | 60.93% | **55** | 40 |
| statements | 57.71% | **55** | 40 |
| branches | 40.69% | 30（维持） | 30 |
| functions | 57.12% | 40（维持） | 40 |

`backend/jest.config.js` 的 `coverageThreshold.global` 同步更新并注释实测来源。

**只升不降约定**写入 `AGENTS.md` 7.30：门槛是门禁非参考值；上调须附实测证据；
**下调视为回归**，须先删等量不可覆盖代码或补测试并在交付文档说明。
口径（`coveragePathIgnorePatterns` 排除 node_modules/tests/config）一并写明。

## 三、test:security 接入 CI（6 套件 91 用例）

- `backend/package.json` 新增 `test:security`：
  `jest tests/security/ --coverage=false --forceExit --testPathIgnorePatterns="/node_modules/"`。
  ⚠️ 必须带覆盖 flag——`testPathIgnorePatterns` 对显式路径同样生效
  （与 migration-roundtrip 同款陷阱，MEMORY 有记载）。
- `ci.yml` 的 `backend-test` 末尾接入该 step（复用现有 job，**不新增 check 名**，
  避免分支保护 required checks 与 D2 删 image-scan 的同类不同步问题）。

### 接入即暴露两处存量失败（此前 security 只在本地跑，无人看红）

1. `securityFixes20261009.test.js` H-004：`makeReq` 未提供 `req.headers`，
   `toContract` 读 `req.headers['idempotency-key']` TypeError 走 next，
   `res.body` 为 null。→ 补 `headers: {}`。
2. `securityFixes20261009b.test.js` M-007：本机 Docker Compose v5.1.3 的
   `compose config` 把所有标量序列化为字符串，`mem_limit` 输出 `"536870912"`，
   原断言 `toBe(512*1024*1024)` 类型不匹配。→ `Number()` 归一化后比较
   （语义不变：仍校验 512M 已换算为字节）。

## 四、验证证据

- 全量 jest：**165 套件 / 1603 用例**（新增 6 套件 64 用例；security 不计入默认跑）。
  一次连库套件 `contactSinglePrimary` 外键 flake（共享 `huakey_crm_test` 并发竞争，
  单独复跑 5/5 绿，与 C3 同型）；最终全量复跑全绿、覆盖率门槛 55 达标。
- `npm run test:security`：6 套件 / 91 用例全绿（复跑两次确认）。
- 后端 eslint（改动文件）`--max-warnings=0` 清零。

## 五、与计划差异说明

- 计划写「leads/metrics/sse 路由 + pool 路由 + contractExport/Payment 服务」六项，
  全部完成；未新增 `contractExportService` 导入路由级测试（service 层已覆盖
  事务/回滚/日期归一化，路由层为薄封装）。
- branches/functions 门槛未上调（计划只授权 lines/statements 55），
  按 7.30 约定留待后续只升不降。
