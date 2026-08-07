import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------
// 加载 .env.test（E2E 测试账号配置），避免在测试代码中硬编码账号密码
// 查找顺序：frontend/../.env.test（仓库根目录）
// 仅设置尚未存在的 env 变量，不覆盖 CI 已显式注入的值
// ------------------------------------------------------------
function loadEnvTest() {
  const envPath = resolve(__dirname, '..', '.env.test')
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
  timeout: 30000,
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
