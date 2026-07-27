import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  createCustomer,
  createProduct,
  deleteCustomer,
  deleteProduct,
  listQuotes,
  approveQuote,
  deleteQuote,
  deleteContract
} from './fixtures/api-helpers.js'

function uniqueName(prefix) {
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

// 报价 → 合同是复杂表单流程，移动设备视口下弹窗/表格交互不稳定，
// 核心业务流程在桌面浏览器覆盖即可；响应式布局由 responsive/cross-browser 专门覆盖。
test.describe('报价 → 合同核心流程', () => {
  let customerId = null
  let productId = null
  let customerName = ''
  let productName = ''
  let quoteId = null
  let contractId = null

  test.beforeAll(async ({ request }) => {
    const { csrfToken } = await loginAsAdmin(request)

    customerName = uniqueName('E2E报价客户')
    productName = uniqueName('E2E测试产品')

    // 预置一个客户和一个产品，供后续报价使用
    const customerRes = await createCustomer(request, csrfToken, {
      companyName: customerName,
      contacts: [{ name: '报价联系人', phone: '13800138001' }]
    })
    if (customerRes.code !== 200) {
      throw new Error(`创建测试客户失败：${customerRes.message || JSON.stringify(customerRes)}`)
    }
    customerId = customerRes.data?.id || customerRes.data?.insertId

    const productRes = await createProduct(request, csrfToken, {
      name: productName,
      price: 999.99,
      stock: 9999
    })
    if (productRes.code !== 200) {
      throw new Error(`创建测试产品失败：${productRes.message || JSON.stringify(productRes)}`)
    }
    productId = productRes.data?.id || productRes.data?.insertId
  })

  test.afterAll(async ({ request }) => {
    // Playwright 的 request fixture 在每个 hook 中独立，需重新登录使 token/header 匹配
    const { csrfToken } = await loginAsAdmin(request)
    // 按依赖逆序清理：合同 → 报价 → 产品 → 客户
    if (contractId) await deleteContract(request, csrfToken, contractId)
    if (quoteId) await deleteQuote(request, csrfToken, quoteId)
    if (productId) await deleteProduct(request, csrfToken, productId)
    if (customerId) await deleteCustomer(request, csrfToken, customerId)
  })

  test('应能新建报价单、审批通过后转为合同', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    // 报价→合同涉及多页面跳转、弹窗、表格行操作，firefox 偶发较慢，给予更充裕时间
    test.setTimeout(60000)
    await ensureDesktopViewport(page)

    // request fixture 与 beforeAll 中的 request 不是同一上下文，重新登录确保 token/header 匹配
    const { csrfToken } = await loginAsAdmin(request)

    await page.goto('/quotation')
    await page.locator('.quotation-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 点击新建
    await page.locator('.quotation-list button:has-text("新建报价单")').click()
    await page.waitForURL(/\/quotation\/edit/)
    await expect(page.locator('.quotation-edit')).toBeVisible()

    // 选择客户：远程搜索精确客户名
    const customerSelect = page.locator('.quotation-edit .el-form-item:has-text("客户") .el-select')
    await customerSelect.click()
    await page.waitForTimeout(250)

    // 使用 scoped 定位，避免命中页面上其他 el-input__inner/readonly 输入框
    const searchInput = customerSelect.locator('.el-select__input')
    await searchInput.waitFor({ state: 'visible', timeout: 5000 })
    await searchInput.fill(customerName)
    await page.waitForTimeout(1000)

    const customerOption = page.locator('.el-select-dropdown__item').filter({ hasText: customerName }).first()
    await customerOption.waitFor({ state: 'visible', timeout: 5000 })
    await customerOption.click({ force: true })

    // 等待客户信息卡片渲染，确认选择成功
    await expect(page.locator('.quotation-edit .info-value').filter({ hasText: customerName })).toBeVisible({ timeout: 5000 })

    // 添加产品
    await page.locator('.quotation-edit button:has-text("添加产品")').click()
    const productDialog = page.locator('.el-dialog:has-text("选择产品")')
    await expect(productDialog).toBeVisible({ timeout: 5000 })
    await disableAnimations(page)

    // 按产品名搜索，避免列表中存在多个测试产品
    await productDialog.locator('input[placeholder="产品名称"]').fill(productName)
    await productDialog.locator('button:has-text("搜索")').click()
    await page.waitForTimeout(500)

    const productRow = productDialog.locator('.el-table__row').filter({ hasText: productName }).first()
    await productRow.waitFor({ state: 'visible', timeout: 5000 })
    await productRow.click({ force: true })

    const confirmAddBtn = productDialog.locator('.el-button:has-text("确认添加")')
    await confirmAddBtn.click({ force: true })
    await expect(productDialog).not.toBeVisible({ timeout: 10000 })

    // 提交
    const submitBtn = page.locator('.quotation-edit button:has-text("创建报价单")')
    await submitBtn.click({ force: true })

    // 等待保存成功并跳转回列表
    await page.waitForURL('/quotation', { timeout: 15000 })
    await expect(page).toHaveURL('/quotation')

    // 通过 API 查询刚创建的报价单 ID（避免依赖 UI 上的隐藏 ID）
    const listRes = await listQuotes(request, csrfToken, { customerName })
    if (listRes.code !== 200 || !listRes.data?.list?.length) {
      throw new Error(`查询新建报价单失败：${listRes.message || JSON.stringify(listRes)}`)
    }
    quoteId = listRes.data.list[0].id

    // 管理员直接审批通过，使转合同按钮出现
    const approveRes = await approveQuote(request, csrfToken, quoteId, 2)
    if (approveRes.code !== 200) {
      throw new Error(`审批报价单失败：${approveRes.message || JSON.stringify(approveRes)}`)
    }

    // 刷新列表，等待转合同按钮渲染
    await page.reload()
    await page.locator('.quotation-list').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 搜索目标报价，避免列表中存在多个测试数据
    const customerSearchInput = page.locator('.quotation-list input[placeholder="请输入客户名称"]').first()
    await customerSearchInput.fill(customerName)
    await page.locator('.quotation-list button:has-text("搜索")').click()
    await page.waitForTimeout(1200)

    // 对目标行点击“转合同”
    const row = page.locator('.quotation-list .el-table__row').filter({ hasText: customerName }).first()
    const convertBtn = row.locator('button:has-text("转合同")')
    await convertBtn.scrollIntoViewIfNeeded()
    await convertBtn.click({ force: true })

    // 确认弹窗
    const confirmBox = page.locator('.el-message-box__btns .el-button--primary:has-text("确定")')
    await confirmBox.waitFor({ state: 'visible', timeout: 5000 })
    await confirmBox.click({ force: true })

    // 等待跳转合同详情页
    await page.waitForURL(/\/contract\/detail\/\d+/, { timeout: 15000 })

    // 提取合同 ID 用于清理
    const detailUrl = page.url()
    const match = detailUrl.match(/\/contract\/detail\/(\d+)$/)
    contractId = match ? parseInt(match[1], 10) : null

    // 验证合同详情页展示正确
    await expect(page.locator('.contract-detail')).toBeVisible()
    await expect(page.locator('.page-title')).toContainText('合同详情')
    await expect(page.locator('.contract-detail')).toContainText(customerName)
    await expect(page.locator('.contract-detail')).toContainText('999.99')
  })
})
