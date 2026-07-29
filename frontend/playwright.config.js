import { defineConfig, devices } from '@playwright/test'

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
    timeout: 120000,
    env: {
      SKIP_CAPTCHA: 'true',
      DB_NAME: 'huakey_crm_test',
      DB_USER: 'root',
      DB_PASSWORD: 'test_root_pass',
      REDIS_ENABLED: 'false',
      ENABLE_SWAGGER: 'false'
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
