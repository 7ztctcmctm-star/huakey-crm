/**
 * 跨浏览器兼容性测试 —— 登录页布局
 *
 * 运行: npx playwright test e2e/cross-browser.spec.js
 *
 * ⚠️ 2026-09-10 重构说明：
 * 原实现在文件内用 for 循环 + 顶层 test.use 重复枚举
 * chromium / firefox / webkit / iPhone 12 Pro 四个「浏览器」，与
 * playwright.config.js 已定义的 projects **叠加**，导致：
 *   1. 每个 project 重复执行 4 套用例（如标着 [firefox] 的用例实际跑在
 *      Mobile Chrome project 上），5 个项目 × 16 用例 = 80 个，冗余且错标；
 *   2. 断言在一个过宽的选择器 `.login-form, form, [class*=login]` 上取
 *      `.first()`（按 DOM 顺序，实际命中根容器），实测 52/80 失败。
 *
 * 现改为：不在文件内枚举浏览器，跨浏览器覆盖完全交由 config 的 projects
 * （chromium / Mobile Chrome / firefox / webkit / iPhone 12 Pro）提供。
 * 用例收敛为对登录页本身有意义的布局断言。
 *
 * 注：真正的「应用页」响应式断言在 responsive.spec.js 中，那里使用
 * authenticatedPage fixture 访问真实页面。
 */

import { test, expect } from '@playwright/test'

/**
 * 等待字体与首帧布局稳定后再做尺寸断言。
 * 原实现在元素「可见」后立即读取 scrollWidth，字体/样式可能仍在应用，
 * 会测到布局中间态而产生偶发失败。
 */
async function waitForStableLayout(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()))
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
}

/** 登录页根容器。与 login.spec.js 保持一致，替代原先过宽的选择器 */
const LOGIN_ROOT = '.login-container'

test.describe('登录页跨浏览器布局', () => {
  test('login page renders without layout overflow', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator(LOGIN_ROOT)).toBeVisible({ timeout: 15000 })
    await waitForStableLayout(page)

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('login page body fits within viewport', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator(LOGIN_ROOT)).toBeVisible({ timeout: 15000 })
    await waitForStableLayout(page)

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = page.viewportSize()?.width || 1920
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })
})
