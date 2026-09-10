/**
 * 商机阶段推进核心流程 E2E
 *
 * ⚠️ 补齐覆盖缺口（2026-09-10）：
 * 核心业务链路为 Customer → Opportunity → Quote → Contract，但此前 Opportunity 环节
 * **只有** navigation.spec.js 中一句「商机管理页应能正常加载」的断言，
 * 价值最高的「阶段推进 + 变更原因留痕」完全没有 E2E 覆盖，属核心链路中的空白点。
 * 本文件补齐该缺口，断言落在真实业务动作及其副作用上，而非仅页面可渲染。
 *
 * 数据策略说明：
 * `backend/services/opportunityService.js#createOpportunity` 要求客户
 * status ∈ {following, quoted, negotiating, signed}，而 createCustomer 建出的客户
 * 落在潜客池（status 不满足），故本用例从既有客户中选取，不再自建客户，
 * 清理时也只删自己创建的商机，不触碰既有客户数据。
 */

import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  listCustomers,
  createOpportunity,
  deleteOpportunity,
  getOpportunityStageLog
} from './fixtures/api-helpers.js'

/** 可创建商机的客户状态（与后端 createOpportunity 的校验保持一致） */
const ALLOWED_CUSTOMER_STATUSES = ['following', 'quoted', 'negotiating', 'signed']

function uniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** 禁用动画/过渡，避免断言期间元素仍在位移 */
async function disableAnimations(page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }'
  })
}

test.describe('商机阶段推进核心流程', () => {
  test('应能推进商机阶段并记录变更原因', async ({ authenticatedPage: page, request }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
        testInfo.project.name.includes('Mobile Chrome') ||
        testInfo.project.name === 'firefox',
      '复杂表单流程在 chromium / webkit 桌面浏览器覆盖'
    )

    const opportunityName = uniqueName('E2E商机')
    const changeReason = uniqueName('E2E推进原因')

    await page.setViewportSize({ width: 1280, height: 900 })
    const { csrfToken } = await loginAsAdmin(request)

    // ---- 选定一个可创建商机的客户 ----
    const listRes = await listCustomers(request, csrfToken, { pageSize: 100 })
    expect(listRes.code).toBe(200)
    const customers = listRes.data?.list || []
    const target = customers.find((c) => ALLOWED_CUSTOMER_STATUSES.includes(c.status))
    if (!target) {
      throw new Error(
        '测试库中没有 status ∈ ' +
          ALLOWED_CUSTOMER_STATUSES.join('/') +
          ' 的客户，无法创建商机。' +
          '请确认已执行 backend 的 seed:demo（CI 的 e2e-test / cross-browser-test 均会先 seed）。'
      )
    }

    let opportunityId = null
    try {
      // ---- 准备测试数据：基于该客户建一条 stage=1 的商机 ----
      const oppRes = await createOpportunity(request, csrfToken, {
        name: opportunityName,
        customerId: target.id,
        stage: 1
      })
      expect(oppRes.code).toBe(200)
      opportunityId = oppRes.data?.id

      // ---- 进入商机列表并定位目标行 ----
      await page.goto('/opportunity')
      await page.locator('.opportunity-list').waitFor({ state: 'visible', timeout: 15000 })
      await disableAnimations(page)

      await page
        .locator('.opportunity-list input[placeholder="请输入商机名称"]')
        .first()
        .fill(opportunityName)
      await page.locator('.opportunity-list button:has-text("搜索")').click()
      await page.waitForTimeout(1200)

      const row = page
        .locator('.opportunity-list .el-table__row')
        .filter({ hasText: opportunityName })
        .first()
      await expect(row).toBeVisible({ timeout: 10000 })

      // ---- 打开「推进阶段」弹窗 ----
      // 推进按钮仅在该商机 stage < 5 时渲染
      const pushBtn = row.locator('button:has-text("推进")')
      await expect(pushBtn).toBeVisible()
      await pushBtn.click()

      const dialog = page.locator('.el-dialog').filter({ hasText: '推进阶段' })
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // ---- 选择目标阶段 ----
      // 弹窗默认预选「当前阶段 + 1」，此处仍显式选择以保证确定性
      await dialog.locator('.el-select').first().click()
      const option = page.locator('.el-select-dropdown__item:visible').first()
      await option.waitFor({ state: 'visible', timeout: 5000 })
      await option.click()

      // ---- 填写变更原因 ----
      await dialog.locator('textarea').fill(changeReason)

      await dialog.locator('button:has-text("确定推进")').click()

      // ---- 二次确认 ----
      const confirmBox = page.locator('.el-message-box__btns .el-button--primary:has-text("确定")')
      await confirmBox.waitFor({ state: 'visible', timeout: 5000 })
      await confirmBox.click()

      // ---- 断言一：出现成功提示 ----
      await expect(page.locator('.el-message--success').first()).toBeVisible({ timeout: 10000 })

      // ---- 断言二：变更原因确实落库（阶段变更日志）----
      // 这是本用例的核心价值——仅断言「弹窗关闭」无法发现「原因未透传」这类回归
      await expect
        .poll(
          async () => {
            const logRes = await getOpportunityStageLog(request, csrfToken, opportunityId)
            return JSON.stringify(logRes?.data ?? {})
          },
          { timeout: 15000, message: '阶段变更日志中应包含填写的变更原因' }
        )
        .toContain(changeReason)
    } finally {
      // 只清理本用例创建的商机，不触碰既有的种子客户
      if (opportunityId) await deleteOpportunity(request, csrfToken, opportunityId)
    }
  })
})
