# 前端优化路线图 V2 · 待办清单

> 生成时间：2026-09-11 ｜ 重构时间：2026-09-14
> 范围：`frontend/src`
> 基线状态：Apple 设计系统已落地、色值 token 化完成、错误日志收敛、响应式基础框架已搭
> 目标：从「能用」到「好用 + 好看 + 快」
>
> 📦 **已完成条目已移出本文档**，归档于
> [`docs/frontend-optimization-completed-archive.md`](frontend-optimization-completed-archive.md)
> （含 P0-1~P0-4、P1-4 防抖、P2-1 核查结论、P2-4 构建优化的原文与实测数据）。
> 本文档**只保留未完成待办**，按优先级排列。

---

## 一、当前状态速览

**已到位（不重复规划）**：

- **架构层**：路由懒加载、ECharts 按需引入（`echarts/core` + 具名注册）、错误边界、
  统一请求封装、CSRF / httpOnly Cookie、Web Vitals 监控
- **视觉层**：Apple 风格主题系统完整、组件级样式统一、`EmptyState` 空状态插画化
- **工程层**：Vite 构建、Vitest 单测、Playwright E2E
- **构建产物**：首屏 JS **137 KB gzip**（目标 < 250 KB，**已达标**）
- **状态管理**：`StateWrapper` 四态已覆盖 **49 个视图**

**已知缺口**：

- ⚠️ **前端没有 ESLint**（实测 2026-09-11：无依赖、无配置、无 lint 脚本；根 `.lintstagedrc.json` 只覆盖 `backend`）。
  该缺口由 `frontend/src/tests/unit/views/templateBindings.test.js`（模板绑定守卫，全量编译 views 下
  `<script setup>` SFC，检出「模板引用了未声明标识符」）**部分补位**。
  > 本项目文档曾多次与代码不符（见 `AGENTS.md` §14.1），任何结论请以实测为准。

---

## 二、P1 · 体验提升（近期做）

### P1-1 列表页统一工具栏布局规范 ⬅ **✅ 已完成（2026-09-14）**

**原现状**：各列表页的工具栏（搜索 + 筛选 + 操作按钮）布局不统一：
- 有的用 `el-card` 包搜索表单（客户列表）
- 有的直接放按钮（部分页面）
- 有的筛选条件展开/收起逻辑缺失
- 操作按钮顺序不统一（新增在左 vs 在右）

**交付物**：

| 项 | 文件 | 说明 |
|---|---|---|
| 通用组件 | `frontend/src/components/common/PageToolbar.vue` | 左侧筛选/搜索（default 插槽 + `#extra` 折叠区）、右侧主操作（`#actions`）、`#filter-actions` 承载查询/重置 |
| 样式归一化 | `frontend/src/styles/apple.css` `.page-toolbar` 区块 | 表单项 `margin-bottom: 0`、控件默认宽度、按钮 `+` 选择器归零、移动端纵向堆叠 |
| 单测 | `frontend/src/tests/unit/components/PageToolbar.test.js` | 8 例：无 `#extra` 不渲染折叠按钮（防死按钮）、展开/收起文案切换、`#actions`/`#filter-actions` 渲染、`defaultExpanded` 两态 |

**验收对照（原方案 4 条）**：
1. ✅ 抽离 `PageToolbar` 通用组件，左侧筛选/搜索、右侧主操作
2. ✅ 主操作统一放最右侧（`.page-toolbar__actions { margin-left: auto }`，`el-button--primary` 由各页自行声明）
3. ✅ 筛选项超过 `max-visible`（默认 3）自动折叠，带「展开/收起」+ 箭头旋转
4. ✅ 间距/圆角/高度统一由 `apple.css` 的 `.page-toolbar` 收口

**接入页面（22 个）**：

| 批次 | 页面 |
|---|---|
| 知识库 4 | `knowledge/products`、`knowledge/faqs`、`knowledge/scripts`、`knowledge/documents` |
| 采购 3 | `purchase/list`、`purchase/RequestList`、`purchase/ComparisonList` |
| 主链路 3 | `contract/list`、`opportunity/list`、`quotation/list` |
| 客户/线索/公海 3 | `customer/components/CustomerFilter`、`leads/List`、`pool/List` |
| 其他 9 | `supplier/list`、`service/index`、`social/index`、`system/log`、`inventory/movements`、`hr/employees`、`product/index`、`payment/reconciliation`（客户/供应商双页签） |

**实施要点**：
- **行为零变更**：只收拢布局，未改请求参数、字段、权限码、事件名。`handleSearch`/`resetSearch` 仍由各页自行定义。
- **`native-type="submit"` 保留**：表单 `@submit.prevent` 仍在，回车提交行为不变。
- **折叠判定是「能力 + 内容」双条件**：`collapsible` 且**确实提供了 `#extra` 槽**才渲染「展开」按钮 ——
  避免出现「点了没反应的死按钮」（沿用 `StateWrapper` 死按钮缺陷的教训）。
- **`#filter-actions` 与筛选项同行**：查询/重置属于筛选区尾部动作，不放到右侧操作区，符合「右侧只放主操作」规范。

**验证**：
- 前端全量单测 **16 files / 72 tests passed**（新增 `PageToolbar.test.js` 8 例）
- 构建 `npx vite build --emptyOutDir` → **✓ built in 39.21s**，无 chunk 体积警告
- **首屏 JS 139.3 KB gzip**（entry 83.2 + vendor 59.5），与 P2-4 基线 137 KB 持平
  ⇒ 证明本次为**纯结构重构，零性能回归**；`index.html` 仍只 preload `entry + vendor` 两个 chunk

---

### P1-2 详情页抽屉/弹窗加载态

**现状**：点击客户详情/商机详情等抽屉时，数据加载期间抽屉是空的，用户不知道是在加载还是数据为空。

**优化方案**：
- 抽屉打开时立即显示骨架屏（可用 `el-skeleton` 或自定义骨架）
- 数据加载完成后再渲染内容
- 加载失败显示错误态 + 重试按钮

**涉及文件**：客户详情、商机详情、合同详情、报价详情等。

**当前进度**：⚠️ 仅 `views/opportunity/list.vue` 有单点 `drawerLoading`，**未成规范**。

---

### P1-3 操作反馈微交互

**现状**：
- 表格行点击/操作后，没有即时视觉反馈（如行高亮闪烁）
- 删除确认后，行消失是瞬变的，没有过渡
- 批量操作成功后，选中状态清除突兀

**优化方案**：
1. 操作成功时，对应行短暂高亮 `var(--color-accent-bg)` 后淡出
2. 删除行时添加高度塌陷 + 淡出过渡（`fade-slide` 动画已存在，可复用）
3. 批量操作后，工具栏收起动画

**投入**：中 — 需要封装表格行 transition 组件。

---

### P1-4 搜索体验优化（剩余部分）

**已完成**：输入 debounce（`SearchOverlay.vue:115-116`，500ms）—— 见归档 §P1-4。

**剩余待办**：
1. 添加 `⌘K` / `Ctrl+K` 快捷键唤起（带角标提示）
2. 搜索结果按类型分组（客户 / 商机 / 合同 / 联系人）
3. 展示最近 5 条搜索历史

---

### P1-5 移动端体验补全

**现状**：响应式框架已搭，但还有遗留问题：
- M-07：表格横向滚动待实测验证
- M-08：移动端抽屉无滑动关闭手势
- M-09：真实设备渲染未确认
- 列表页操作列在移动端太挤（3-4 个按钮挤在 80px 宽度内）
- 表单 label 在移动端过长会换行

**优化方案**：
1. 移动端操作列改为「更多」图标 + 下拉菜单
2. 表单 label 顶置（`label-position="top"`）而非左对齐
3. 添加 `touchstart` 手势关闭抽屉
4. 真机走查（iOS Safari + Android Chrome）

---

## 三、P2 · 性能与工程（中期做）

### P2-1 ECharts 懒渲染增强（剩余部分）

**已核查结论**：ECharts **已是路由级懒加载**，「首屏加载」疑虑被证伪 —— 见归档 §P2-1。
剩余的**视口优化**为「有则更好」，未发现实测瓶颈驱动：

1. 用 `IntersectionObserver` 实现视口内才初始化图表（Dashboard 下方的图表延迟初始化）
2. `resize` 事件加 `requestAnimationFrame` 节流
3. 评估图表组件改 `defineAsyncComponent` 进一步拆分 chunk

> **前置条件**：先做性能实测，确认 Dashboard 首帧确有卡顿再实施。

---

### P2-2 接口请求缓存与去重

**现状**：
- 同一页面多个组件可能请求相同的接口（如 Dashboard 同时请求 overview + quickStats + followStats）
- 快速切换 tab 时，前一个 tab 的请求不会取消
- 没有请求级别的缓存，返回上一页会重新请求

**优化方案**：
1. GET 请求增加短时内存缓存（TTL 30s，页面级）
2. 相同 URL + 参数的并发请求去重（返回同一个 Promise）
3. 组件卸载时取消未完成的请求（`AbortController`）

**投入**：中 — 改造 `utils/request.js`，加一层 cache/abort 封装。

**当前进度**：⚠️ `api/*.js` + `utils/*.js` 中 `cancelToken` / `AbortController` / `dedupe` **零命中**，未启动。

---

### P2-3 虚拟滚动（长列表优化）

**现状**：客户列表、产品列表等可能有大量数据，虽然有分页，但单页 50/100 条时渲染仍有压力。

**优化方案**：
- 评估是否需要引入虚拟滚动（`el-table-v2` 或 `vue-virtual-scroller`）
- 优先级：产品列表（可能上千条）> 客户列表 > 其他
- **先做性能实测，确认瓶颈在渲染再上虚拟滚动**

---

## 四、P3 · 可访问性与打磨（长期做）

### P3-1 可访问性（a11y）基础

**现状**：基本没有考虑可访问性。全仓仅 2 个文件出现 `aria-label` / `role="dialog"`，属零散点缀。

**最低标准清单**：
1. 所有图片有 `alt` 属性
2. 所有图标按钮有 `aria-label`
3. 表单控件有关联的 `label`
4. 弹窗打开时焦点管理（焦点在弹窗内、ESC 关闭）
5. 颜色对比度检查（正文文本 ≥ 4.5:1）
6. 键盘导航可用（Tab 顺序合理）

**优先级项**：
- 颜色对比度：先用工具扫描 `apple.css` 中的文本/背景组合
- 弹窗焦点管理：Element Plus 原生支持，需确认是否被自定义样式破坏
- 图标按钮 `aria-label`：顶栏、操作列的纯图标按钮

---

### P3-2 深色模式

**现状**：只有浅色模式（全仓零 `prefers-color-scheme` / `dark-mode` / `html.dark`），
CSS 变量体系已搭好，扩展深色模式的基础很好。

**实现路径**：
1. `apple.css` 中添加 `[data-theme="dark"]` 选择器，覆盖变量值
2. 提供主题切换入口（用户设置中）
3. 遵循系统偏好（`prefers-color-scheme`）
4. ECharts 图表主题同步切换

**投入**：中高 — 主要是调色板设计和逐页面验证。

---

### P3-3 微交互打磨

- 按钮点击波纹效果（Apple 风格是「变暗 + 轻微缩放」，不是 Material 的波纹）
- 表单输入聚焦时的微妙动效（当前已有 focus ring，可再加 label 上浮效果）
- 页面切换过渡（当前有 `fade-slide`，但路由切换没有统一过渡）
- 数字变化动画（`AnimatedNumber` 已存在，确认覆盖率）

---

### P3-4 国际化（i18n）框架

**现状**：系统全中文硬编码，`frontend/src/i18n/` **目录不存在**。

**建议**：如果未来有多语言需求，尽早引入 `vue-i18n`，越晚改成本越高。
当前如果没有明确需求，可以**暂缓**，但**所有新增文案建议留好提取空间**（不要散落在模板中，集中管理）。

---

## 五、代码质量与可维护性

### Q-1 组件重复代码收敛

**发现**：
- 客户列表拆成了 `CustomerFilter` / `CustomerTable` / `CustomerPagination` 三个子组件（模式好）
- 但其他列表页（商机、合同、报价、供应商等）都是单文件大组件，模式不统一
- 筛选、表格、分页的模式在各页面重复

**建议**：提取通用列表页模式 — `useTable` 已存在，确认是否充分利用；筛选栏和分页栏可以进一步封装。

### Q-2 Composable 复用率

**发现**：已有 `useTable` / `useUser` / `useFormat` / `useECharts` 等 composables，但：
- `useTable` 是否被所有列表页使用？需确认
- 是否有重复的逻辑可以抽 composable

### Q-3 类型安全

**现状**：纯 JS，无 TypeScript。

**建议**：短期不上 TS（改造成本太高），但可以：
1. 关键 API 响应加 JSDoc 类型注释
2. 核心 composables 加 JSDoc
3. 为未来迁移 TS 留好路径（Vite 原生支持）

---

## 六、未验收项（需人工确认）

| 项 | 来源 | 说明 |
|---|---|---|
| 真实浏览器端到端走查 | `docs/crm-customer-overview-design.md` §八 第 8 项 | 文档标 ⏳ 未做（当时本机无浏览器环境）；核心业务域已收敛，建议上线前补一次全链路走查 |
| `pool:*` 路径/权限码改名 | `docs/crm-customer-overview-design.md` §八 第 9 项 | **刻意不做**：`router/index.js:77-78` 注释明示「改 path/权限码会波及已发通知链接与权限数据，属独立迁移」 |
| seed 中 `AUTO_INCREMENT` 硬编码清理 | `docs/outstanding-work-audit-2026-09-14.md` P3-1 | 剩余约 42 处，非阻塞 |
| 服务层 JSDoc 补全 | `docs/outstanding-work-audit-2026-09-14.md` P3-2 | 与 Q-3 重叠，可合并推进 |

---

## 七、验证指标

| 指标 | 当前 | 目标 | 测量方式 |
|------|-----------|------|---------|
| LCP（Dashboard） | ~2.5s（估） | < 2.0s | Web Vitals / Lighthouse |
| 骨架屏覆盖率 | **49 个视图** | 100% 适用列表页 | 代码统计 |
| 列表页首屏可交互时间 | ~1.8s（估） | < 1.2s | Lighthouse TTI |
| 首屏 JS 体积 | **139.3 KB gzip（2026-09-14 实测）** | < 250KB gzip | Bundle 分析 — **✅ 已达标** |
| a11y 对比度通过率 | 未测 | 100% 正文文本 | axe-core 扫描 |

---

*本清单为待办建议，实际实施前需按九步循环逐一评估影响范围与回滚方案。*
