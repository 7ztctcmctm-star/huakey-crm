import { test, expect } from './fixtures/auth.js'
import { loginAsAdmin, createCustomer, deleteCustomer } from './fixtures/api-helpers.js'

// 生成唯一公司名称，避免并发或重复运行冲突
function uniqueCompanyName(prefix = 'E2E测试客户') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 客户列表/弹窗在移动端小视口下布局容易出现遮挡，
 * 统一使用桌面级视口运行本用例，保证跨浏览器引擎都能稳定覆盖核心流程。
 */
async function ensureDesktopViewport(page) {
  await page.setViewportSize({ width: 1280, height: 900 })
}

/**
 * 禁用 CSS 动画/过渡，避免 Playwright 因元素不稳定而超时。
 */
async function disableAnimations(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }'
  })
}

/**
 * 在新增/编辑弹窗内，根据 el-form-item 的 label 文本定位表单项，
 * 并将其滚动到可见区域。
 */
async function scrollFieldIntoView(page, labelText) {
  const field = page.locator(
    `.el-dialog .el-form-item:has(.el-form-item__label:has-text("${labelText}"))`
  )
  await field.scrollIntoViewIfNeeded({ timeout: 5000 })
  return field
}

/**
 * 根据 label 文本填充输入框（input 或 textarea）。
 */
async function fillByLabel(page, labelText, value) {
  const field = await scrollFieldIntoView(page, labelText)
  const input = field.locator('input, textarea').first()
  await input.fill(value)
}

/**
 * 根据 label 文本选择 el-select 的第一个可用选项。
 * 通过 :visible 限定当前打开的下拉面板，避免命中其他隐藏选项。
 */
async function selectFirstOptionByLabel(page, labelText) {
  const field = await scrollFieldIntoView(page, labelText)
  const select = field.locator('.el-select').first()
  await select.click()
  await page.waitForTimeout(250)

  const option = page.locator(
    '.el-select__popper:visible .el-select-dropdown__item, .el-select-dropdown:visible .el-select-dropdown__item'
  ).first()
  await option.waitFor({ state: 'visible', timeout: 5000 })
  await option.click({ force: true })
}

/**
 * 在客户列表中根据公司名称搜索并等待结果出现。
 */
async function searchCustomer(page, companyName) {
  const searchInput = page.locator('.customer-list input[placeholder*="公司名称"]').first()
  await searchInput.fill(companyName)
  const searchBtn = page.locator('.customer-list button:has-text("搜索")').first()
  await searchBtn.click()
  await page.waitForTimeout(1200)
}

// 客户 CRUD 涉及表格、弹窗、下拉等复杂交互，移动设备视口下不稳定，
// 核心业务流程在桌面浏览器覆盖即可；响应式布局由 responsive/cross-browser 专门覆盖。
test.describe('客户管理 CRUD', () => {
  test('应能在列表中搜索、查看并删除客户', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    const companyName = uniqueCompanyName()
    await ensureDesktopViewport(page)
    const { csrfToken } = await loginAsAdmin(request)
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)

    await page.goto('/customer/list')
    await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    await searchCustomer(page, companyName)
    await expect(page.locator('.el-table__row').filter({ hasText: companyName })).toBeVisible()

    // 清理：删除测试数据
    const row = page.locator('.el-table__row', { hasText: companyName })
    const moreBtn = row.locator('button:has-text("更多")')
    await moreBtn.click()
    await page.locator('.el-dropdown-menu__item:has-text("删除")').click()
    await page.locator('.el-message-box__btns .el-button--primary:has-text("确定")').click()
    await page.waitForTimeout(1000)

    await expect(page.locator('.el-table__row').filter({ hasText: companyName })).not.toBeVisible()
  })

  test('应能通过 UI 新增客户', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    const companyName = uniqueCompanyName()
    await ensureDesktopViewport(page)

    await page.goto('/customer/list')
    await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 打开新增弹窗
    await page.locator('.customer-list button:has-text("新增客户")').click()
    await expect(page.locator('.el-dialog:has-text("新增客户")')).toBeVisible({ timeout: 5000 })

    // 填写表单（按 label 定位）
    await fillByLabel(page, '公司名称', companyName)
    const contactField = await scrollFieldIntoView(page, '联系人')
    await contactField.locator('input[placeholder*="姓名"]').first().fill('E2E联系人')
    await fillByLabel(page, '所属行业', '测试行业')
    await selectFirstOptionByLabel(page, '客户来源')

    // 提交
    const submitBtn = page.locator('.el-dialog .el-button:has-text("确定")')
    await submitBtn.click({ force: true })

    // 等待弹窗关闭 + 列表刷新
    await expect(page.locator('.el-dialog:has-text("新增客户")')).not.toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1200)

    // 搜索并验证
    await searchCustomer(page, companyName)
    await expect(page.locator('.el-table__row').filter({ hasText: companyName })).toBeVisible()

    // 清理
    const row = page.locator('.el-table__row', { hasText: companyName })
    const moreBtn = row.locator('button:has-text("更多")')
    await moreBtn.click({ force: true })
    await page.locator('.el-dropdown-menu__item:has-text("删除")').click({ force: true })
    await page.locator('.el-message-box__btns .el-button--primary:has-text("确定")').click({ force: true })
    await page.waitForTimeout(1000)
  })

  test('应能编辑客户备注', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    const companyName = uniqueCompanyName()
    await ensureDesktopViewport(page)
    const { csrfToken } = await loginAsAdmin(request)
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)

    await page.goto('/customer/list')
    await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 搜索
    await searchCustomer(page, companyName)

    // 编辑
    const row = page.locator('.el-table__row', { hasText: companyName })
    const moreBtn = row.locator('button:has-text("更多")')
    await moreBtn.click({ force: true })
    await page.locator('.el-dropdown-menu__item:has-text("编辑")').click({ force: true })

    await expect(page.locator('.el-dialog:has-text("编辑客户")')).toBeVisible({ timeout: 5000 })
    await fillByLabel(page, '备注', 'E2E 自动测试备注')

    const editSubmitBtn = page.locator('.el-dialog .el-button:has-text("确定")')
    await editSubmitBtn.click({ force: true })
    await expect(page.locator('.el-dialog:has-text("编辑客户")')).not.toBeVisible({ timeout: 10000 })

    // 清理
    await page.waitForTimeout(1200)
    await searchCustomer(page, companyName)
    await moreBtn.click({ force: true })
    await page.locator('.el-dropdown-menu__item:has-text("删除")').click({ force: true })
    await page.locator('.el-message-box__btns .el-button--primary:has-text("确定")').click({ force: true })
  })
})
