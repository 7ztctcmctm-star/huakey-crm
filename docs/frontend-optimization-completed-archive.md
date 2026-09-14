# 前端优化路线图 V2 · 已完成条目归档

> 归档时间：2026-09-14
> 来源：`docs/frontend-optimization-roadmap-v2.md`
> 目的：路线图正文只保留**未完成待办**；已完成条目的原文、收益数据与决策追溯统一归档于此，
> 避免删除后丢失结论（尤其是「被证伪的假设」与「刻意不采纳」的理由）。

---

## 归档说明

本文件收录从路线图中**移出**的已完成条目。移出时**逐条核对代码实证**，判据一律取
`git log` / 文件内容 / 构建实测，不采信文档自述。

| 编号 | 原条目标题 | 完成时间 | 关键提交 |
|---|---|---|---|
| P0-1 | 骨架屏覆盖率扩展 | 2026-09-11 / 2026-09-14 | `15027e8`、`eaedd62` |
| P0-2 | 激活 StateWrapper 统一三态管理 | 2026-09-11 / 2026-09-14 | `0ce745b`、`ef0d4a6`、`f5112e4`、`8bfd380`、`d9606ae`、`eaedd62` |
| P0-3 | 登录页视觉升级 | 2026-09-11 | `50a7b64` |
| P0-4 | 卡片 hover 效果降级 | 2026-09-11 | `50a7b64` |
| P1-1 | 列表页统一工具栏布局规范 | 2026-09-14 | `PageToolbar.vue` + 22 页接入，见 `docs/frontend-optimization-roadmap-v2.md` §P1-1 |
| P1-4 | 搜索体验优化（防抖部分） | 2026-09-11 | — |
| P2-1 | ECharts 按需加载与懒渲染 | 核查确认「无需改动」 | — |
| P2-4 | 构建优化 | 2026-09-14 | `0a42ac3` |

---

## P0-1 骨架屏覆盖率扩展 —— ✅ 已完成

**原现状**：仅客户、商机、报价、合同 4 个列表页用 `TableSkeleton`，其余 14+ 个列表页加载时空白闪烁。

**完成情况**：
- `components/common/TableSkeleton.vue` 已存在并被 **49 个视图**引用（`grep -rl TableSkeleton frontend/src/views | wc -l` = 49）。
- 2026-09-14 的 P2-3 扩面批次（提交 `eaedd62`）把骨架屏统一收进 `StateWrapper` 的 `#loading` 插槽，
  不再是各页面手写 `v-if="loading"`。
- 附带修复 `StateWrapper` 错误态**重复渲染两个「重新加载」按钮、且靠上那个是死按钮**的缺陷（`d9606ae`），
  并新增模板绑定守卫测试（`15027e8`）。

**留档的实现约定**（后续新页面必须遵守）：
- 每页 3 处改动：模板用 `StateWrapper` 包住表格+分页、脚本 import 三个符号、脚本补 `errorMsg` + 三分支取数。
- `:empty="!loading && !errorMsg && data.length === 0"`；`#loading` 内放 `<TableSkeleton :rows :cols />`；
  同时**删掉表格自身的 `v-loading`**（否则与骨架屏双机制叠加）。
- `loading` 初值规则：仅 `onMounted` **无条件**取数时置 `true`（消首帧「暂无数据」闪动）；条件取数/非 `onMounted` 保持 `false`。

**未覆盖（如实登记，非遗漏）**：详情页内嵌多子表 9 页、多表格看板 5 页、编辑页、日历/流程型页等共 21 页，
分档理由见 `docs/outstanding-work-audit-2026-09-14.md` 附录 A.2。

---

## P0-2 激活 StateWrapper 统一三态管理 —— ✅ 已完成

**原现状**：`components/common/StateWrapper.vue` 已封装「加载 / 错误 / 空 / 正常」四态，但**全项目零引用**，属死代码。

**完成情况**：接入视图由 **2 个 → 30 个 → 49 个**（2026-09-14 终态），远超原定「20+ 页面」目标。
实施计划与执行记录见 `docs/frontend-statewrapper-promotion-plan.md`。

> ⚠️ **该推广计划文档内有 36 个未勾选框，属规划稿勾选残留，不代表实际进度。**
> 其承诺内容（守护测试、死按钮修复、49 视图接入）**均已交付**。本归档以代码实证为准。

---

## P0-3 登录页视觉升级 —— ✅ 已完成

**原现状**：纯白背景 + 居中表单，无品牌氛围与视觉层次。

**完成情况**：`frontend/src/views/login/index.vue:4-22` 已改为 `brand-pane` aside 分栏布局（左侧品牌区 + 右侧表单）。
提交 `50a7b64`。

---

## P0-4 卡片 hover 效果降级 —— ✅ 已完成

**原方案**：
- 普通 `.el-card`：移除 `translateY`，仅保留阴影加深（`shadow-sm → shadow-md`）
- `.stat-card`：移除 `translateY(-4px)`，改为边框色微亮或背景色微变
- 过渡时长 `0.3s → 0.15s`

**完成情况**（代码实证 `frontend/src/styles/apple.css`）：
- `:208-211` `.el-card:hover` 已**无 `translateY`**，仅阴影加深
- `:240-244` `.stat-card` hover 保留（按设计，统计卡片允许轻微抬升）
- 过渡时长已统一 `0.15s`
- 提交 `50a7b64`

---

## P1-1 列表页统一工具栏布局规范 —— ✅ 已完成（2026-09-14）

**原现状**：各列表页工具栏（搜索 + 筛选 + 操作按钮）布局不统一 —— 有的用 `el-card` 包搜索表单，
有的直接放按钮，筛选条件展开/收起逻辑缺失，操作按钮顺序不统一。

**交付物**：
- `frontend/src/components/common/PageToolbar.vue` —— 通用工具栏组件
- `frontend/src/styles/apple.css` `.page-toolbar` 样式区块
- `frontend/src/tests/unit/components/PageToolbar.test.js` —— 8 例单测
- **22 个列表页**接入

**关键设计**：折叠按钮的渲染条件是「**开启 collapsible 且确实提供了 `#extra` 槽**」双条件 ——
避免出现「点了没反应的死按钮」（沿用 `StateWrapper` 死按钮缺陷的教训）。

**验证**：前端 16 files / 72 tests passed；构建 39.21s 无警告；首屏 JS **139.3 KB gzip**
（与 P2-4 基线 137 KB 持平 ⇒ 纯结构重构，零性能回归）。

**完整验收对照与接入页面清单**：见 `docs/frontend-optimization-roadmap-v2.md` §P1-1。

---

## P1-4 搜索体验优化 —— ✅ 部分完成（防抖已做）

**原方案 4 项**：
1. `⌘K` / `Ctrl+K` 快捷键唤起（带角标提示）
2. 搜索结果按类型分组（客户 / 商机 / 合同 / 联系人）
3. 展示最近 5 条搜索历史
4. 输入 debounce + 加载骨架

**完成情况**：第 4 项**已落地** —— `components/layout/SearchOverlay.vue:115-116` 已实现 **500ms debounce**。

**⚠️ 剩余未完成**：第 1（快捷键提示）、第 2（结果分组）、第 3（搜索历史）项**未实施**，
已回写至路线图正文 P1-4 的「剩余待办」，不在本归档范围内。

---

## P2-1 ECharts 按需加载与懒渲染 —— ✅ 核查确认「无需改动」

**原疑虑**：
- ECharts chunk 仍在首屏加载
- Dashboard 多图表同时初始化可能卡顿
- 图表无 resize 防抖

**核查结论（2026-09-14）**：**原疑虑的前半段被证伪**。
- `dist/index.html` **未 preload echarts** ⇒ 早已路由级懒加载。
- 入口 chunk 内出现的 `echarts-*.js` 字样位于 **Vite 路由 manifest 字符串数组**中（供动态 `import()`），
  **不是静态 `import`**。
- `composables/useECharts.js` 已用 `echarts/core` + 具名注册，按需引入到位。

> 🔑 **可复用的判据**：判断「某库是否在首屏」**只看 `dist/index.html` 的 `script` / `modulepreload` 标签**，
> **不能看入口 chunk 里有没有该文件名**。曾据此误判 echarts 在首屏，白白规划了一轮改造。

**未做的部分**：`IntersectionObserver` 视口内初始化、`resize` 加 `requestAnimationFrame` 节流
—— 均属「有则更好」的优化，未发现实测瓶颈驱动，**回写至路线图正文作为待评估项**。

---

## P2-4 构建优化 —— ✅ 已完成

**核心结论**：**唯一真问题是 `manualChunks` 对象形式**。它把 element-plus 整包强制归入单一 chunk，
产出 **944 KB（gzip 296 KB）的巨石**，并经 `index.html` 的 `modulepreload` 进入**首屏关键路径**。
改为**函数形式**后交给 Rollup 按组件粒度自动切分。

**实测收益（干净构建对比）**：

| 指标 | 改造前 | 改造后 | 变化 |
|---|---|---|---|
| 首屏 JS（gzip） | 370 KB | **137 KB** | **−233 KB（−63%）** |
| 首屏 preload 数量 | 3（entry+vendor+EP） | 2（entry+vendor） | EP 移出关键路径 |
| 全量 JS（gzip） | 915 KB | 901 KB | 基本持平（纯加载时机优化） |
| 最大单 chunk | 944 KB | 247 KB | 巨石消除 |

**改动文件**：`frontend/vite.config.js` —— `manualChunks` 由对象形式改函数形式，
只归组 `vendor`(vue 生态) 与 `echarts`，**element-plus 交回 Rollup 自动切分**。
提交 `0a42ac3`。

**逐项判定（roadmap 原 5 方向）**：
1. `rollup-plugin-visualizer` —— **未采纳**。本次用「构建产物 + `index.html` preload 分析」即可定位瓶颈，无需引入依赖。
2. Element Plus 按需加载 —— **已达标且发现真问题**。`unplugin-vue-components` + `ElementPlusResolver` 本身正常
   （CSS 已按组件切分），**但被 `manualChunks` 对象形式覆盖**。
3. 图标库 tree-shake —— **已达标（无需改动）**。全仓 30 处均为具名导入，无 `import * as`。
4. `vite-plugin-compression` 预压缩 —— **不采纳，登记为独立任务**。⚠️
   本项目链路为「浏览器 → nginx(`proxy_pass`) → Node/Express」，**两端都不读磁盘 `.gz`**：
   - `deploy/nginx-synology.conf:92` 只有动态 `gzip on`，**无 `gzip_static on`**；且该 location 是 `proxy_pass` 转发，**根本不 serve 静态文件**；
   - `backend/app.js:14` 用 `compression@1.8.1` 做**纯动态压缩**（源码零 `.gz` 引用）。

   ⇒ 预压缩产物在本项目**不会影响任何一次传输**，加进来只是磁盘死重量。
   若将来要启用，需**后端 + 运维协同**：nginx 加 `gzip_static on` 且改为直接 serve 静态目录，
   或 Express 静态层接入 precompressed 中间件。
5. `vite-plugin-pwa` 离线缓存 —— **不采纳**。内部 CRM 收益低，且 Service Worker 缓存失效会造成
   「改了没生效」的排障困难。

---

*本归档与 `docs/frontend-optimization-roadmap-v2.md` 配套使用。路线图正文为待办清单，本文件为已完成历史。*
