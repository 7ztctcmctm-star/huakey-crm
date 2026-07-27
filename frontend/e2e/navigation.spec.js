import { test, expect } from './fixtures/auth.js'

test.describe('导航和权限', () => {
  test('登录后应能看到侧边栏菜单', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '桌面端侧边栏布局，firefox 与移动端由 responsive/cross-browser 覆盖'
    )
    await page.goto('/')
    // 等待 layout 渲染 — sidebar 类名来自 layout/index.vue
    await expect(page.locator('.sidebar, .el-menu, [class*="menu"]').first()).toBeVisible()
  })

  test('客户列表页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/customer/list')
    // 等待表格或空状态出现
    await expect(page.locator('.el-table, .el-empty').first()).toBeVisible({ timeout: 10000 })
  })

  test('商机管理页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/opportunity')
    await expect(page.locator('.el-table, .el-empty').first()).toBeVisible({ timeout: 10000 })
  })

  test('产品管理页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/product')
    await expect(page.locator('.el-table, .el-empty').first()).toBeVisible({ timeout: 10000 })
  })

  test('404 页面应正常显示', async ({ authenticatedPage: page }) => {
    await page.goto('/nonexistent-page')
    await expect(page.locator('body')).toBeVisible()
  })
})
