/**
 * 响应式断点测试
 *
 * ⚠️ 历史问题（2026-09-10 修复）：
 * 本文件此前所有用例都只访问 /login。而登录页是独立布局——它永远没有侧边栏、
 * 没有统计卡片、也没有数据表格。因此「窄屏不显示侧边栏」这类断言恒为真，
 * 无论应用是否做了移动端适配都会通过，提供了虚假的通过信心。
 *
 * 现改为：登录页用例保留（对登录页本身有效），并新增基于 authenticatedPage
 * 的真实页面用例，真正覆盖侧边栏抽屉化、统计卡片降列与横向溢出。
 *
 * 运行: npx playwright test --project=chromium responsive.spec.js
 */

import { test, expect } from './fixtures/auth.js'

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
]

/** 禁用动画/过渡，避免断言期间元素仍在位移导致不稳定 */
async function disableAnimations(page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }'
  })
}

/** 页面是否出现横向滚动（移动端不应出现） */
async function hasHorizontalScroll(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  )
}

/**
 * 统计前 N 个卡片中与首个卡片同行的数量，即当前栅格列数。
 * 期望：桌面 4 列 / 平板 2 列 / 手机 1 列。
 */
async function firstRowCardCount(page, selector, limit = 4) {
  const boxes = await page.locator(selector).evaluateAll(
    (els, n) =>
      els.slice(0, n).map((el) => {
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y) }
      }),
    limit
  )
  if (boxes.length === 0) return 0
  const baseY = boxes[0].y
  return boxes.filter((b) => Math.abs(b.y - baseY) <= 2).length
}

// ============================================================
// 登录页（独立布局：无侧边栏 / 无统计卡片 / 无数据表格）
// ============================================================
for (const bp of BREAKPOINTS) {
  test.describe(`viewport ${bp.name} (${bp.width}x${bp.height})`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } })

    test('login page adapts to viewport', async ({ page }) => {
      await page.goto('/login')

      const form = page.locator('.login-form, form, [class*=login]').first()
      await expect(form).toBeVisible({ timeout: 10000 })

      const formBox = await form.boundingBox()
      expect(formBox.width).toBeLessThanOrEqual(bp.width + 10)
      expect(formBox.x).toBeGreaterThanOrEqual(-5)
    })

    test('login page has no horizontal scroll', async ({ page }) => {
      await page.goto('/login')
      await expect(page.locator('.login-form, form').first()).toBeVisible({ timeout: 10000 })
      expect(await hasHorizontalScroll(page)).toBe(false)
    })
  })
}

// ============================================================
// 真实页面（需登录）—— 移动端适配的真正验证
// ============================================================
test.describe('移动端侧边栏抽屉（真实页面）', () => {
  test('窄屏下侧边栏默认收起在视口外，可展开亦可关闭', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.locator('.sidebar').waitFor({ state: 'attached', timeout: 15000 })
    await disableAnimations(page)

    const sidebar = page.locator('.sidebar')

    // 默认应收在视口左侧之外（translateX(-100%)）
    const closed = await sidebar.boundingBox()
    expect(closed.x + closed.width).toBeLessThanOrEqual(1)

    // 顶栏按钮展开抽屉
    await page.locator('.collapse-btn').click()
    await page.waitForTimeout(600)
    const opened = await sidebar.boundingBox()
    expect(opened.x).toBeGreaterThanOrEqual(-1)
    expect(opened.width).toBeGreaterThan(200)

    // 遮罩出现；注意必须点在侧边栏（左侧 230px）之外的区域，
    // 否则点击会被展开的侧边栏拦截
    const backdrop = page.locator('.sidebar-backdrop')
    await expect(backdrop).toBeVisible()
    await page.mouse.click(360, 400)
    await page.waitForTimeout(600)
    const reclosed = await sidebar.boundingBox()
    expect(reclosed.x + reclosed.width).toBeLessThanOrEqual(1)
  })

  test('桌面端侧边栏常驻且不出现遮罩', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard')
    await page.locator('.sidebar').waitFor({ state: 'attached', timeout: 15000 })

    const sidebar = await page.locator('.sidebar').boundingBox()
    expect(sidebar.x).toBeGreaterThanOrEqual(-1)
    expect(sidebar.width).toBeGreaterThan(200)
    await expect(page.locator('.sidebar-backdrop')).toHaveCount(0)
  })
})

test.describe('统计卡片响应式降列（真实页面）', () => {
  const CASES = [
    { name: '桌面 1440px 应为四列', width: 1440, expected: 4 },
    { name: '平板 1024px 应为两列', width: 1024, expected: 2 },
    { name: '平板 768px 应为两列', width: 768, expected: 2 },
    { name: '手机 375px 应为单列', width: 375, expected: 1 }
  ]

  for (const c of CASES) {
    test(c.name, async ({ authenticatedPage: page }) => {
      await page.setViewportSize({ width: c.width, height: 900 })
      await page.goto('/dashboard')
      await page.locator('.stat-card').first().waitFor({ state: 'visible', timeout: 15000 })
      await disableAnimations(page)

      expect(await firstRowCardCount(page, '.stat-card')).toBe(c.expected)
    })
  }
})

test.describe('窄屏无横向溢出（真实页面）', () => {
  const PAGES = ['/dashboard', '/customer/list', '/quotation/list', '/contract/list']

  for (const path of PAGES) {
    test(`${path} 在 375px 下无横向滚动`, async ({ authenticatedPage: page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      await page.waitForTimeout(1500)
      await disableAnimations(page)

      expect(await hasHorizontalScroll(page)).toBe(false)
    })
  }
})
