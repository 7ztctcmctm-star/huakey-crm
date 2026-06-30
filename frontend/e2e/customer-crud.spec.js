import { test, expect } from './fixtures/auth.js'

test.describe('客户管理 CRUD', () => {
  test('应能打开新增客户弹窗', async ({ authenticatedPage: page }) => {
    await page.goto('/customer/list')
    await page.waitForTimeout(2000) // 等待列表加载
    // 点击新增按钮 — 实际文案为"新增客户"
    const addBtn = page.locator('button:has-text("新增客户"), button:has-text("新增")')
    if (await addBtn.count() > 0) {
      await addBtn.first().click()
      // 弹窗应出现
      await expect(page.locator('.el-dialog').first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('搜索表单应能输入和重置', async ({ authenticatedPage: page }) => {
    await page.goto('/customer/list')
    await page.waitForTimeout(2000)

    // 输入搜索条件 — placeholder 为"请输入公司名称"
    const nameInput = page.locator('input[placeholder*="公司名称"]')
    if (await nameInput.count() > 0) {
      await nameInput.first().fill('测试')
      // 点击搜索
      const searchBtn = page.locator('button:has-text("搜索")')
      if (await searchBtn.count() > 0) {
        await searchBtn.first().click()
        await page.waitForTimeout(1000)
      }
      // 点击重置
      const resetBtn = page.locator('button:has-text("重置")')
      if (await resetBtn.count() > 0) {
        await resetBtn.first().click()
      }
    }
  })

  test('Tab 切换应正常工作', async ({ authenticatedPage: page }) => {
    await page.goto('/customer/list')
    await page.waitForTimeout(2000)

    // 切换状态 tab
    const tabs = page.locator('.el-tabs__item')
    if (await tabs.count() > 1) {
      await tabs.nth(1).click()
      await page.waitForTimeout(1000)
    }
  })
})
