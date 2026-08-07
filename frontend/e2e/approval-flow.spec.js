import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  createCustomer,
  createProduct,
  createQuote,
  deleteCustomer,
  deleteProduct,
  deleteQuote,
  createApprovalWorkflow,
  deleteApprovalWorkflow,
  listApprovalWorkflows,
  submitApproval
} from './fixtures/api-helpers.js'

function uniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// 审批流涉及表格行操作与审批弹窗，移动设备视口下交互不稳定，
// 核心业务流程在桌面浏览器覆盖即可；响应式布局由 responsive/cross-browser 专门覆盖。
test.describe('报价审批工作流', () => {
  let csrfToken = ''
  let customerId = null
  let productId = null
  let quoteId = null
  let workflowId = null
  let quoteNo = ''

  test.beforeAll(async ({ request }) => {
    const login = await loginAsAdmin(request)
    csrfToken = login.csrfToken
    // 动态获取 admin 用户 ID，避免硬编码 approver_id 导致外键约束失败
    const adminUserId = login.userId

    const customerName = uniqueName('E2E审批客户')
    const productName = uniqueName('E2E审批产品')

    const customerRes = await createCustomer(request, csrfToken, {
      companyName: customerName,
      contacts: [{ name: '审批联系人', phone: '13800138002' }]
    })
    if (customerRes.code !== 200) {
      throw new Error(`创建测试客户失败：${customerRes.message || JSON.stringify(customerRes)}`)
    }
    customerId = customerRes.data?.id || customerRes.data?.insertId

    const productRes = await createProduct(request, csrfToken, {
      name: productName,
      price: 888.88,
      stock: 8888
    })
    if (productRes.code !== 200) {
      throw new Error(`创建测试产品失败：${productRes.message || JSON.stringify(productRes)}`)
    }
    productId = productRes.data?.id || productRes.data?.insertId

    // 通过 API 创建报价单，避免 UI 报价流程干扰审批流测试焦点
    const quoteRes = await createQuote(request, csrfToken, {
      customerId,
      items: [{ product_id: productId, quantity: 1, unit_price: 888.88 }]
    })
    if (quoteRes.code !== 200) {
      throw new Error(`创建测试报价单失败：${quoteRes.message || JSON.stringify(quoteRes)}`)
    }
    quoteId = quoteRes.data?.id || quoteRes.data?.insertId
    quoteNo = quoteRes.data?.quote_no || ''

    // 清理已有 quote 审批流，避免 submitApproval 命中默认经理审批流（id=1）
    const existingWorkflows = await listApprovalWorkflows(request, csrfToken)
    if (existingWorkflows.code === 200 && Array.isArray(existingWorkflows.data)) {
      for (const wf of existingWorkflows.data) {
        if (wf.type === 'quote' && !wf.deleted_at) {
          await deleteApprovalWorkflow(request, csrfToken, wf.id)
        }
      }
    }

    // 创建并启用报价审批流程（单步审批人：admin）
    const workflowRes = await createApprovalWorkflow(request, csrfToken, {
      name: uniqueName('E2E报价审批流程'),
      type: 'quote',
      steps: [
        { step_name: '经理审批', approver_type: 'user', approver_id: adminUserId, is_required: true }
      ]
    })
    if (workflowRes.code !== 200) {
      throw new Error(`创建审批流程失败：${workflowRes.message || JSON.stringify(workflowRes)}`)
    }
    workflowId = workflowRes.data?.id || workflowRes.data?.workflowId

    // 提交审批
    const submitRes = await submitApproval(request, csrfToken, 'quote', quoteId)
    if (submitRes.code !== 200) {
      throw new Error(`提交审批失败：${submitRes.message || JSON.stringify(submitRes)}`)
    }
  })

  test.afterAll(async ({ request }) => {
    if (quoteId) await deleteQuote(request, csrfToken, quoteId)
    if (workflowId) await deleteApprovalWorkflow(request, csrfToken, workflowId)
    if (productId) await deleteProduct(request, csrfToken, productId)
    if (customerId) await deleteCustomer(request, csrfToken, customerId)
  })

  test('应能在待审批页面通过报价审批', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    await page.goto('/approval/pending')
    await page.waitForSelector('.page-container', { timeout: 10000 })

    // 验证列表中存在目标报价单的待审批记录
    const targetRow = page.locator('.el-table__row', { hasText: quoteNo })
    await expect(targetRow).toBeVisible({ timeout: 10000 })

    // 点击“通过”打开审批弹窗
    await targetRow.locator('button:has-text("通过")').click()
    await expect(page.locator('.el-dialog:has-text("审批通过")')).toBeVisible({ timeout: 5000 })

    // 填写审批意见并确认
    await page.locator('.el-dialog textarea').fill('E2E 审批通过')
    // 移动端对话框可能出现 overlay/footer 拦截点击，使用 force 点击并等待动画结束
    const confirmBtn = page.locator('.el-dialog .el-button:has-text("确认通过")')
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(300)
    await confirmBtn.click({ force: true })

    // 审批后记录应从待办列表消失
    await expect(targetRow).not.toBeVisible({ timeout: 10000 })

    // 列表应回到空状态或不再包含该报价单
    await expect(page.locator('.el-table__row', { hasText: quoteNo })).toHaveCount(0)
  })
})
