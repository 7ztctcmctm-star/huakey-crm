import { test, expect } from './fixtures/auth.js'
import { loginAsAdmin, createApprovalRule, deleteApprovalRule } from './fixtures/api-helpers.js'

function uniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * R-11 回归护栏：审批规则配置（阈值→审批人矩阵）。
 * 覆盖：配置页可访问并展示已配置规则；「新增规则」可打开配置弹窗。
 */
test.describe('审批规则配置（阈值→审批人矩阵）', () => {
  let csrfToken = ''
  let ruleId = null
  let ruleDesc = ''

  const isMobileOrFirefox = (testInfo) =>
    testInfo.project.name.includes('iPhone') ||
    testInfo.project.name.includes('Mobile Chrome') ||
    testInfo.project.name === 'firefox'

  test.beforeAll(async ({ request }) => {
    const login = await loginAsAdmin(request)
    csrfToken = login.csrfToken

    ruleDesc = uniqueName('E2E审批规则')
    const res = await createApprovalRule(request, csrfToken, {
      businessType: 'contract',
      minAmount: 0,
      maxAmount: 100,
      approverType: 'manager',
      description: ruleDesc
    })
    if (res.code !== 200) {
      throw new Error(`创建审批规则失败：${res.message || JSON.stringify(res)}`)
    }
    ruleId = res.data?.id || res.data?.insertId
  })

  test.afterAll(async ({ request }) => {
    if (ruleId) await deleteApprovalRule(request, csrfToken, ruleId)
  })

  test('配置页可访问，且展示已配置的阈值规则', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '复杂表格在桌面浏览器覆盖')

    await page.goto('/approval/rule-config', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    await expect(page.getByRole('heading', { name: '审批规则配置' })).toBeVisible({ timeout: 10000 })
    // 注意：表格列不含 description（仅 业务类型/金额区间/审批人类型/审批人/优先级/状态/操作），
    // 故按「列表已渲染出规则行」断言（beforeAll 已建 1 条规则，列表默认不过滤）。
    await expect(page.locator('.el-table__row').first()).toBeVisible({ timeout: 10000 })
  })

  test('「新增规则」按钮可打开配置弹窗', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '复杂表格在桌面浏览器覆盖')

    await page.goto('/approval/rule-config', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    await page.getByRole('button', { name: '新增规则' }).click()
    await expect(page.locator('.el-dialog')).toBeVisible({ timeout: 5000 })
  })
})
