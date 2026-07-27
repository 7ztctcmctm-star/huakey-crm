import { test, expect } from '@playwright/test'

// 默认测试账号，可通过环境变量覆盖
const TEST_USER = {
  username: process.env.E2E_USERNAME || 'admin',
  password: process.env.E2E_PASSWORD || 'Admin@123'
}

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
