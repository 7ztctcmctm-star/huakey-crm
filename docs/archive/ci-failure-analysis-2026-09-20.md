# CI 失败根因分析报告（integration-test / e2e-test / backend-test / image-scan / migration-test）

- 分析对象：GitHub Actions 工作流 `CRM CI`，run `35493957938`（commit `bcb89d3`，2026-09-20 06:20 UTC）
- 仓库：`github.com/7ztctcmctm-star/huakey-crm`（公开）
- 分析方式：GitHub Actions API（job/step 级）+ 本地 lockfile 静态体检 + 本地 `npm ci` 对照实测 + 逐 commit 二分定位
- 结论：**5 个失败 job 是同一个根因**，且**与业务代码无关**，是依赖清单（lockfile）的一行地址错误。

---

## 一、结论（TL;DR）

`backend/package-lock.json` 中 `xlsx@0.20.3` 的 `resolved` 指向 **`https://registry.npmjs.org/xlsx/-/xlsx-0.20.3.tgz`**，而该地址 **返回 HTTP 404** —— npm 官方 registry 从未发布 0.20.3（该 registry 上 `xlsx` 共 108 个版本，`dist-tags.latest = 0.18.5`，连 0.19.0 都不存在；SheetJS 自 0.19.0 起只在自托管 CDN `cdn.sheetjs.com` 分发）。

`npm ci` 严格按 lockfile 的 `resolved` 拉取，不做版本回溯，因此**在依赖安装这一步就立即 E404 退出**。所有执行 `cd backend && npm ci` 的 job，以及镜像构建内部执行 `npm ci` 的 job，全部在同一处倒下。

> 用一句话向非工程同事解释：给流水线准备的"采购清单"上，某个零件的供货地址是错的（指向一个从未上架的货架），于是所有需要这个零件的工序一开始就停摆。

**⚠️ 但这不是全部。** 修好依赖安装后，`backend-test` 会在下一步 `npm test` 再次变红 —— 那里藏着**第二处、完全独立的阻塞点**（`tests/backup.test.js` 未挂错误处理中间件）。两处均已在本轮修复并实测通过，详见第八章。

---

## 二、五个 job 的失败点明细（精确到 step）

| # | Job | 首个失败步骤 | 步骤名 | 该 job 总耗时 | 后续步骤 |
|---|---|---|---|---|---|
| 1 | `backend-test` | **#5** | `Run cd backend && npm ci` | 19s | `npm run lint` / `npm test` / `npm audit` 全部 SKIP |
| 2 | `integration-test` | **#6** | `Run cd backend && npm ci` | 36s | migrations 安装、基线导入、jest e2e 全部 SKIP |
| 3 | `e2e-test` | **#6** | `Run cd backend && npm ci` | 38s | 前端安装、seed、权限初始化、Playwright 全部 SKIP |
| 4 | `migration-test` | **#6** | `Run cd backend && npm ci` | 35s | migrations 安装、基线导入、roundtrip 测试全部 SKIP |
| 5 | `image-scan` | **#3** | `Build` → `docker build -f Dockerfile.synology .` | 19s | Trivy 扫描 SKIP |

**关键旁证：失败耗时仅 19–38 秒**。这不是"下载慢/网络超时"（那会是分钟级甚至 6 小时超时），而是**解析 lockfile 后立刻被 404 拒绝**的快速失败特征。

`image-scan` 的 `Build` 失败位置在 `Dockerfile.synology` 第 26–28 行：

```dockerfile
RUN rm -rf /root/.npm /tmp/npm-cache && \
    ( npm ci --omit=dev --no-audit --no-fund --cache /tmp/npm-cache || \
      npm ci --omit=dev --no-audit --no-fund --cache /tmp/npm-cache )
```

它读取的是**同一个** `backend/package-lock.json`，所以与四个 `npm ci` job 同源同因。

---

## 三、证据链（可复现）

### 3.1 lockfile 里的错误地址

```json
"node_modules/xlsx": {
  "version": "0.20.3",
  "resolved": "https://registry.npmjs.org/xlsx/-/xlsx-0.20.3.tgz",   // ← 404
  "integrity": "sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA=="
}
```

### 3.2 该地址不存在，正确地址存在

| 探测 | 结果 |
|---|---|
| `HEAD https://registry.npmjs.org/xlsx/-/xlsx-0.20.3.tgz` | **HTTP 404** |
| `HEAD https://registry.npmjs.org/xlsx/-/xlsx-0.18.5.tgz` | HTTP 200（对照组，证明 registry 本身可达） |
| `GET https://registry.npmjs.org/xlsx` | 108 个版本，`dist-tags.latest = 0.18.5`，**不含 0.19.0 / 0.20.3** |
| `HEAD https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | **HTTP 200**（2,409,319 bytes）—— 真实产地 |

### 3.3 本地等价复现（实测报错文本）

在隔离临时目录用与仓库一致的 lock 形态执行 `npm ci`：

```
npm error code E404
npm error 404 Not Found - GET https://cdn.npmmirror.com/packages/xlsx/0.20.3/xlsx-0.20.3.tgz
npm error 404 'xlsx@https://registry.npmmirror.com/xlsx/-/xlsx-0.20.3.tgz' is not in this registry.
=== EXIT=1 ===
```

（本机 npm 配了 npmmirror 镜像，故 host 被重写；CI runner 直连官方 registry，同一 URL 同样 404。两者均为"该版本不存在"，本质一致。）

反向验证 —— 把 `resolved` 改回 CDN 地址后：

```
added 1 package in 4s
=== EXIT=0 ===
```

### 3.4 引入时间与单一变量定位（二分）

| 提交 | 时间 | 该提交对 xlsx 的改动 | 对应 run | backend `npm ci` | 其他 backend 相关 job |
|---|---|---|---|---|---|
| `22fa4fb` | 09-18 03:14 | `package.json`：CDN URL → `^0.20.3`（**lock 未同步**） | `35302451397` | ✅ **通过** | image-scan / migration / e2e 全绿；仅 `npm test`(#7) 与 jest e2e(#9) 红 |
| `797dc2a` | 09-18 03:24 | **手工**把 lock 的 `resolved`：CDN URL → registry URL | `35303105047` | ❌ **失败** | image-scan / integration / e2e / migration **全部首败于 npm ci** |

**相邻两次提交，唯一实质改动就是这一行 `resolved`，失败面从"0 个安装类 job"变成"5 个安装类 job 全红"** —— 单一变量，因果明确。

`797dc2a` 的 commit message 原文：

> 手动替换 https://cdn.sheetjs.com/...tgz → https://registry.npmjs.org/xlsx/-/xlsx-0.20.3.tgz
> 避免供应链风险：CDN 无 integrity hash、断网不可达、第三方可控
> **integrity hash 保持不变（同一包）**

意图是好的（消除第三方 CDN 依赖），但**"registry 上有这个版本"这个前提是错的**。`integrity` 保持不变恰恰说明原作者是"只换地址、不换包"，而这个新地址背后根本没有包。

---

## 四、为什么另外 3 个 job 通过（对照）

| Job | 结果 | 原因 |
|---|---|---|
| `frontend-test` | ✅ success | `frontend` 依赖树中**不含 xlsx**（18 个依赖、lock 内 106 条 `resolved` 全部指向真实存在的 registry 条目）；且用 `npm install --legacy-peer-deps` 而非 `npm ci` |
| `frontend-build` | ✅ success | 同上，且 `frontend/package-lock.json` 无任何第三方 tarball |
| `security-scan` | ✅ success | CodeQL 静态分析，完全不安装 npm 依赖 |

> 补充：`database/migrations/package-lock.json`（15 条）与仓库根 `package-lock.json`（57 条）经体检**全部干净**，`resolved` 无一指向第三方或不存在版本。所以 `cd database/migrations && npm ci`（当前被 SKIP）修复后预期可通过。

---

## 五、已逐项排除的其他候选原因

| 候选原因 | 排除依据 |
|---|---|
| `package.json` 与 `package-lock.json` 不同步（EUSAGE） | 第三方实测同构场景（lock 指 CDN、package.json 写 `^0.20.3`）`npm ci` **EXIT=0 通过**；且 `22fa4fb` 那次 run 的 npm ci 确实通过。另：两个文件的依赖条目名称/范围集完全一致（24 + 9 条，零差异） |
| lockfile 引用了 CI 不可达的第三方 CDN tarball | lock 内 767 条 `resolved` **全部**为 `registry.npmjs.org`，第三方条目 **0 条**（改 registry 之前才存在 CDN 条目） |
| npm 新版 `EALLOWREMOTE` 拒绝远程 tarball | CI 用 `actions/setup-node@v4` + Node 22 自带 npm **10.9.x**，该限制（`--allow-remote`）为 npm 11.6+ 引入，10.x 不存在。历史上出现的 `EALLOWREMOTE` 仅发生在镜像内 `npm install -g npm@latest`（npm 12）的路径，而 `22fb562` 已把镜像内 npm 升级移除 |
| 网络抖动 / 依赖下载超时 | 失败耗时 19–38s（快速失败）；同一 runner 上 frontend job 安装正常 |
| 后端单测 / E2E 真实失败 | 这些步骤**均未执行**（全部 SKIP），根本轮不到 |
| MySQL 容器未就绪 | integration/e2e/migration 三 job 的 `Waiting for MySQL` 步骤均为 OK |
| `npm audit` 门禁 | 该步骤同样被 SKIP，未执行 |

---

## 六、修复方案

### 方案 A（推荐）—— 把 xlsx 的产地改回真实地址

xlsx@0.20.3 **只存在于** `cdn.sheetjs.com`，不存在"改用 registry"这一选项。需同步修改 3 处：

1. `backend/package.json`
   ```diff
   -        "xlsx": "^0.20.3"
   +        "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
   ```
2. `backend/package-lock.json` → `packages[""].dependencies.xlsx`：同样改回上述 URL
3. `backend/package-lock.json` → `packages["node_modules/xlsx"].resolved`：改回上述 URL

`integrity` **保持** `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` 不变（这才是"同一包"的正确用法）。

- 已验证：改回后 `npm ci` 在 npm 10.9.x 下 **EXIT=0**（实测 `added 1 package in 4s`）
- 附带说明：`docs/dependency-review-2026-08.md` 早已记录该依赖的处理原则 —— "npm 官方渠道冻结于 0.18.5（含 CVE）；当前 pin 的 0.20.3 为修复版"，即当初**有意**走 CDN。此次改动偏离了该既定决策。
- 未来注意：若 CI 或镜像内 npm 升级到 11.6+，远程 tarball 将被默认拒绝，需在 `npm ci` 上加 `--allow-remote=root`（该 flag 在 npm 11.6+ 才有；10.x 加了反而报错）。

### 方案 B（不推荐）—— 降级到 registry 上真实存在的 0.18.5

可行但会把 2026-08-21 依赖安全升级的成果退回（0.18.5 含已知 CVE），与 `npm audit` 门禁相冲突。**不建议**。

### 方案 C（长期最干净）—— 弃用 xlsx，迁移到 registry 原生依赖

`docs/dependency-review-2026-08.md` 已评估："涉及导出/导入的 module 已隔离（`contractExportService` 等），替换成本可控"。改用 `exceljs` 等 registry 上正常分发的库，可彻底消除 CDN 与 remote-tarball 这类隐患。建议纳入后续排期，但不作为本次止血手段。

---

## 七、修复后仍需确认的事项（本轮已逐一实测）

修好 `npm ci` 只是让流水线**能继续往下走**，被打断的后半程会首次真正执行。以下为本轮实际跑出的结论：

1. **`backend-test` #6 `npm run lint`**：本地按 CI 原样跑 `npm run lint`（= `eslint .`）→ **EXIT=0** ✅。仓库有 8 个存量 warning（4 个在 `backend/tmp/`、4 个在脚本/service），但 ESLint 默认告警不改变退出码，**不会**让 CI 红。
   - ⚠️ 若日后给 lint 脚本加 `--max-warnings=0`，这 8 个存量告警会立刻让 CI 变红，需先清理。
2. **`backend-test` #7 `npm test`**：**发现第二处阻塞点并已修复**，详见第八章。
3. **`integration-test` #9 `npx jest tests/e2e/`**：需真实 MySQL 与完整基线数据，本地无法等价复现 ⇒ **未验证**（`22fa4fb` 那次曾失败）。
4. **`cd database/migrations && npm ci`**：已在隔离目录实测 **EXIT=0**（`added 14 packages in 25s`）✅
5. **`cd frontend && npm ci --legacy-peer-deps`**（e2e-test 路径）：frontend lock 的 106 条 `resolved` 全部指向真实存在的 registry 条目；**未实测**，预期通过。
6. `npm run seed:demo`、`node scripts/init_role_permissions.js`、Playwright 用例：依赖真实 MySQL ⇒ **未验证**。
7. **观察项（非本次失败原因）**：`backend/package.json` 声明了 `overrides: { "tar": ">=7.5.19" }`，但 `backend/package-lock.json` 中**不存在任何 `tar` 条目**（0 个）⇒ 该 override 当前未命中依赖树中任何实际包，属"失效的安全声明"。建议后续复核是否仍需要（可能是历史 CVE 修复的遗留）。
8. **流程建议**：`797dc2a` 这类"手工编辑 lockfile"的操作绕过了 `npm` 的一致性校验（`npm install --package-lock-only` 或 `npm ci` 实跑），是本次事故的直接成因。建议把 `npm ci` 的**实跑验证**纳入提交前预检清单（与现有"提交前必跑 ESLint"并列）。

---

## 八、第二处阻塞点：`tests/backup.test.js`（本轮一并修复）

修好 `npm ci` 后 `npm test` 才会真正执行。在**模拟 CI 无 DB 环境**（`DB_PORT=13306`，使「真连库」用例走 skip 分支）下全量跑，结果：

```
Test Suites: 1 failed, 129 passed, 130 total
Tests:       1 failed, 1303 passed, 1304 total
FAIL tests/backup.test.js
```

即：**只修 xlsx，CI 的 `backend-test` 仍会红在 `npm test`**。这也解释了 `22fa4fb` 那次 `npm ci` 通过、却首败于 `npm test` 的现象（两个独立缺陷先后挡住同一条流水线）。

### 失败用例与根因

- 用例：`数据备份模块 › POST /api/v1/backup/restore › 应该返回400当确认码不正确`
- 报错：`expect(res.body.code).toBe(400)` → **Received: undefined**

根因**不在业务代码**，而在测试自身的 app 装配。`tests/backup.test.js` 第 47–51 行手工搭了一个极简 app：

```js
const app = express();
app.use(express.json());
const backupRoutes = require('../routes/backup');
app.use('/api/v1/backup', backupRoutes);
```

**没有挂载 `appErrorHandler` / `globalErrorHandler`**。于是路由内 `next(error)` 落入 Express 默认错误处理器，返回 **`text/html`** 错误页；supertest 的 `res.body` 为空对象 ⇒ `res.body.code` 恒为 `undefined`。

探针实测（两个 app 对照，同一请求、同一 mock）：

| 场景 | status | content-type | body |
|---|---|---|---|
| A 极简 app（修复前的 backup.test.js） | 400 | **text/html** | `{}` |
| B 补上 `responseFormat` + 两个 errorHandler | 400 | application/json | `{"code":400001,"message":"确认码不正确，恢复操作已拒绝","data":null}` |

### 附带发现：断言口径也写错了

B 场景说明，即便挂上中间件，`body.code` 是 **`400001`（业务错误码）** 而非 HTTP 状态码 `400`。项目错误码体系（`backend/errors/codes.js`）为 `400xxx` 业务码，其他测试正按业务码断言：

- `tests/import.test.js:70` → `toBe(400001)`
- `tests/currency.test.js:76` → `toBe(400005)`
- `tests/upload.test.js:101` → `toBe(400005)`

**这是项目既有约定**，`tests/approval.test.js:39-44` 有明确注释：

> `[P1-5 fix] 单元测试必须挂载错误处理中间件以捕获 next(error)`
> （项目约束：AGENTS.md 明确要求；之前手写 `res.status` 绕过了 errorHandler，现在统一 `next(error)` 后必须显式挂载）

⇒ 结论：`backup.test.js` 是 **P1-5 那轮统一改造时被漏改的文件**（`approval.test.js` / `auth.test.js` / `boundary.test.js` 都改到了，它没改）。修复属"补齐既有约定"，**未变更任何对外契约**。

### 修复内容（2 处）

1. 补挂错误处理中间件（与 `approval.test.js` 等同款范式）：
   ```js
   const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');
   app.use(appErrorHandler);
   app.use(globalErrorHandler);
   ```
2. 断言对齐业务码：`expect(res.body.code).toBe(400)` → `expect(res.body.code).toBe(400001)`

### 验证

- 单文件：`tests/backup.test.js` **6/6 通过**，EXIT=0 ✅
- 全量（模拟 CI 无 DB）：**130 suites / 1304 tests 全部通过**，EXIT=0 ✅；覆盖率 Statements 53.16% / Branches 35.88% / Functions 52.37% / Lines 56.38%，全部达标
- 探针文件跑完即删，`backend/tests/` 无残留

---

## 九、复现与证据命令

```bash
# 1) 列出 run 的全部 job 与 step 结论
curl -s https://api.github.com/repos/7ztctcmctm-star/huakey-crm/actions/runs/35493957938/jobs

# 2) 验证 lock 里的地址是否真实存在
curl -sI https://registry.npmjs.org/xlsx/-/xlsx-0.20.3.tgz          # 404
curl -sI https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz        # 200

# 3) 查 registry 上 xlsx 的真实版本集
curl -s https://registry.npmjs.org/xlsx | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const v=Object.keys(j.versions);console.log('count',v.length,'latest',j['dist-tags'].latest,'has 0.20.3',v.includes('0.20.3'))})"

# 4) 本地等价复现（隔离目录，不影响仓库）
mkdir -p /tmp/probe && cd /tmp/probe
#  放入与仓库一致的 package.json + package-lock.json 片段，然后：
npm ci --no-audit --no-fund      # 期望 E404 / EXIT=1

# 5) 反向验证修复：把 resolved 改为 CDN URL 后再跑
npm ci --no-audit --no-fund      # 期望 added 1 package / EXIT=0
```

---

## 十、第二轮修复：`backend-test` uploads 目录 + `integration-test` 权限 mock 脱节（提交 `78b825e`）

第一轮修复（`95c6f6a`：xlsx 地址 + `backup.test.js` 错误中间件）后，CI 由 **5 红 → 2 红**，剩余：

| job | 首败步骤 |
|---|---|
| `backend-test` | #7 `Run cd backend && npm test` |
| `integration-test` | #9 `Run cd backend && npx jest tests/e2e/ --config jest.integration.config.js --forceExit` |

### 10.1 `backend-test`：`backend/uploads` 目录在 CI 上不存在

**根因**：`backend/uploads/**` 在 `.gitignore` 中，`actions/checkout` 后不存在；
`routes/knowledge.js:80-82` 以 `../uploads/knowledge` 作为 **multer 的磁盘目的地**。
生产镜像由 `Dockerfile.synology` 的 `RUN mkdir -p /app/uploads` 保证，**CI 缺等价准备**
⇒ multer 写盘 ENOENT → 500（`tests/knowledge.test.js`「应该返回200当上传允许的文档类型」）。

> ⚠️ **不能指望代码自愈**：该测试 mock 了 `fs.existsSync → true`，因此
> `knowledge.js` 里 `if (!existsSync) fs.mkdirSync(...)` 的自建逻辑**不会生效**。

**修复**（`.github/workflows/ci.yml`，`backend-test` job）：

```yaml
- name: Prepare upload directories
  run: mkdir -p backend/uploads/knowledge
```

**验证**：在「CI 等价工作区」（`git ls-files` 只复制被跟踪文件 + `node_modules` junction +
移除 `.env`/未跟踪项）复跑 —— 修复前 `1 failed`，修复后 **129 suites / 1293 tests 全绿**。

### 10.2 `integration-test`：5 套件 / 8 用例失败，**全部是测试与「权限加固」脱节，非产品缺陷**

`fb15466 fix(security): 全项目审计修复 P0+P1（权限加固 …）` 给若干详情端点补了
`checkPermission(...)`，此后这些 e2e 用例的 mock 序列与真实中间件链错位，自 8/7 起一直红
（此前被 `npm ci` 的 E404 挡住，从未跑到）。

| 症状 | 套件 / 用例 | 根因 | 修法 |
|---|---|---|---|
| **403** | `opportunity-flow.spec.js` 2.1（期望 200）、2.2（期望 404） | 该文件**未 mock `permissionService`**，`checkPermission('opportunity:view')` 会**真查库**取权限码；mock 序列漏掉这一次查询，本应给 `checkDataPermission` 的 `[[]]` 被 `checkPermission` 消费 ⇒ 权限判定为空 ⇒ 403 | 在 auth 三次查询之后补一次 `.mockResolvedValueOnce([[{ code: 'opportunity:view' }]])` |
| **500** | `rbac-business-flow.spec.js` Case2-1 / Case3、`release-smoke-test.spec.js` 7a / 7b、`boss-approval-permission.spec.js`（sales 审批合同） | 这些文件已 mock `permissionService`，但相关用例**未给出 `getUserPermissions` 的返回值** ⇒ `middleware/permission.js:28` 的 `userPermissions.includes(code)` 对 `undefined` 抛 TypeError ⇒ catch 返回「权限校验异常」500 | 显式给出权限数组（有权限 → `['opportunity:view']`；无 `contract` 权限 → `[]`） |
| **404** | `permission-real.integration.test.js` 用例 6（期望 403） | 断言前提是「sales 无 `approval` 权限 → 403」，但 `beforeAll` 的 `INSERT IGNORE` **只新增、不撤销**库中 role 3 已有的 `approval` 授权 ⇒ 请求穿透到 `approvalService`，因审批记录不存在返回 404 | `beforeAll` 显式撤销 role 3 的 approval 关联（JOIN 按 `code` 删除，覆盖同 code 多行），使前提自洽、不依赖库初始状态 |

另将 `rbac-business-flow` Case 3 的注释更正为**真实路由链**：
`routes/contract/approval.js:19` 是 `checkPermission('contract') → requireManager`，并非 `requireAdmin`。

**验证（本机等价库）**：

| 范围 | 结果 |
|---|---|
| 4 个纯 mock 套件（`opportunity-flow` / `rbac-business-flow` / `release-smoke-test` / `boss-approval-permission`） | **36 / 36 通过** |
| `permission-real.integration.test.js`（真库） | **7 / 7 通过**（日志确认 `POST /api/v1/approval/approve/1 → statusCode:403`） |
| `tests/e2e/` 全量 | **10 suites / 69 tests 全绿** |
| ESLint `--max-warnings=0`（5 个改动文件） | EXIT 0 |

**CI 侧观测（最终：已收敛为全绿）**

run **`35498110675`**（sha `78b825e` 的后继文档提交 `9d10a5b`），触发 2026-09-20T07:54:15Z、完成 07:58:15Z，
run 级 `conclusion = "success"`，**9 个 job 中 8 个 success + 1 个 skipped**：

| job | 结论 | 关键步骤（job/step 级 API 实测） |
|---|---|---|
| `backend-test` | success | `npm test` / `npm audit` 均 success —— §10.1 的 uploads 修复被 CI 确认 |
| `integration-test` | **success** | `Import baseline schema + verify invariants` 07:54:49→07:54:59；**`npx jest tests/e2e/ --config jest.integration.config.js` 07:54:59→07:55:05 success** |
| `migration-test` | **success** | baseline 07:54:56→07:55:05；`jest tests/db/migration-roundtrip.test.js` 07:55:05→07:55:06 success（⚠️ 见 §10.6） |
| `e2e-test` | **success** | seed 07:55:20、权限初始化 07:55:21、**`Playwright E2E tests` 07:55:49→07:58:10 success** |
| `frontend-test` / `frontend-build` | success | — |
| `security-scan`（CodeQL）/ `image-scan`（Trivy） | success | — |
| `cross-browser-test` | skipped | 触发条件未满足（历史一致行为） |

补充旁证三条：

1. 此前「卡死」的 run `35496862377`（sha `78b825e`）在**网络恢复后自行跑完，同样为 `success`**
   ⇒ 当时的卡住确系 runner / 网络侧故障，**与代码无关**，本节 §10.1/§10.2 的结论由此获得 CI 侧独立确认。
2. **`integration-test` 确在真执行**：历史上存在 `integration-test` job 为 `failure` 而其 jest 步骤耗时
   7–9s 的 run（如 `34946115747` / `34938334928`）⇒ 该步骤会真跑、会真红，本次 6s success 是真实通过。
3. ⚠️ Actions 的 job 日志接口（`/actions/jobs/{id}/logs`）对本仓库仍返回 **403**（需 admin），
   故**无法**从日志核对 CI 侧的用例条数；本节全部结论基于 job/step 级 API 的结论与时间戳。

### 10.3 ⚠️ 定位过程中必须避开的一个陷阱：本机默认跑集成测试会得到「假失败图」

本机 MySQL **没有 `crm_test` 用户**（那是 CI 的 `docker-compose.ci.yml` 建的），
而 `tests/setup-integration.js:11` 的兜底是 `process.env.DB_USER || 'crm_test'`
⇒ 不显式传 `DB_USER` 就**连不上库**。

此时失败面被放大为 **9 suites / 30 tests**，且 `health.integration.test.js`（只需库连通）也红。
**判据：「连健康检查都红」就是"没连上库"的指纹。** 传对凭据后立刻收敛为 **5 suites / 8 tests**。

⇒ 分析集成测试失败**前**，必须先用健康检查套件当连通性探针。

### 10.4 `permission-real` 测试"删了不还" —— 已修复（`7e68d94`）

**原实现共 5 处副作用**（前 3 处会破坏基线数据）：

| # | 位置 | 副作用 |
|---|---|---|
| 1 | `afterAll` 按 **code** 删 | 删掉这 6 个权限码下的**全部** `sys_permission` 行 ⇒ 基线同名记录一并被删（实测本机 **114 → 108**）；对应的 `sys_role_permission` 也被连带删除（**315 → 300**） |
| 2 | `beforeAll` 第 4b 步 | 删掉 role 3 的 `approval` 关联后**从不还原** ⇒ 永久削弱该角色权限 |
| 3 | `afterAll` 无条件删 | 删掉 (role 3, customer) 的 `data_permission` 行 —— 基线本来有也被删 |
| 4 | 用例 5 | 创建客户后**不清理**（库中残留；本机实测残留 3 个测试公司） |
| 5 | 步骤 3 的 upsert | `ON DUPLICATE KEY UPDATE name = VALUES(name)` 会**覆盖基线行的 `name`**（改了不还） |

**修法**：`beforeAll` 第 0 步 `captureBaseline()` 记录基线（已存在的权限行 id 及字段、
受影响角色的既有授权集合、4b 将删除的关联、原 `data_scope`）；`afterAll` 改为
「还原 4b 删除的关联 → 只删本测试新建的关联 → 只删本测试新建的权限行 → 还原基线行被覆盖的字段
→ `data_scope` 有则改回/无则删 → 清测试用户」。用例 5 补客户清理。

**验证（数据护栏，实测"跑测试前后基线零变化"）**：新增两个本机工具
`perm-test-guard.js`（受影响切片快照/比对）与 `perm-baseline-sim.js`（合成可辨识基线）。

| 场景 | 用例 | 基线变化 |
|---|---|---|
| 无基线（这 6 个码在本机已不存在） | 7/7 通过 | **零变化**（108→108 / 300→300） |
| **合成基线（复现上表破坏场景：6 权限 + 12 角色关联 + `data_scope='dept'`）** | 7/7 通过 | **零变化**（114→114 / 312→312 / 52→52） |

合成基线场景覆盖了全部还原路径：`role3→approval` 被 4b 删除后**被还原**、`data_scope` 由 `self`
**改回 `dept`**、基线权限行的 `name` **被还原**、本测试新建的行被清理。修复前同场景会丢 6 行权限 + 12 行关联。

> ⚠️ **纠正一处此前的错误结论**：本节早先写「受影响 5 张表已备份…**并已恢复**」——
> 本轮复核发现**并未恢复**：本机 `huakey_crm_test` 至今仍是 `sys_permission=108`、
> `sys_role_permission=300`，且这 6 个权限码在本机**完全不存在**（另残留 3 个测试客户）。
> 即当时那句"已恢复"是**假完成**（未复核就下结论），本节据实更正。
> 如需补齐到权威终态，可运行 `backend/scripts/init_role_permissions.js`
> （注意该脚本会按配置**清理**不在配置中的历史权限行 —— 执行前先备份）。
> 另：**CI 不受影响**，其库每次由 `deploy/init-complete.sql` 重建。

### 10.5 本轮未能精确复刻 CI 的说明（诚实标注）

- 本机 **docker daemon 未运行**（`npipe:////./pipe/dockerDesktopLinuxEngine` 不可达），
  无法用 `docker-compose.ci.yml` 起 MySQL 8.0 精确复刻 CI 的库。
- `crm_user` **无建库权限**，不能新建隔离库 ⇒ 只能复用本机 `huakey_crm_test`（含 400+ 客户的历史库）。
- 故本机为**近似**复刻。但其中 **4 个套件是纯 mock（不连库）**，其结论与 CI **逐字一致**，
  可信度最高；真库套件（`permission-real`）的改法已刻意选为「对环境鲁棒」。

### 10.6 ⚠️ 顺带发现：`migration-test` 的 55 个往返用例疑为「静默跳过即通过」（**既有现象，非本轮引入**）

CI 变绿后复核 `migration-test`，发现其 jest 步骤只用 **1 秒**（07:55:05→07:55:06），
而该文件实际应当执行 **55 个数据库往返用例**（`ROUNDTRIP_VERSIONS` = `TEST_VERSIONS`(3) +
`NEW_DOWN_VERSIONS`(49) + 收尾 3 项，每例两次 `node run_migrations.js` 子进程 + 5 次 `SHOW CREATE TABLE`）。
1 秒与之不相容，遂深查。

**根因（测试写法，不是产品缺陷）**：`tests/db/migration-roundtrip.test.js` 的用例体带**早退分支**：

```js
if (!pool) { console.warn('[migration-roundtrip] 跳过：数据库不可达'); return; }
```

而 `pool` 只在 `beforeAll` 中「端口可达 → 用 root 建库/选库 → `runMigration('--rollback 002')` →
`runMigration()` 全量重放」**四步全部成功**后才被赋值；任一环节失败（端口不可达 / 认证失败 /
迁移执行抛错）都会 `return`，此后 **55 个用例全部静默通过**（`return` 等同于 pass），job 显示 success。

**本机非破坏性复现（DB 指向无人监听的端口，不触碰任何数据）**：55 个用例全部输出
`跳过：数据库不可达`，**退出码 0** —— 假绿发生在**断言层**（不同于 §10.3 的连接层假失败图）。

**旁证：job/step 级 API 横向扫描（8 个 run，跨 09-11 → 09-20）**

| 步骤 | 各 run 实测耗时 | 判读 |
|---|---|---|
| `migration-test` 的 jest（往返） | **恒为 1–2s** | 110 次 node 子进程（按 40–80ms 冷启动估算约 4–8s）+ 275 次查询，**下界明显高于 2s** ⇒ 与"真跑"不相容 |
| `integration-test` 的 jest | 恒为 7–9s，且**曾 failure** | 该步骤确在真跑（见 §10.2 旁证 2） |

⇒ **`migration-test` 的 success 自 09-11 起即是既有状态**（09-12 / 09-14 / 09-15 / 09-16 / 09-17 / 09-18
各绿 run 的该步骤耗时均为 1–2s）——本轮只是让它**第一次能跑到这一步**，并非本轮改动引入的回归。
其中**真正形成断言的只有文件级审计用例**（`expect(audit.total).toBeGreaterThan(0)`、
`expect(audit.withDown).toBeGreaterThanOrEqual(17)`），55 个数据库往返用例**很可能从未在 CI 上执行过**。

> **证据强度声明（诚实标注）**：上述为「耗时下界 + 早退分支」的**推断**，**未获 CI 日志直接确认**
> （日志接口 403，见 §10.2 旁证 3）。它与 §10.4 的 `permission-real` 清理隐患并列为**本轮新登记的两项既有技术债**，
> 均**未在本轮修改**（避免在"收口 CI 红"这一目标外引入新变量）。
>
> 建议后续单独开一项处理：把早退改为 `test.skip`（可见地跳过）或 `expect(pool).toBeDefined()`
> （显式失败），让「没连上库」不再伪装成 success。

### 10.7 §10.6 收口：空转根因已实证并修复（`81a112a` → `7d60170` → `bf7560f`）

§10.6 当时只能写「推断，未获 CI 日志确认」。本轮把推断做成了实证，并**顺手挖出一处真实的迁移缺陷**。

#### 10.7.1 取证通道：check-run 注解 API（**不需要 admin**）

`GET /actions/jobs/{id}/logs` 对本仓库恒为 **403**（Must have admin rights），但另一条路可用：

| 通道 | 是否需 admin | 用途 |
|---|---|---|
| `/actions/jobs/{id}/logs` | **需** ⇒ 403 | （不可用） |
| `/actions/runs/{id}/jobs` | 否 | job/step 的**结论与时间戳** |
| `/repos/{o}/{r}/check-runs/{check_run_id}/annotations` | **否，匿名 200** | **注解正文**（含 `::warning::` 打的内容） |

流程：`::warning::` 工作流命令 → 生成 check-run 注解 → 用上面第三个接口取回。
`check_run_id` 不在 Actions 的 jobs 响应里，需 `GET /repos/{o}/{r}/commits/{sha}/check-runs` 取。
据此新增了手动/临时诊断工具 `.github/ci/migration-db-probe.js`（定位完成后已从 CI 撤下，
保留为手动工具）。

> ⚠️ **踩过的坑（第一次取证无效）**：ci.yml 里 jest 步骤的口令是**行内**环境变量
> （`DB_PASSWORD=x npx jest ...`），**只作用于那一个 step、不会传给后续 step**。
> 探针初次作为独立 step 运行时 `口令已提供=no`，复现的是「无口令」场景，
> 注解里出现 `Access denied ... (using password: NO)` —— 看着像根因，其实**是探针自己的环境错配**。
> 修法：探针 step 必须自带与 jest 步骤逐字一致的 `env:`，并在脚本里加"未收到口令即告警"的自检。

#### 10.7.2 实证结果（环境对齐后，run `35500745480` 的注解原文）

```
[mig-probe] env DB_HOST=localhost DB_PORT=3306 DB_USER=root DB_NAME=huakey_crm_test 口令已提供=yes
[mig-probe] ① 端口可达 = true
[mig-probe] ③ schema_migrations 已标记执行 = 107
[mig-probe] ④ run_migrations --rollback 002 exit=1 | 准备回滚 106 个迁移
[mig-probe] ④ 首败：✗ 版本 109 回滚失败: You have an error in your SQL syntax;
            check the manual ... near 'IF EXISTS opportunity_id' at line 1
[mig-probe] ② beforeAll 根因: [migration-roundtrip] 迁移执行失败: Command failed: node ... --rollback 002
[mig-probe] ② jest 复跑 exit=0 | suites=1 tests=56 passed=56 pending=0 failed=0
[mig-probe] ② 早退告警实测 = 55 行
```

**根因（两层，互相放大）**：

1. **产品级**：`109_follow_up_opportunity_down.sql` 用了 `ALTER TABLE ... DROP COLUMN IF EXISTS`
   —— 那是 **MariaDB 语法，MySQL 8.0 不支持** ⇒ `--rollback 002` 在版本 109 首败，
   `run_migrations.js` 走 `process.exit(1)`（同批还有 `108_contract_cancel_fields_down.sql` 两处）。
2. **测试级**：`beforeAll` 的 `catch` 把上面的失败 `console.warn` 掉后 `return`，
   于是 `pool` 永不赋值 ⇒ 55 个用例命中 `if (!pool) return;` 早退分支 ⇒
   jest 报 **`tests=56 passed=56 pending=0 failed=0`**，job 显示 success。
   **「用例全部通过」与「一个都没执行」在报告上完全不可区分。**

历史上该步骤**恒为 1–2s**：`--rollback` 从最高版本倒序执行，109 以上多数版本没有 down 文件
（`continue` 跳过），到 109 才真正执行并立刻失败 ⇒ 秒级。这也是 §10.6 用「耗时不合理」推断的依据。

#### 10.7.3 修复

| 提交 | 内容 |
|---|---|
| `81a112a` | 探针 env 与 jest 步骤对齐 + 自检告警（**先修量具，再量**） |
| `7d60170` | **修 108/109 两个 down 脚本**：改用项目惯例模式（`information_schema` + `PREPARE/EXECUTE` 条件化 DDL）——`090_down` 与 108/109 的 **up** 脚本本来就用这个模式，只有这两个 down 脚本漏了 |
| `bf7560f` | **测试说真话**：三处早退出口改为「本机可见跳过 / **CI 上 throw ⇒ job 红**」；撤下临时探针（保留为手动工具，jest 复跑改 `PROBE_RERUN_JEST=1` 按需） |

**修复效果（job/step 级 API，无需日志）**：

| | 修复前 | 修复后（run `35501113132`，sha `7d60170`） |
|---|---|---|
| jest 步骤耗时 | **1–2s** | **466s** ✅ |
| 早退告警 | 55 行（全部静默跳过） | **0 行** |
| run 结论 | success（空转绿） | success（**真跑**） |

⇒ 55 个往返用例**第一次真正执行**（106 次回滚 + 106 次重放）并且**通过**。

#### 10.7.4 ⚠️ 顺带观察到的两处现象（**在异常中间态上观察到，未复现，不作为已确认缺陷**）

探针的第 ④ 步跑在「jest 步骤已回滚+重放过」的**中间态**上，因此它的读数不能直接等同于
干净基线态。如实记录：

1. `schema_migrations` 由基线 **107 → 95**（少 12 个版本标记）——回滚+重放后账本未回到原值，
   提示 `migrateUp` 的重放可能未重新标记部分版本。
2. 在该中间态上再跑 `--rollback 002`，首败变为 **版本 096**
   （`Can't DROP 'idx_purchase_order_approval_status'; check that column/key exists`）。
   **注意 `096_down` 本身是有 `information_schema` 保护的**，故这更像是"中间态不自洽"
   导致的次生现象，而非 096 自身缺陷 —— 需在干净库上单独复现才能定性。

两项均**未修改**，仅登记。

#### 10.7.5 方法论沉淀（三条，已写入 `ci-failure-triage` 技能）

1. **模式扫描必须先剥注释**：本轮初扫把 `090_down` 报成缺陷，实为**注释里**提到了
   `DROP COLUMN IF EXISTS`；它恰恰是正确实现的样板。剥离注释后真实命中只有 2 文件 3 处。
2. **"全绿"要反向核查**：`tests=56 passed=56 pending=0` 完全可能等于"一个都没跑"。
   判据：① 单步骤耗时 vs 理论下界 ② 横向对比历史同步骤耗时（恒 1–2s 即为异常）
   ③ 小写探针复现早退分支（指向无人监听端口，非破坏性）。
3. **先修量具再量**：探针自身的 env 错配会产出一份"看起来很合理"的错误结论 ——
   给量具加自检（本次：未收到口令即告警），比事后怀疑结论更省事。

#### 10.7.6 ⚠️ 追加一处踩坑：**不能用 `process.env.CI` 当"严格模式"判据**

`bf7560f` 首版把"不许静默跳过"的判据写成 `process.env.CI`，结果那次 run 的
**`backend-test` 直接失败**：

- GitHub Actions 在**所有** job 都设 `CI=true`，**不区分**有没有数据库；
- 而 `backend-test` 会跑到本文件 —— `jest.config.js` 的 `testPathIgnorePatterns` 只排除了
  `/tests/e2e/`、`/tests/security/`、`/tests/performance/` 与 `setup-integration.js`，
  **并未排除 `tests/db/`**；
- 该 job 没有 MySQL ⇒ "端口不可达"分支被 `throw` 命中 ⇒ 整个 `backend-test` 变红。

**修法（`e3aa21a`）**：判据改为**显式开关** `MIGRATION_ROUNDTRIP_STRICT=1`，
只在 `migration-test` job 的 jest 步骤上打开；四处出口统一按它分档。

| 场景 | backend-test（无开关） | migration-test（`STRICT=1`） |
|---|---|---|
| DB 不可达 | warn + 跳过 ⇒ **绿** | throw ⇒ **红** |
| DB 认证失败 | warn + 跳过 ⇒ **绿** | throw ⇒ **红** |
| DB 就绪但迁移链失败 | 不可达该分支 | throw ⇒ **红** |
| 用例体 `!pool` 兜底 | warn + 跳过 ⇒ **绿** | throw ⇒ **红** |

（本机对照实测：前者 `exit 0`，后者 `exit 1`。）

**最终验证（run `35502424789`，sha `e3aa21a`）**：9 个 job → **8 success + 1 skipped**，
`migration-test` 的 jest 步骤 **444s** success。⇒ **CI 既是绿的，又是真的**：
今后若再出现"没真跑"，该 job 会立刻变红，而不是继续伪装成 success。

**通用教训**：给测试加"按环境变量收紧"的行为前，必须先确认**哪些 job 会跑到这个测试文件**；
`CI` 这类平台级变量在 Actions 里是全局为真的，**不具备区分度**。有区分度的只能是显式开关。

---



*分析人：David ｜ 日期：2026-09-20 ｜ 依据：GitHub Actions job/step 级 API（含终态全绿复核 run `35498110675`）+ lockfile 静态体检 + 本地 npm ci 对照实测 + 逐 commit 二分定位 + 本机等价库集成测试实测*
