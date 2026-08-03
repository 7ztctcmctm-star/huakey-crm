import { test, expect } from '@playwright/test'

/**
 * 读取 E2E 管理员账号（从环境变量，不硬编码）
 * 优先级：E2E_ADMIN_USER / E2E_ADMIN_PASSWORD（Demo 账号体系）
 * 回退：E2E_USERNAME / E2E_PASSWORD（兼容旧变量名 / CI 注入）
 */
function getTestUser() {
  const username = process.env.E2E_ADMIN_USER || process.env.E2E_USERNAME
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD
  if (!username || !password) {
    throw new Error(
      'E2E 测试账号未配置：缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD。\n' +
      '请在仓库根目录创建 .env.test（可从 .env.test.example 复制），\n' +
      '或先执行 `cd backend && npm run seed:demo` 创建 Demo 账号。\n' +
      '详见 docs/DEMO_DATA_GUIDE.md'
    )
  }
  return { username, password }
}

const TEST_USER = getTestUser()

test.describe('登录页面', () => {
  test('应显示登录表单', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('.login-container')).toBeVisible()
    await expect(page.locator('input[placeholder*="用户名"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="密码"]')).toBeVisible()
  })

  test('应显示系统标题', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('.title')).toContainText('铧旗CRM')
  })

  test('未登录访问首页应跳转到登录页', async ({ page }) => {
    await page.goto('/')
    // 路由守卫会重定向到 /login
    await expect(page).toHaveURL(/login/)
  })

  test('空表单提交应显示校验错误', async ({ page }) => {
    await page.goto('/login')
    await page.click('.login-button')
    // el-form 校验应阻止提交
    await expect(page.locator('.el-form-item__error').first()).toBeVisible()
  })

  test('正确账号密码登录后应跳转首页并设置 token / csrf-token cookie', async ({ page }) => {
    await page.goto('/login')

    await page.locator('input[placeholder*="用户名"]').fill(TEST_USER.username)
    await page.locator('input[placeholder*="密码"]').fill(TEST_USER.password)
    // 测试环境后端 SKIP_CAPTCHA=true，任意 4 位验证码均可
    const captchaInput = page.getByPlaceholder('请输入验证码')
    await expect(captchaInput).toBeVisible()
    await captchaInput.fill('dev1')

    await page.click('.login-button')

    // 登录成功后前端跳转至 /dashboard（/ 会重定向到 /dashboard）
    await page.waitForURL('/dashboard', { timeout: 10000 })
    await expect(page).toHaveURL('/dashboard')

    // 验证 httpOnly token cookie 与 CSRF cookie 已设置
    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name === 'token' && c.httpOnly)).toBe(true)
    expect(cookies.some((c) => c.name === 'csrf-token')).toBe(true)
  })
})
