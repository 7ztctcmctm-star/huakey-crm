import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------
// 加载 .env.test（E2E 测试账号配置），避免在测试代码中硬编码账号密码
// 查找顺序：frontend/../.env.test（本机，不入库）→ .env.test.example（模板回退）
// 仅设置尚未存在的 env 变量，不覆盖 CI 已显式注入的值
// ------------------------------------------------------------
function loadEnvTest() {
  const localPath = resolve(__dirname, '..', '.env.test')
  const examplePath = resolve(__dirname, '..', '.env.test.example')
  const envPath = existsSync(localPath) ? localPath : examplePath
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!key) continue
    // 不覆盖已存在的环境变量（CI 优先级更高）
    if (process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}
loadEnvTest()

export default defineConfig({
  testDir: './e2e',
  // ------------------------------------------------------------
  // CI 并行度与超时（2026-09-14 修复间歇性 flaky）
  // ------------------------------------------------------------
  // 根因：CI 里 Playwright 默认按 CPU 派生 worker（GitHub 4 vCPU → 2 workers），
  //   两个 spec 同时共享「同一个后端 + 同一个 MySQL 库 + 同一个 Vite dev server」，
  //   造成两类问题：
  //     1) 数据串扰：A 用例断言列表非空时，B 用例正在增删同一批数据
  //        （前科：50f9b4c「商机阶段用例 flaky —— 根因是借用了其它并行用例的临时客户」）
  //     2) 资源竞争：并发请求拖慢每步响应，用例 30s 预算被前置步骤吃满，
  //        最后一步 action 撞上 "Test timeout of 30000ms exceeded"
  //   表现：随机用例超时，不同 run 挂不同用例
  //        （run 119 挂 navigation:16，run 124 挂 approval-flow:130），
  //        且失败 run 总时长 1.5m > 通过 run 1.0-1.2m。
  // 处置：CI 强制单 worker 消除串扰；timeout 放宽到 45s 给慢环境余量。
  //   本机不设 CI 时保持 Playwright 默认并行与 30s，不影响开发体验。
  workers: process.env.CI ? 1 : undefined,
  timeout: process.env.CI ? 45000 : 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/start-e2e-server.mjs',
    port: 5173,
    reuseExistingServer: true,
    timeout: 300000,
    env: {
      SKIP_CAPTCHA: 'true',
      DB_NAME: 'huakey_crm_test',
      DB_HOST: process.env.DB_HOST || '127.0.0.1',
      DB_PORT: process.env.DB_PORT || '3306',
      DB_USER: process.env.DB_USER || 'root',
      DB_PASSWORD: process.env.DB_PASSWORD || 'test_root_pass',
      REDIS_ENABLED: 'false',
      ENABLE_SWAGGER: 'false',
      SKIP_DB_SETUP: process.env.SKIP_DB_SETUP || 'false'
    }
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    // --- 跨浏览器测试 (Phase 8) ---
    // CI 环境可取消注释以运行完整跨浏览器矩阵；本地默认仅 chromium 以加快速度
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
    {
      name: 'iPhone 12 Pro',
      use: { ...devices['iPhone 12 Pro'] },
    },
  ]
})
