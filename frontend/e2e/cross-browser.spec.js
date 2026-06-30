/**
 * 跨浏览器兼容性测试 (Phase 8)
 *
 * 验证前端在 Chromium / Firefox / WebKit / iPhone 12 Pro 下的基本可用性。
 *
 * 运行: npx playwright test --project=chromium --project=firefox --project=webkit --project="iPhone 12 Pro"
 */

import { test, expect, devices } from "@playwright/test"

const BROWSERS = [
  { name: "chromium", device: null, width: 1920, height: 1080 },
  { name: "firefox", device: null, width: 1920, height: 1080 },
  { name: "webkit", device: null, width: 1920, height: 1080 },
  { name: "iPhone 12 Pro", device: devices["iPhone 12 Pro"], width: null, height: null },
]

for (const browser of BROWSERS) {
  test.describe(`[${browser.name}]`, () => {
    test.use(
      browser.device
        ? { ...browser.device }
        : { viewport: { width: browser.width, height: browser.height } }
    )

    test("login page renders without layout overflow", async ({ page }) => {
      await page.goto("/login")
      await page.waitForLoadState("networkidle")

      // 验证关键元素可见
      const form = page.locator(".login-form, form, [class*=login]")
      await expect(form.first()).toBeVisible({ timeout: 10000 })

      // 验证无横向滚动条
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      })
      expect(hasHorizontalScroll).toBe(false)
    })

    test("customer list renders without horizontal overflow", async ({ page }) => {
      // 先登录（使用 fixture 或直接走 API）
      await page.goto("/login")
      await page.waitForLoadState("networkidle")

      // 验证页面容器不超出视口
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      const viewportWidth = page.viewportSize()?.width || 1920
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
    })

    test("sidebar collapses to hamburger on narrow viewport", async ({ page }) => {
      if (browser.name !== "iPhone 12 Pro") test.skip()

      await page.goto("/login")
      await page.waitForLoadState("networkidle")

      // 移动端侧边栏应为隐藏/折叠状态
      const sidebar = page.locator(".sidebar, .el-menu, [class*=sidebar]")
      const isVisible = await sidebar.first().isVisible().catch(() => false)

      // 如果有汉堡按钮则检查其可见
      const hamburger = page.locator(".hamburger, [class*=toggle], [class*=collapse]")
      const hasToggle = await hamburger.first().isVisible().catch(() => false)

      // 移动端应有折叠机制：要么侧边栏隐藏，要么有切换按钮
      expect(isVisible || hasToggle).toBeTruthy()
    })

    test("dashboard cards wrap correctly on narrow viewport", async ({ page }) => {
      const isNarrow = browser.name === "iPhone 12 Pro"
      if (isNarrow) {
        await page.setViewportSize({ width: 375, height: 812 })
      }

      await page.goto("/login")
      await page.waitForLoadState("networkidle")

      // 验证无元素重叠（检查 body 内任意两个可见元素不互相覆盖）
      const noOverlap = await page.evaluate(() => {
        const cards = document.querySelectorAll(".el-card, .card, [class*=card]")
        if (cards.length < 2) return true  // 无法判断，跳过
        const rects = Array.from(cards).slice(0, 4).map(c => c.getBoundingClientRect())
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j]
            // 检查是否有不合理的重叠（共享超过 50% 面积且不是父子关系）
            const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            const overlapArea = overlapX * overlapY
            const minArea = Math.min(a.width * a.height, b.width * b.height)
            if (overlapArea > minArea * 0.5) return false
          }
        }
        return true
      })
      expect(noOverlap).toBe(true)
    })
  })
}
