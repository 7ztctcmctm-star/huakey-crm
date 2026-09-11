import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  loginAsSales,
  createCustomer,
  deleteCustomer,
  listLeadsPoolCustomers,
  convertLeadToFormal,
  getCustomerDetail
} from './fixtures/api-helpers.js'

/**
 * 潜客 → 正式客户转化链路 E2E（Customer Center 三页面设计核心验证）
 *
 * 覆盖 NI-3 相关状态同步行为，并锁定 2026-09-11 确认的**按角色区分归属规则**：
 *   1. 无分配规则环境新建客户 → business_status='lead' → 出现在潜客池
 *   2. UI 点击"转为正式" → convertLeadToCustomer 同步 status/business_status='following'
 *      （两字段一致性是 NI-3 修复核心）
 *   3. 转化后潜客池不再出现
 *   4. **归属按角色分支**：
 *        · 本人转化（销售等非 manageAll）→ owner_id=操作人、pool_status='private'
 *          → 进入正式客户列表
 *        · 代转化（老板/管理员，manageAll）→ owner_id=NULL、pool_status='sea'
 *          → 置入公海，**不**进正式客户列表
 *      ⚠️ 该规则是产品决策（2026-09-11 委托人确认），不是缺陷。
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
  test('代转化（admin/manageAll）：离开潜客池并置入公海，不进正式客户列表', async ({
    authenticatedPage: page,
    request
  }, testInfo) => {
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

    // 2. 点击"转为正式"并确认（admin 登录 → 属「代转化」）
    await leadRow.locator('button:has-text("转为正式")').click({ force: true })
    const confirmBtn = page.locator('.el-message-box__btns .el-button--primary:has-text("确定")')
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
    await confirmBtn.click({ force: true })
    await page.waitForTimeout(1500)

    // 3. 潜客池搜索后不再出现（business_status 已离开 lead）
    await searchInContainer(page, '.leads-pool', companyName)
    await expect(page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })).toHaveCount(0)

    // 4. 【归属规则】admin 属 manageAll → 代转化 → 客户留空待分配、置入公海，
    //    因此**不应**出现在正式客户列表
    //    （正式客户列表判据为 business_status IN (…following…) 且 pool_status='private'）。
    await page.goto('/customer/list')
    await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)
    await searchInContainer(page, '.customer-list', companyName)
    await expect(page.locator('.customer-list .el-table__row').filter({ hasText: companyName })).toHaveCount(0)

    // 5. API 复核：确已置入公海（owner_id=NULL 且 pool_status='sea'，可被认领）
    const detail = await getCustomerDetail(request, csrfToken, customerId)
    expect(detail.code).toBe(200)
    const c = detail.data?.customer
    expect(c?.owner_id ?? null).toBeNull()
    expect(c?.pool_status).toBe('sea')
    // 注：/customer/detail 不返回 business_status，此处断言 status；
    // business_status 已离开 lead 由下方「不在潜客池」间接覆盖（NI-3 一致性）。
    expect(c?.status).toBe('following')

    // 6. API 复核：status 与 business_status 已同步为 following（NI-3 一致性）
    const listRes = await listLeadsPoolCustomers(request, csrfToken, companyName)
    expect(listRes.code).toBe(200)
    expect((listRes.data?.list || []).find((x) => x.company_name === companyName)).toBeUndefined()

    // 清理
    if (customerId) {
      const delRes = await deleteCustomer(request, csrfToken, customerId)
      expect(delRes.code).toBe(200)
    }
  })

  test('本人转化（销售/非 manageAll）：归属操作人并成为正式客户', async ({ request }) => {
    test.setTimeout(60000)

    const companyName = uniqueCompanyName('E2E本人转化')
    const sales = await loginAsSales(request)

    // 销售建客户（无分配规则时为 lead）
    const createRes = await createCustomer(request, sales.csrfToken, { companyName })
    expect(createRes.code).toBe(200)
    const customerId = createRes.data?.id
    expect(customerId).toBeTruthy()

    // 销售本人转化
    const convRes = await convertLeadToFormal(request, sales.csrfToken, customerId)
    expect(convRes.code).toBe(200)

    // 【归属规则】本人转化 → owner_id=操作人、pool_status='private'（正式客户，不进公海）
    const detail = await getCustomerDetail(request, sales.csrfToken, customerId)
    expect(detail.code).toBe(200)
    const c = detail.data?.customer
    expect(Number(c?.owner_id)).toBe(Number(sales.userId))
    expect(c?.pool_status).toBe('private')
    // 同上：详情接口只返回 status
    expect(c?.status).toBe('following')

    // 清理
    const delRes = await deleteCustomer(request, sales.csrfToken, customerId)
    expect(delRes.code).toBe(200)
  })
})
