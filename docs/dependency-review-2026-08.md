# 依赖安全评审（2026-08-21）

> 触发来源：2026-08-18 全项目审计的低危遗留项「依赖版本评估」。
> 执行结果：前后端 `npm audit` 均已归零，4 项已处置，3 项留待规划。

## 1. 本次已处置

### 后端（audit 7 → 0）

| 依赖 | 原版本 | 处置 | 说明 |
|---|---|---|---|
| `ip-address`（经 express-rate-limit） | 10.2.0 | audit fix 更新 | SSRF 解析绕过（3 个 advisory，high） |
| `js-yaml`（经 @apidevtools / eslint） | 4.3.0 | audit fix 更新 | !!omap 二次方 CPU 消耗（CVE-2026-59870，high） |
| `uuid`（经 node-cron） | 8.3.2 | **升级 node-cron 3 → 4** | buffer 边界检查缺失（moderate）；node-cron 4 与现有 `cron.schedule` 用法 API 兼容，104/1024 测试全绿 |
| `file-type` | 16.5.4 | **升级 16 → 22** | ASF 解析死循环（moderate）；22 为 ESM-only，`routes/upload.js` 改为动态 `import()` 加载（`fileTypeFromBuffer`），上传 magic bytes 校验不受影响 |

### 前端（audit 3 → 0）

| 依赖 | 原版本 | 处置 | 说明 |
|---|---|---|---|
| `postcss`（经 vite） | ≤8.5.22 | package.json `overrides: ^8.5.23` | sourceMappingURL 路径穿越读取 .map（high）；npm 解析器因插件冲突无法自动修复 |
| `@vitejs/plugin-vue` | 5.2.4 | **升级 → 6.0.8** | 根因修复：vite 7 与 plugin-vue 5 peer 冲突（此前锁文件靠 legacy-peer-deps 生成），升级后依赖树可正常解析 |
| `dompurify` | ≤3.4.12 | audit fix 补丁 | **XSS 绕过（CUSTOM_ELEMENT_HANDLING / IN_PLACE hook）——前端 v-safe-html 实际在用，属真实暴露面** |
| `brace-expansion`（传递依赖） | 2.x | audit fix 更新 | glob 展开 DoS（high） |

验证：后端 104 suite / 1024 测试全绿；前端 build ✓ + 44 测试全绿。

## 2. 留待规划（需独立排期，不建议仓促迁移）

| 依赖 | 现状 | 建议 |
|---|---|---|
| `express` 4.22 | 已进维护模式（安全补丁仍跟进） | 规划 Express 5 迁移：路由通配符语法、`req.query` getter、异步错误处理差异需逐项回归 |
| `jsonwebtoken` 9.0.3 | 维护模式 | 评估迁移 `jose`：涉及 auth 中间件、refresh 流程与全部测试夹具的 token 生成，约 1-2 天工作量 |
| `svg-captcha` 1.4.0 | 2020 年后未维护，4 字符 OCR 易破 | 评估维护中替代品（如 `@aftersim/svg-captcha` fork），或升级为 6 位 + 干扰线更强的生成方案 |
| `xlsx` 0.20.3（CDN tarball） | npm 官方渠道冻结于 0.18.5（含 CVE）；当前 pin 的 0.20.3 为修复版 | 保持 pin 并监控上游；涉及导出/导入的 module 已隔离（contractExportService 等），替换成本可控 |

## 3. 备注

- 本仓库 npm 源为 npmmirror（中国镜像），其 audit 端点未实现 —— 执行审计需显式 `--registry=https://registry.npmjs.org`。
- 后端已有 `overrides: tar >= 7.5.19` 先例，本次前端新增 `overrides: postcss` 沿用同一模式。
