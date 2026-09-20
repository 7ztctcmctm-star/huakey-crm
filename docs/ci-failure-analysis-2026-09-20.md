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

**CI 侧观测**（run `35496862377`，sha `78b825e`，截至 2026-09-20T08:00Z，尚未收敛）：

| job | 状态 |
|---|---|
| `backend-test` | **`npm test` success（07:26:34→07:26:51，17s）** —— 本轮 uploads 修复已被 CI 确认；`npm audit` 亦 success |
| `frontend-test` / `frontend-build` | success |
| `integration-test` | 卡在 `Import baseline schema + verify invariants`（07:26:51 起，>30 分钟未完成），jest 步骤尚未开始 |
| `migration-test` | 同上（07:26:50 起） |
| `e2e-test` | 卡在 `cd frontend && npm ci --legacy-peer-deps`（07:26:50 起） |
| `image-scan` | 卡在 `Build`（docker build，07:26:21 起） |
| `security-scan` | 卡在 CodeQL `analyze`（07:26:31 起） |

> ⚠️ **5 个 job 同时从同一时刻起卡住，且连 `backend-test` 的 `Post Run actions/cache@v4`
> （仅保存缓存、不跑任何业务代码）也卡了 27 分钟以上** ⇒ 属 runner / GitHub 服务侧异常，
> **与本次代码改动无关**。故 `integration-test` 的修复结论目前依据**本机等价库实测**，
> CI 侧需待该步骤实际执行后复核。

### 10.3 ⚠️ 定位过程中必须避开的一个陷阱：本机默认跑集成测试会得到「假失败图」

本机 MySQL **没有 `crm_test` 用户**（那是 CI 的 `docker-compose.ci.yml` 建的），
而 `tests/setup-integration.js:11` 的兜底是 `process.env.DB_USER || 'crm_test'`
⇒ 不显式传 `DB_USER` 就**连不上库**。

此时失败面被放大为 **9 suites / 30 tests**，且 `health.integration.test.js`（只需库连通）也红。
**判据：「连健康检查都红」就是"没连上库"的指纹。** 传对凭据后立刻收敛为 **5 suites / 8 tests**。

⇒ 分析集成测试失败**前**，必须先用健康检查套件当连通性探针。

### 10.4 ⚠️ 顺带发现的既有隐患（本轮未改，如实记录）

`permission-real.integration.test.js` 的 `afterAll` 会按 **code** 删除它插入的 6 个权限码对应的
`sys_permission` 行 —— 若基线里本来就有同名 `code`，**基线记录会被一并删除**。
实测本机 `huakey_crm_test`：`sys_permission` **114 → 108**、`sys_role_permission` **315 → 300**。

- 受影响 5 张表已备份至 `C:/Users/a8466/huakey-crm-backups/pre-permreal-20260920/` 并已恢复。
- 若要补齐到权威终态，运行 `backend/scripts/init_role_permissions.js`
  （注意该脚本会按配置**清理**不在配置中的历史权限行）。
- 建议后续把该测试的清理改为「只删自己新建的行」（记录插入前的 id 集合做差集），而非按 code 删。

### 10.5 本轮未能精确复刻 CI 的说明（诚实标注）

- 本机 **docker daemon 未运行**（`npipe:////./pipe/dockerDesktopLinuxEngine` 不可达），
  无法用 `docker-compose.ci.yml` 起 MySQL 8.0 精确复刻 CI 的库。
- `crm_user` **无建库权限**，不能新建隔离库 ⇒ 只能复用本机 `huakey_crm_test`（含 400+ 客户的历史库）。
- 故本机为**近似**复刻。但其中 **4 个套件是纯 mock（不连库）**，其结论与 CI **逐字一致**，
  可信度最高；真库套件（`permission-real`）的改法已刻意选为「对环境鲁棒」。

---

*分析人：David ｜ 日期：2026-09-20 ｜ 依据：GitHub Actions job/step 级 API + lockfile 静态体检 + 本地 npm ci 对照实测 + 逐 commit 二分定位 + 本机等价库集成测试实测*
