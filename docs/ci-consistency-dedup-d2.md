# CI 一致性与去重 + 前端 lint 门禁从零建立（D2，2026-10-22）

> 对应《全面审计与企业级优化方案 2026-10-16》Phase D 步骤 D2。
> 目标：CI 配置消除重复与漂移、失败可见（不等半就绪服务）、依赖安装口径统一、前端补齐 lint 门禁。

## 一、改动总览

| # | 计划项 | 落地 | 证据 |
|---|---|---|---|
| 1 | Trivy 门禁统一 | 删除 `ci.yml` 的 `image-scan` job（与 `trivy-scan.yml` 的 `scan-images` 重复：同一 `Dockerfile.synology` 构建，但一个只扫 CRITICAL 且 exit-code 0 不阻断）；`trivy-scan.yml` 的 `scan-filesystem` exit-code 0 → **1**（与 `scan-images` 的 CRITICAL,HIGH+阻断对齐） | 两 workflow diff |
| 2 | 安装命令统一 | `ci.yml` frontend-test / frontend-build 的 `npm install --legacy-peer-deps` → **`npm ci --legacy-peer-deps`**（e2e/cross-browser 原本已是 ci） | ci.yml diff |
| 3 | 前端 lint 门禁 | 从零建立：`eslint@10.13.0` + `eslint-plugin-vue@10.11.1` + `globals`，flat 配置 `eslint.config.mjs`，`npm run lint` = `eslint . --max-warnings=0`（与 backend 同口径）；frontend-test job 在 test 前插入 lint 步骤 | 见第二节 |
| 4 | 重复步骤抽 composite action | 新增 `.github/actions/setup-test-db`（原 4 处逐字重复的「Import baseline + N-05 92 项校验 + 测试用户 + 迁移台账」约 30 行）与 `.github/actions/seed-test-db`（原 2 处重复的 seed-demo + init_role_permissions） | 4→1、2→1 |
| 5 | MySQL 等待兜底 | 4 处等待循环统一补「30 次未就绪 → `exit 1`」：原循环跑完不失败，后续步骤会在半就绪的库上报误导性错误 | ci.yml 4 处 |
| 6 | 缓存 key | 3 处 cache key 加 `${{ runner.os }}` + `node${{ steps.setup-node.outputs.node-version }}`（setup-node 加 id），避免换 Node 大版本后命中旧缓存 | ci.yml diff |
| 7 | job 依赖 / 权限 | `frontend-build` 加 `needs: frontend-test`；顶层 `permissions` 显式 `contents: read`（保留 `security-events: write` 供 CodeQL/Trivy 上传） | ci.yml diff |

## 二、前端 lint 门禁（本次最大工作量）

### 2.1 配置（`frontend/eslint.config.mjs`）

- 规则集：`eslint-plugin-vue` 官方 `flat/essential` + 核心规则（与 `backend/.eslintrc.json` 对齐：`no-unused-vars` warn、`no-undef` error、`no-empty` warn、`caughtErrors: 'none'`——ESLint 8 后端默认值，保持「`catch (e) {}` 不使用的绑定不告警」同一风格）。
- 环境：src 为 browser globals；`e2e/**`、`src/tests/**`、`*.test.js` 补 node globals（process/`__dirname`，vite-node 运行时注入）；`src/tests/**` 补 vitest globals（describe/it/expect/vi）。
- `vue/multi-word-component-names` **按项目风格关闭**：路由级视图按路由名单文件名（`user.vue`/`tags.vue`/`index.vue`）与 router 一一对应，是既定约定；eslint-plugin-vue v10 将该规则并入 essential，78 个文件会全军覆没，重命名 78 个文件只会制造无收益 churn。`src/components` 下可复用组件本就多词命名。

### 2.2 首跑 357 问题（122 error / 235 warning）→ 修复后 0

| 类别 | 数量 | 处置 |
|---|---|---|
| `vue/multi-word-component-names` | 78 | 配置关闭（项目风格，见上） |
| `no-unused-vars` | 235 → 131 | 131 个未使用导入/绑定全量清除（112 个脚本自动按行删除、19 个人工核对多行导入/`defineProps`/解构） |
| `vue/no-mutating-props` | 9 | **真问题重构**：见 2.3 |
| `no-undef` | 3 | **真缺陷**：见 2.4 |
| `vue/no-unused-vars` | 3 | 模板 `#default="{ row }"` 解构未使用 → 改 `#default` |
| 环境类（process/global/`__dirname`） | 32 | 配置补 globals（e2e/测试基建运行在 Node 侧，非代码缺陷） |

### 2.3 CustomerFilter：不再直接改 props（9 处 mutating-props）

`views/customer/components/CustomerFilter.vue` 原来通过 `v-model="searchForm.xxx"` 直接改父级传下的
reactive 对象字段（9 个筛选项）。重构为**本地草稿 + 整体 emit 回写**：

- 子：`const form = ref({ ...props.searchForm })` + `watch(() => props.searchForm, …, { deep: true })`；
  控件改 `:model-value` + `@update:model-value="v => updateField(k, v)"`，`updateField` 改草稿后
  `emit('update:searchForm', { ...form.value })`。
- 父：`views/customer/List.vue` 的绑定改 `v-model:search-form="searchForm"`。
- 防环：`lastEmitted` 引用比对——父级 `v-model` 回写的是同一对象引用，watch 识别并跳过；
  父级原地改（重置 / tab 切换）仍能通过 deep watch 同步回子组件草稿。
- 行为不变：输入/选择/清空/父级重置/标签与排序的 `@change` 连带搜索，事件时序与原
  「同步改 props」等价（emit 与父级赋值均在 `update:model-value` 派发中同步完成）。

### 2.4 两个渲染期 ReferenceError 真缺陷（lint 门禁的首个实战收获）

- `views/report/finance.vue`：`renderTrendChart()` 用了 `chartColors.primary/secondary` 但**从未 import**——
  打开财务报告页会 `ReferenceError` 崩渲染（vitest 只编译模板不执行 render，故测试全绿也没暴露）。
- `views/survey/analytics.vue:142`：同样漏 import `chartColors`。

两处均补 `import { chartColors } from '@/utils/chartTheme'`。
（`chartTheme.js` 模块级求值/惰性化属于 E1 范围，本次不动。）

## 三、本地验证证据

| 项 | 命令 | 结果 |
|---|---|---|
| 前端 lint | `cd frontend && npm run lint` | **0 problems**（`--max-warnings=0` 通过） |
| 前端单测 | `cd frontend && npx vitest run --no-file-parallelism` | **25 文件 / 159 用例全绿** |
| 前端构建 | `cd frontend && npm run build` | 成功（34s） |
| workflow 语法 | js-yaml 解析 4 个 YAML | 全部 OK；job 清单 8 个（image-scan 已移除） |
| lockfile 一致性 | `npm ls eslint eslint-plugin-vue globals vue-eslint-parser` | 树解析正常（CI `npm ci` 前置条件） |

> 并行 `npm test` 首跑 3 个文件超时（request/guards/Login，46s+）为已知 CPU 争抢 flake
> （vitest.config.js 注释与 MEMORY 均有记载），串行复跑全绿——非本次改动引入。

## 四、风险与待办（需发布经理决策/观察）

1. **`image-scan` 若在分支保护 required checks 中**：删除该 job 后此上下文将永远不再上报，
   合并会被卡住。本机 gh 未登录、匿名 API 读不到 protection 设置，无法核实。
   David 需在 Settings → Branches 确认；若在，移除该项（等效阻断由 trivy-scan.yml
   `scan-images` 承担：CRITICAL,HIGH + exit-code 1，严于原 image-scan 的仅 CRITICAL + 不阻断）。
2. **trivy fs 扫描转阻断**：本次推送会真实执行（frontend/package*.json 在触发路径内）。
   本机无 trivy、npmmirror audit NOT_IMPLEMENTED，无法预验；若 CI 报红即为 lockfile 真实
   HIGH/CRITICAL 发现，按计划意图应予修复而非放宽门禁。
3. composite action 内 `docker exec -i ci-mysql` 仍用 root/test_root_pass（CI 专用 compose 凭据，
   与原内联步骤一致，未扩大暴露面）。

## 五、计划进度

- Phase D：**D2 完成**；D1（测试盲区+覆盖率门槛）、D3（nginx/compose/备份加固）未动。
- Phase C：C3 未动。B4 遗留：冗余外键去重迁移未建（`crm_contract` 双 FK 同在 opportunity_id）。
