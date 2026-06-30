import { test, expect } from '@playwright/test'

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
})
