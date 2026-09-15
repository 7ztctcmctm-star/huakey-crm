import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  createCustomer,
  deleteCustomer,
  listLeadsPoolCustomers,
  convertLeadToFormal,
  claimPoolCustomer,
  getCustomerDetail
} from './fixtures/api-helpers.js'

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
 * 潜客池（/leads）与正式客户列表（/customer/list）容器类名不同：
 *  - 潜客池: .leads-pool（无分配规则时新客户为 lead，出现在此处）
 *  - 正式列表: .customer-list（转正后的客户）
 */
async function searchCustomer(page, companyName, container = '.customer-list') {
  const searchInput = page.locator(`${container} input[placeholder*="公司名称"]`).first()
  await searchInput.fill(companyName)
  const searchBtn = page.locator(`${container} button:has-text("搜索")`).first()
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
    const customerId = createRes.data?.id

    // 无分配规则（crm_assign_rule 为空）环境下新建客户为 lead，出现在潜客池（/leads）
    await page.goto('/leads')
    await page.locator('.leads-pool').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 在潜客池搜索并验证出现
    await searchCustomer(page, companyName, '.leads-pool')
    await expect(page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })).toBeVisible()

    // 清理：通过 API 删除测试数据（潜客池行内无删除按钮，走正式客户删除接口）
    if (customerId) {
      const delRes = await deleteCustomer(request, csrfToken, customerId)
      expect(delRes.code).toBe(200)
    }
  })

  test('应能通过 UI 新增客户', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )
    const companyName = uniqueCompanyName()
    await ensureDesktopViewport(page)

    // 潜客池（/leads）提供"新增潜客"，提交后无分配规则时新客户为 lead 留在潜客池
    await page.goto('/leads')
    await page.locator('.leads-pool').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 打开新增弹窗（潜客池复用 CustomerFormDialog，弹窗标题为"新增客户"）
    await page.locator('.leads-pool button:has-text("新增潜客")').click()
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

    // 在潜客池搜索并验证出现
    await searchCustomer(page, companyName, '.leads-pool')
    await expect(page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })).toBeVisible()

    // 清理：通过 API 按公司名查询客户 id 后删除（比点行内链接跳详情页更稳）
    const { csrfToken } = await loginAsAdmin(request)
    const listRes = await listLeadsPoolCustomers(request, csrfToken, companyName)
    expect(listRes.code).toBe(200)
    const target = (listRes.data?.list || []).find(c => c.company_name === companyName)
    expect(target).toBeTruthy()
    const delRes = await deleteCustomer(request, csrfToken, target.id)
    expect(delRes.code).toBe(200)
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
    const customerId = createRes.data?.id

    // 无分配规则环境下新建客户为 lead，在潜客池（/leads）中编辑
    await page.goto('/leads')
    await page.locator('.leads-pool').waitFor({ state: 'visible', timeout: 10000 })
    await disableAnimations(page)

    // 在潜客池搜索
    await searchCustomer(page, companyName, '.leads-pool')

    // 点击编辑（潜客池行内"编辑"按钮，复用 CustomerFormDialog）
    const row = page.locator('.leads-pool .el-table__row', { hasText: companyName })
    const editBtn = row.locator('button:has-text("编辑")')
    await editBtn.click({ force: true })

    await expect(page.locator('.el-dialog:has-text("编辑客户")')).toBeVisible({ timeout: 5000 })
    await fillByLabel(page, '备注', 'E2E 自动测试备注')

    // 诊断埋点：CI 未上传 artifact，失败时把「现场证据」写进报错，避免只能靠猜
    const consoleErrors = []
    const apiFailures = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('response', async (r) => {
      const u = r.url()
      if (!/\/api\/v1\//.test(u)) return
      if (r.status() >= 400) {
        let body = ''
        try { body = (await r.text()).slice(0, 300) } catch { /* 响应体不可读则跳过 */ }
        apiFailures.push(`${r.status()} ${r.request().method()} ${u.replace(/^.*\/api\/v1\//, '/api/v1/')} :: ${body}`)
      }
    })

    const editSubmitBtn = page.locator('.el-dialog .el-button:has-text("确定")')
    await editSubmitBtn.click({ force: true })
    try {
      await expect(page.locator('.el-dialog:has-text("编辑客户")')).not.toBeVisible({ timeout: 10000 })
    } catch (e) {
      const invalidFields = await page.locator('.el-dialog .el-form-item.is-error').evaluateAll(
        (els) => els.map((el) => el.querySelector('.el-form-item__label')?.textContent?.trim()).filter(Boolean)
      ).catch(() => [])
      const messages = await page.locator('.el-message').allTextContents().catch(() => [])
      throw new Error(
        '编辑客户弹窗未关闭（提交未成功）。现场证据：\n'
        + `  · 校验未通过字段: ${JSON.stringify(invalidFields)}\n`
        + `  · 页面提示: ${JSON.stringify(messages)}\n`
        + `  · 失败 API: ${JSON.stringify(apiFailures)}\n`
        + `  · 控制台错误(末 5 条): ${JSON.stringify(consoleErrors.slice(-5))}\n`
        + `原始错误: ${e.message}`
      )
    }

    // 清理：通过 API 删除测试数据
    if (customerId) {
      const delRes = await deleteCustomer(request, csrfToken, customerId)
      expect(delRes.code).toBe(200)
    }
  })
})

/**
 * R-03 客户三类型 CRUD 矩阵 + 跨类型流转（Week 4）
 *
 * 三类型（Customer Center 拆分设计）：
 *   潜客池 /leads        → business_status='lead'（已有用例覆盖 CRUD）
 *   正式客户 /customer/list → pool_status='private' 且 business_status∈(following/quoted/negotiating/signed)
 *   公海池 /pool          → pool_status='sea' 且 owner_id IS NULL
 *
 * 流转链：lead --代转化(admin)--> sea --认领--> private --释放--> sea
 * （归属规则 2026-09-11 产品决策：admin 代转化 → 置公海；认领 → private+owner）
 */
test.describe('R-03 客户三类型 CRUD 矩阵与跨类型流转', () => {
  const skipMobile = (testInfo) =>
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium/webkit 桌面浏览器覆盖'
    )

  /**
   * 准备一个「正式客户」（pool_status='private'、owner=当前 admin）
   * 链路：建客户(lead) → admin 代转化(→sea) → admin 认领(→private)
   */
  async function setupFormalCustomer(request) {
    const { csrfToken, userId } = await loginAsAdmin(request)
    const companyName = uniqueCompanyName('E2E正式客户')
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)
    const customerId = createRes.data?.id
    expect(customerId).toBeTruthy()

    const convRes = await convertLeadToFormal(request, csrfToken, customerId)
    expect(convRes.code).toBe(200)

    const claimRes = await claimPoolCustomer(request, csrfToken, customerId)
    expect(claimRes.code, `admin 认领应成功，实际: ${JSON.stringify(claimRes)}`).toBe(200)

    return { csrfToken, userId, companyName, customerId }
  }

  test('正式客户：搜索可见 + 行内编辑 + UI 软删除', async ({ authenticatedPage: page, request }, testInfo) => {
    skipMobile(testInfo)
    test.setTimeout(60000)
    await ensureDesktopViewport(page)
    const { csrfToken, companyName, customerId } = await setupFormalCustomer(request)

    try {
      // 1. 正式客户列表搜索可见
      await page.goto('/customer/list')
      await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
      await disableAnimations(page)
      await searchCustomer(page, companyName)
      const row = page.locator('.customer-list .el-table__row').filter({ hasText: companyName })
      await expect(row).toBeVisible()

      // 2. 行内编辑：改备注
      await row.locator('button:has-text("编辑")').click({ force: true })
      await expect(page.locator('.el-dialog:has-text("编辑客户")')).toBeVisible({ timeout: 5000 })
      await fillByLabel(page, '备注', 'R-03 正式客户编辑验证')
      await page.locator('.el-dialog .el-button:has-text("确定")').click({ force: true })
      await expect(page.locator('.el-dialog:has-text("编辑客户")')).not.toBeVisible({ timeout: 10000 })

      // 3. 行内 UI 删除（更多 dropdown → 删除 → 确认框「确定删除」）
      await searchCustomer(page, companyName)
      await expect(page.locator('.customer-list .el-table__row').filter({ hasText: companyName })).toBeVisible()
      await row.locator('button:has-text("更多")').click({ force: true })
      await page.locator('.el-dropdown-menu__item:has-text("删除")').first().click({ force: true })
      const confirmBtn = page.locator('.el-message-box__btns .el-button--primary:has-text("确定删除")')
      await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
      await confirmBtn.click({ force: true })
      await page.waitForTimeout(1500)

      // 4. 删除后列表不再出现（软删除）
      await searchCustomer(page, companyName)
      await expect(page.locator('.customer-list .el-table__row').filter({ hasText: companyName })).toHaveCount(0)
    } finally {
      // 兜底清理（UI 删除失败时防残留）
      if (customerId) {
        await deleteCustomer(request, csrfToken, customerId)
      }
    }
  })

  test('公海池：待认领搜索 + UI 认领 + 全部客户视图显示负责人', async ({ authenticatedPage: page, request }, testInfo) => {
    skipMobile(testInfo)
    test.setTimeout(60000)
    await ensureDesktopViewport(page)

    const { csrfToken, userId } = await loginAsAdmin(request)
    const companyName = uniqueCompanyName('E2E公海客户')
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)
    const customerId = createRes.data?.id
    expect(customerId).toBeTruthy()

    // admin 代转化 → 置入公海（sea + owner=NULL）
    const convRes = await convertLeadToFormal(request, csrfToken, customerId)
    expect(convRes.code).toBe(200)

    try {
      // 1. 公海「待认领」视图（默认 scope）搜索可见，且显示「待认领」标识
      await page.goto('/pool')
      await page.locator('.pool-list').waitFor({ state: 'visible', timeout: 10000 })
      await disableAnimations(page)
      await searchCustomer(page, companyName, '.pool-list')
      const row = page.locator('.pool-list .el-table__row').filter({ hasText: companyName })
      await expect(row).toBeVisible()
      await expect(row.locator('.el-tag:has-text("待认领")')).toBeVisible()

      // 2. UI 认领：点「认领」→ 确认框「确定认领」
      await row.locator('button:has-text("认领")').click({ force: true })
      const claimConfirm = page.locator('.el-message-box__btns .el-button--primary:has-text("确定认领")')
      await claimConfirm.waitFor({ state: 'visible', timeout: 5000 })
      await claimConfirm.click({ force: true })
      await page.waitForTimeout(1500)

      // 3. 认领成功 → 待认领视图不再出现该客户
      await searchCustomer(page, companyName, '.pool-list')
      await expect(page.locator('.pool-list .el-table__row').filter({ hasText: companyName })).toHaveCount(0)

      // 4. 切「全部客户」视图 → 可见且负责人列不再显示「待认领」
      await page.locator('.pool-list .el-radio-button:has-text("全部客户")').click()
      await page.waitForTimeout(1200)
      await searchCustomer(page, companyName, '.pool-list')
      const allRow = page.locator('.pool-list .el-table__row').filter({ hasText: companyName })
      await expect(allRow).toBeVisible()
      await expect(allRow.locator('.el-tag:has-text("待认领")')).toHaveCount(0)

      // 5. API 复核归属：owner=admin、pool_status='private'
      const detail = await getCustomerDetail(request, csrfToken, customerId)
      expect(detail.code).toBe(200)
      const c = detail.data?.customer
      expect(Number(c?.owner_id)).toBe(Number(userId))
      expect(c?.pool_status).toBe('private')
    } finally {
      if (customerId) {
        await deleteCustomer(request, csrfToken, customerId)
      }
    }
  })

  test('跨类型全链路：lead→公海→认领→正式客户→释放回公海', async ({ authenticatedPage: page, request }, testInfo) => {
    skipMobile(testInfo)
    test.setTimeout(90000)
    await ensureDesktopViewport(page)

    const { csrfToken } = await loginAsAdmin(request)
    const companyName = uniqueCompanyName('E2E全链路')
    const createRes = await createCustomer(request, csrfToken, { companyName })
    expect(createRes.code).toBe(200)
    const customerId = createRes.data?.id
    expect(customerId).toBeTruthy()

    try {
      // ── 阶段 1：lead → 潜客池可见 ──
      await page.goto('/leads')
      await page.locator('.leads-pool').waitFor({ state: 'visible', timeout: 10000 })
      await disableAnimations(page)
      await searchCustomer(page, companyName, '.leads-pool')
      await expect(page.locator('.leads-pool .el-table__row').filter({ hasText: companyName })).toBeVisible()

      // ── 阶段 2：admin 代转化 → 公海待认领可见 ──
      const convRes = await convertLeadToFormal(request, csrfToken, customerId)
      expect(convRes.code).toBe(200)
      await page.goto('/pool')
      await page.locator('.pool-list').waitFor({ state: 'visible', timeout: 10000 })
      await searchCustomer(page, companyName, '.pool-list')
      const poolRow = page.locator('.pool-list .el-table__row').filter({ hasText: companyName })
      await expect(poolRow).toBeVisible()

      // ── 阶段 3：UI 认领 → 正式客户列表可见 ──
      await poolRow.locator('button:has-text("认领")').click({ force: true })
      const claimConfirm = page.locator('.el-message-box__btns .el-button--primary:has-text("确定认领")')
      await claimConfirm.waitFor({ state: 'visible', timeout: 5000 })
      await claimConfirm.click({ force: true })
      await page.waitForTimeout(1500)

      await page.goto('/customer/list')
      await page.locator('.customer-list').waitFor({ state: 'visible', timeout: 10000 })
      await searchCustomer(page, companyName)
      await expect(page.locator('.customer-list .el-table__row').filter({ hasText: companyName })).toBeVisible()

      // ── 阶段 4：详情页「释放公海」（R-03 修复回归：原 pool_status===0 恒 false，按钮永不渲染）──
      await page.goto(`/customer/detail/${customerId}`)
      const releaseBtn = page.locator('button:has-text("释放公海")')
      await expect(releaseBtn, '私有客户详情页应显示「释放公海」按钮').toBeVisible({ timeout: 10000 })
      await releaseBtn.click({ force: true })
      const releaseConfirm = page.locator('.el-message-box__btns .el-button--primary').first()
      await releaseConfirm.waitFor({ state: 'visible', timeout: 5000 })
      await releaseConfirm.click({ force: true })
      await page.waitForTimeout(2000)

      // 释放后详情页 hero-tags 出现「公海客户」标识（R-03 修复的第二个回归点）
      await expect(page.locator('.customer-360 .el-tag:has-text("公海客户")')).toBeVisible({ timeout: 10000 })

      // ── 阶段 5：API 复核释放效果（sea + owner=NULL + status='sea'）──
      const detail = await getCustomerDetail(request, csrfToken, customerId)
      expect(detail.code).toBe(200)
      const c = detail.data?.customer
      expect(c?.owner_id ?? null).toBeNull()
      expect(c?.pool_status).toBe('sea')
      expect(c?.status).toBe('sea')

      // ── 阶段 6：公海待认领再次可见（流转闭环）──
      await page.goto('/pool')
      await page.locator('.pool-list').waitFor({ state: 'visible', timeout: 10000 })
      await searchCustomer(page, companyName, '.pool-list')
      await expect(page.locator('.pool-list .el-table__row').filter({ hasText: companyName })).toBeVisible()
    } finally {
      if (customerId) {
        await deleteCustomer(request, csrfToken, customerId)
      }
    }
  })
})
