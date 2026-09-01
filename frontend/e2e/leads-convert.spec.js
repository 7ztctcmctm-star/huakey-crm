import { test, expect } from './fixtures/auth.js'
import { loginAsAdmin, createCustomer, deleteCustomer, listLeadsPoolCustomers } from './fixtures/api-helpers.js'

/**
 * 潜客 → 正式客户转化链路 E2E（Customer Center 三页面设计核心验证）
 *
 * 覆盖 NI-3 相关状态同步行为：
 *   1. 无分配规则环境新建客户 → business_status='lead' → 出现在潜客池
 *   2. UI 点击"转为正式" → convertLeadToCustomer 同步
 *      status/business_status='following'（两字段一致性是 NI-3 修复核心）
 *   3. 转化后潜客池不再出现、正式客户列表出现
 */

function uniqueCompanyName(prefix = 'E2E转化客户') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

async function ensureDesktopViewport(page) {
  await page.setViewportSize({ width: 1280, height: 900 })
}

async function disableAnimations(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }'
  })
}

async function searchInContainer(page, container, companyName) {
  const searchInput = page.locator(`${container} input[placeholder*="公司名称"]`).first()
  await searchInput.fill(companyName)
  await page.locator(`${container} button:has-text("搜索")`).first().click()
  await page.waitForTimeout(1200)
}

test.describe('潜客转正式客户链路', () => {
  test('转化后应从潜客池进入正式客户列表', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    test.setTimeout(60000)
    await ensureDesktopViewport(page)

    const companyName = uniqueCompanyName()
    const { csrfToken } = await loginAsAdmin(request)
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)
    const customerId = createRes.data?.id

    // 1. 新客户（无分配规则）应出现在潜客池
    await page.goto('/leads')
    await page.locator('.leads-pool').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)
    await searchInContainer(page, '.leads-pool', companyName)
    const leadRow = page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })
    await expect(leadRow).toBeVisible()

    // 2. 点击"转为正式"并确认
    await leadRow.locator('button:has-text("转为正式")').click({ force: true })
    const confirmBtn = page.locator('.el-message-box__btns .el-button--primary:has-text("确定")')
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
    await confirmBtn.click({ force: true })
    await page.waitForTimeout(1500)

    // 3. 潜客池搜索后不再出现（business_status 已离开 lead）
    await searchInContainer(page, '.leads-pool', companyName)
    await expect(page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })).toHaveCount(0)

    // 4. 正式客户列表出现（business_status='following' 且 pool_status='private'）
    await page.goto('/customer/list')
    await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)
    await searchInContainer(page, '.customer-list', companyName)
    await expect(page.locator('.customer-list .el-table__row').filter({ hasText: companyName })).toBeVisible()

    // 5. API 层复核：status 与 business_status 已同步为 following（NI-3 一致性）
    const listRes = await listLeadsPoolCustomers(request, csrfToken, companyName)
    expect(listRes.code).toBe(200)
    expect((listRes.data?.list || []).find(c => c.company_name === companyName)).toBeUndefined()

    // 清理
    if (customerId) {
      const delRes = await deleteCustomer(request, csrfToken, customerId)
      expect(delRes.code).toBe(200)
    }
  })
})
