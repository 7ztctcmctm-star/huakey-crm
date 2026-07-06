<!--
  Phase 8: P2 运维/CI 补齐 — 详细 Prompt（函数级）
  生成日期: 2026-06-30
  基准: Phase 7 全部完成, IMPLEMENTATION_PLAN 94/94
  待办: 4 项运维增强任务，总计 6 小时
-->

# Phase 8 — P2 运维/CI 补齐

---

## 任务 A: Dependabot 补齐 GitHub Actions (15min)

### 背景
`.github/dependabot.yml` 已覆盖 npm（frontend + backend）和 Docker，但缺 GitHub Actions 工作流的版本更新。CI 工作流中的 `actions/*` 如过期会导致安全警告。

### A1. 补充 ecosystem (10min)
在 `dependabot.yml` 末尾追加：

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Shanghai"
    labels:
      - "dependencies"
      - "ci"

### A2. 验收
- `dependabot.yml` 包含 4 个 update 条目（npm x2 + docker + github-actions）
- GitHub Actions 的 `uses: actions/checkout@v3` 类引用能被 Dependabot 追踪

---

## 任务 B: Trivy Docker 镜像扫描 (1h)

### 背景
容器镜像和基础镜像可能携带已知 CVE。在 PR 合入前扫描可阻止高危漏洞进入生产。

### B1. 创建 GitHub Actions 工作流 (30min)
新建 `.github/workflows/trivy-scan.yml`：

```yaml
name: Trivy Security Scan

on:
  push:
    branches: [ main ]
    paths:
      - "backend/Dockerfile"
      - "Dockerfile.synology"
      - "backend/package*.json"
      - "frontend/package*.json"
  pull_request:
    branches: [ main ]
  schedule:
    - cron: "0 2 * * 1"  # 每周一凌晨 2 点 (UTC)
  workflow_dispatch:

jobs:
  scan-images:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        dockerfile: ["backend/Dockerfile", "Dockerfile.synology"]
    steps:
      - uses: actions/checkout@v4

      - name: Build image for scanning
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          load: true
          tags: crm-scan:${{ matrix.dockerfile }}

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: "crm-scan:${{ matrix.dockerfile }}"
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "CRITICAL,HIGH"
          exit-code: "1"

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: "trivy-results.sarif"

  scan-filesystem:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy on repo filesystem
        uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: "fs"
          scan-ref: "."
          format: "sarif"
          output: "trivy-fs-results.sarif"
          severity: "CRITICAL,HIGH"
          exit-code: "0"  # 仅报告，不阻断（node_modules 误报较多）

      - name: Upload filesystem scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: "trivy-fs-results.sarif"
```

### B2. 验收
- `trivy-scan.yml` 存在于 `.github/workflows/`
- `scan-images` job 扫描两个 Dockerfile（backend + synology）
- `scan-filesystem` job 扫描仓库文件系统（非阻断）
- SARIF 结果上传到 GitHub Security → Code Scanning 面板

---

## 任务 C: 跨浏览器/移动端响应式测试 (2h)

### 背景
当前 Playwright 仅测试 Chromium（桌面）和 Pixel 5（移动 Chrome），缺少 Firefox、WebKit（桌面 Safari），以及真实 iPhone 手机视口。前端在非 Chromium 内核上可能存在布局/JS 兼容性问题。

### C1. 扩展 playwright.config.js (15min)
在 `frontend/playwright.config.js` 的 `projects` 数组中追加：

```javascript
// 追加到现有 projects 数组
{
  name: "firefox",
  use: { browserName: "firefox" },
},
{
  name: "webkit",
  use: { browserName: "webkit" },
},
{
  name: "iPhone 12 Pro",
  use: { ...devices["iPhone 12 Pro"] },
},
```

### C2. 创建跨浏览器兼容性测试 (45min)
新建 `frontend/e2e/cross-browser.spec.js`：

- `it("login page renders on all browsers")`：验证登录表单在 4 种浏览器下均可见且无布局溢出
- `it("customer list renders without horizontal scroll")`：验证客户列表页在 375px（iPhone）和 1920px 宽度下均无横向滚动条
- `it("sidebar collapses on mobile")`：验证移动端侧边栏正确折叠为汉堡菜单
- `it("dashboard cards wrap on narrow viewport")`：验证仪表盘卡片在小屏幕下正确换行

每个测试用 `test.use({ ...devices["xxx"] })` 或 `page.setViewportSize()` 动态切换。

### C3. 创建响应式布局快照测试 (30min)
新建 `frontend/e2e/responsive.spec.js`：

- `it("login page adapts at 375px / 768px / 1440px")`：三个断点截图对比
- `it("customer table switches to card layout on mobile")`：验证 < 768px 时 el-table 是否切换为卡片/列表模式
- `it("form dialogs fit within mobile viewport")`：验证 el-dialog 在小屏幕上不超出视口

### C4. CI 集成 (15min)
在 `.github/workflows/ci.yml` 中新增 `cross-browser-test` job：

- **触发条件**: `schedule`（每周六凌晨）或 `workflow_dispatch`，不在 PR push 上执行（节省 Actions 分钟数）
- **矩阵**: `browser: [chromium, firefox, webkit, "iPhone 12 Pro"]`
- **步骤**: checkout → setup node → npm ci → npx playwright install → npx playwright test --project="${{ matrix.browser }}"

### C5. 验收
- `playwright.config.js` 有 6 个 project（chromium / Mobile Chrome / firefox / webkit / iPhone 12 Pro）
- `cross-browser.spec.js` 4 个测试全部通过
- `responsive.spec.js` 3 个测试全部通过
- CI `cross-browser-test` job 在手动触发时能正常运行

---

## 任务 D: 迁移脚本 up/down 测试 (3h)

### 背景
当前 65 个 migration SQL 文件中，只有 8 个有对应的 `_down.sql`，57 个缺失回滚脚本。一旦需要回退部署，无法安全撤销 schema 变更。`backend/tests/db/migration-roundtrip.test.js` 已有骨架但无实际测试逻辑。

### D1. 审计：识别缺失的 down 脚本 (15min)
在 `backend/tests/db/migration-roundtrip.test.js` 中添加审计函数 `auditDownScripts()`：

- 扫描 `database/migrations/` 目录
- 列出所有 up 脚本和对应的 down 脚本
- 打印审计报告：total / withDown / missing[]

测试用例：`it("all schema-modifying migrations have a down script")` — 标记为 skip 但打印审计结果。

### D2. 创建核心迁移的 down 脚本 (1.5h)
优先为 **schema 修改类** 迁移创建 down 脚本（跳过纯索引/纯种子数据的迁移）：

**必须覆盖（10 个关键迁移）**：

| 迁移 | 操作 | down 内容 |
|------|------|-----------|
| 001_init_baseline | CREATE TABLE x N | DROP TABLE 所有初始化表 |
| 003_add_customer_pool_columns | ALTER TABLE ADD | ALTER TABLE DROP COLUMN |
| 007_soft_delete_contact | ALTER TABLE ADD | ALTER TABLE DROP COLUMN |
| 009_soft_delete_business_tables | ALTER TABLE ADD | ALTER TABLE DROP COLUMN |
| 013_permission_system | CREATE TABLE | DROP TABLE |
| 021_follow_plan_and_pool_type | ALTER TABLE ADD/MODIFY | ALTER TABLE DROP COLUMN/MODIFY |
| 022_phase3_supplier_purchase | CREATE TABLE | DROP TABLE |
| 023_phase4_analysis_ai | CREATE TABLE | DROP TABLE |
| 030_notification | CREATE TABLE | DROP TABLE |
| 066_create_purchase_request | CREATE TABLE | DROP TABLE（已有 down）|

000 和 002 如已有部分 down 脚本，检查完整性后仅补缺失项。

其余 47 个迁移标记为 "low-priority down-missing"，在测试报告中列出但不阻断 CI。

### D3. 实现 roundtrip 测试逻辑 (45min)
重写 `backend/tests/db/migration-roundtrip.test.js` 的核心测试，对以下 3 个有 down 的迁移执行完整 roundtrip：

- `066_create_purchase_request`
- `067_create_purchase_comparison`
- `068_add_notification_link_url`

流程：记录基线 schema → 执行 up → 验证表/列存在 → 执行 down → 验证表/列已删除 → 重新 up → 验证恢复一致。

使用 CI MySQL（`docker-compose.ci.yml`, DB_PORT=3307, DB_NAME=huakey_crm_test）。

### D4. 创建独立 runner 脚本 (15min)
新建 `backend/tests/run-migration-test.js`：启动 docker-compose.ci.yml → 等待 MySQL healthy → 运行 migration-roundtrip.test.js → 输出报告。

### D5. 验收
- `auditDownScripts()` 输出完整审计：总迁移数 / 有 down / 缺失列表
- 10 个核心迁移都有 down 脚本
- `migration-roundtrip.test.js` 对 3 个测试迁移执行 up→down→up 循环全部通过
- `run-migration-test.js` 可一键运行完整测试

---

## 执行建议

| 顺序 | 任务 | 预计 | 依赖 | 可并行 |
|------|------|------|------|--------|
| 1 | A: Dependabot 补齐 | 15min | 无 | ✓ |
| 2 | B: Trivy 镜像扫描 | 1h | 无 | ✓ |
| 3 | C: 跨浏览器/响应式测试 | 2h | 无 | ✓ |
| 4 | D: 迁移 up/down 测试 | 3h | 无 | ✓ |

**并行策略**: 4 项任务无相互依赖，可同时启动。

**总计**: ~6 小时，建议 1 天内完成。
