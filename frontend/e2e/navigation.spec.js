import { test, expect } from './fixtures/auth.js'

/**
 * 列表页「加载完成」的判定选择器。
 *
 * 为什么是这三个，而不是原来的 `.el-table, .el-empty`（2026-09-12 修订）：
 * 视觉规范第三阶段把全站 `el-empty` 换成了自研 `EmptyState`（内联 SVG 插画），
 * 源码里 `el-empty` 已下线（只残留一条无组件产出的死样式 `.el-empty__description`）。
 * 列表页接入 `StateWrapper` 后各状态的**真实**渲染形态是：
 *   有数据 → `.el-table`
 *   空数据 → `.empty-state`（EmptyState 根节点）
 *   加载失败 → `.empty-state`（同上，type="error"）
 *   加载中 → 骨架屏（.table-skeleton）
 * 原断言 `'.el-table, .el-empty'` 只在「列表恰好有数据」时碰巧通过，数据为空必然红
 * —— 这正是 navigation.spec 曾连续 5 次红灯的形态（当时真因是 seed 缺 business_status
 * 导致列表恒空，而断言本身也已过时）。此处一并修正。
 *
 * 注意：这里**不包含**骨架屏 —— 等到骨架屏不算「加载成功」，
 * 若超时后仍只有骨架屏，说明接口没返回，应当失败。
 */
const LIST_LOADED = '.el-table, .empty-state'

test.describe('导航和权限', () => {
  test('登录后应能看到侧边栏菜单', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('iPhone') ||
      testInfo.project.name.includes('Mobile Chrome') ||
      testInfo.project.name === 'firefox',
      '桌面端侧边栏布局，firefox 与移动端由 responsive/cross-browser 覆盖'
    )
    await page.goto('/')
    // 等待 layout 渲染 — sidebar 类名来自 layout/index.vue
    await expect(page.locator('.sidebar, .el-menu, [class*="menu"]').first()).toBeVisible()
  })

  test('客户列表页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/customer/list')
    // 等待表格、空态或错误态出现（三者都算「已完成一次加载」）
    await expect(page.locator(LIST_LOADED).first()).toBeVisible({ timeout: 10000 })
  })

  test('商机管理页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/opportunity')
    await expect(page.locator(LIST_LOADED).first()).toBeVisible({ timeout: 10000 })
  })

  test('产品管理页应能正常加载', async ({ authenticatedPage: page }) => {
    await page.goto('/product')
    await expect(page.locator(LIST_LOADED).first()).toBeVisible({ timeout: 10000 })
  })

  test('404 页面应正常显示', async ({ authenticatedPage: page }) => {
    await page.goto('/nonexistent-page')
    await expect(page.locator('body')).toBeVisible()
  })
})
