# UI 全局清理报告

> 生成时间：2026-09-09
> 范围：`frontend/src`
> 构建状态：`npm run build` ✅ 通过（28.12s）

## 1. 已完成的清理项

### 1.1 主题与工具类
- `apple.css` 新增 `.font-medium` / `.font-semibold` / `.font-bold` 工具类。
- 已存在 `.text-accent` / `.text-success` / `.text-warning` / `.text-danger` 语义色工具类。

### 1.2 内联样式迁移（视图层）
以下文件中的 `style="color:#xxx"` / `:style="{ color: ... }"` 已迁移为语义 class：

- `views/payment/index.vue`：统计卡片色值、未回款/已回款条件色。
- `views/payment/reminders.vue`：距到期/逾期文字色。
- `views/payment/reconciliation.vue`：未付金额色、summary 成功/危险色。
- `views/hr/commission.vue`：佣金金额色、展开详情背景。
- `views/inventory/movements.vue`：出入库数量条件色。
- `views/social/index.vue`：收支方向条件色。
- `views/settings/api-platform.vue`：失败次数色、API 文档 method 色。
- `views/report/finance.vue`：未回款金额色。
- `views/scoring/rules.vue`：分数正负色。
- `views/approval/submitted.vue` / `pending.vue`：审批图标/分割线/历史样式。
- `views/email/settings.vue`：移除 `:header-cell-style="{ background: '#fafafa' }"` 硬编码表头。
- `views/knowledge/index.vue`：入口卡片背景与图标色改为语义变量。

### 1.3 Scoped CSS 迁移
以下文件中的 HEX 色值已迁移为 `var(--color-*)`：

- `views/service/index.vue`：FAQ 边框/背景/文字。
- `views/report/business.vue`：KPI 涨跌幅。
- `views/notification/index.vue`：未读圆点。
- `views/hr/org-chart.vue`：选中节点背景、头像背景。
- `views/report/custom.vue`：报表选中态。
- `views/survey/templates.vue` / `detail.vue`：NPS 推荐色。

### 1.4 冗余日志清理
- `views/customer/List.vue`：删除失败/列表加载失败场景移除冗余 `console.error`，保留 `ElMessage.error`。
- `views/opportunity/list.vue`：列表加载失败场景移除冗余 `console.error`。

### 1.5 已知无需处理
- `frontend/src` 内无 `console.log(...)` 或 `debugger;` 语句。
- 空 `catch` 块此前已修复。
- 核心视图操作列已收敛。
- 弹窗/抽屉 `scale` 动画、卡片圆角/阴影/悬停动效已落地。

## 2. 待后续处理的剩余项

### 2.1 图表/常量色板（已于 2026-09-10 全部 token 化）

> **状态更新**：本节原列为「待后续处理」，实际已于 2026-09-10 全部完成。色值统一经
> `utils/chartTheme.js` 的 `chartColors` / `chartPalette()` / `alpha()` 读取 `apple.css` CSS 变量，
> 不再出现硬编码 HEX。本节保留仅为追溯记录。

| 类型 | 文件 | 说明 | 状态 |
|------|------|------|------|
| 主题定义 | `styles/apple.css` | `--color-*` / `--chart-color-1~8` 变量定义，属正常 | 属正常 |
| 业务常量 | `constants/source.js` | 客户来源色板 | ✅ 已完成（HEX 计数 0） |
| 业务常量 | `composables/useLevel.js` | 客户等级色 | ✅ 已完成（HEX 计数 0） |
| 图表配置 | `views/analysis/index.vue` / `prediction.vue` | ECharts 阶段/异常/预测配色 | ✅ 已完成 |
| 图表配置 | `views/TeamDashboard.vue` | ECharts/Progress 配色 | ✅ 已完成 |
| 图表配置 | `views/competitor/index.vue` | ECharts 柱状图配色 | ✅ 已完成（原无 HEX） |
| 图表配置 | `views/report/index.vue` / `finance.vue` / `business.vue` | ECharts 折线/等级/趋势配色 | ✅ 已完成 |
| 图表配置 | `views/payment/analysis.vue` | ECharts 现金流/账龄配色 | ✅ 已完成 |
| 图表配置 | `views/survey/overview.vue` | ECharts NPS/CSAT 配色 | ✅ 已完成 |
| 图表配置 | `views/supplier/ranking.vue` | ECharts 排名配色 | ✅ 已完成 |
| 颜色预设 | `views/system/tags.vue` | 标签颜色预设 | ✅ 已完成 |
| 颜色预设 | `views/calendar/index.vue` | 日程颜色预设 | ✅ 已完成 |

`chartTheme.js` 接入文件共 9 个：`analysis/index.vue`、`calendar/index.vue`、
`supplier/ranking.vue`、`system/tags.vue`、`report/index.vue`、`report/business.vue`、
`TeamDashboard.vue`、`payment/analysis.vue`、`survey/overview.vue`。

### 2.2 `console.error` / `console.warn`（已于 2026-09-10 收敛）

> **状态更新**：原记录为「约 45 处」，实测为 **149 处**（47 个文件）。已全部收敛到统一出口。

新增 `utils/error.js`，提供 `reportError` / `reportWarn` 与 `setErrorReporter` 注入钩子；
46 个业务文件（排除 `src/tests/` 与 `error.js` 自身）的 `console.error` / `console.warn`
全部改走统一出口，`frontend/src` 内已无直接调用。

**关键决策：保留控制台输出，不在生产环境静默丢弃。**
项目目前没有任何错误上报服务（无 Sentry / 自建通道），此时若在生产静默，
等于直接砍掉线上排障能力，是可观测性的倒退。因此当前行为与改造前一致，
只是收拢为单一入口——**待接入上报服务后，只需修改 `error.js` 一处**，
无需再动 46 个调用点。

## 3. 建议的下一步（可选）

1. ~~**图表/色板 token 化**：将 ECharts 配置中的 HEX 配色统一映射到 `apple.css` 语义变量。~~ ✅ **已于 2026-09-10 完成**
2. ~~**业务常量 token 化**：`constants/source.js`、`composables/useLevel.js` 中的 HEX 色值映射为语义变量。~~ ✅ **已于 2026-09-10 完成**
3. **日志收敛**：将剩余业务 `catch` 块中的 `console.error` 收敛到 `ElMessage.error` 或统一错误上报通道。（**仍待处理**，约 45 处，见 §2.2）

## 4. 验证命令

```bash
cd frontend
npm run build
# 结果：exit 0，构建成功
```
