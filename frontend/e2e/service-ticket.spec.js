import { test, expect } from './fixtures/auth.js'

/**
 * R-14 回归护栏：服务工单页面可访问、列表容器渲染、工单视图切换可用。
 * 关联客户为只读展示（服务层仅 SELECT crm_customer），本 spec 不做写操作。
 */
test.describe('服务工单', () => {
  const isMobileOrFirefox = (testInfo) =>
    testInfo.project.name.includes('iPhone') ||
    testInfo.project.name.includes('Mobile Chrome') ||
    testInfo.project.name === 'firefox'

  test('页面可访问并渲染工单列表容器', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '复杂表格在桌面浏览器覆盖')

    await page.goto('/service', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    await expect(page.getByRole('heading', { name: '服务工单' })).toBeVisible({ timeout: 10000 })
    // 有数据渲染表格 / 无数据渲染空态，二者至少其一
    await expect(page.locator('.el-table, .empty-state').first()).toBeVisible({ timeout: 10000 })
  })

  test('工单视图切换（全部 / 我的 / 今日 / 超时）可用', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '复杂表格在桌面浏览器覆盖')

    await page.goto('/service', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    const mine = page.locator('.el-radio-button', { hasText: '我的工单' })
    await mine.click()
    await expect(mine).toHaveClass(/is-active/, { timeout: 5000 })
  })
})
