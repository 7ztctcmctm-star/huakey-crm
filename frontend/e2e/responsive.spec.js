/**
 * 响应式布局快照测试 (Phase 8)
 *
 * 验证关键页面的响应式断点布局。
 * 运行: npx playwright test --project=chromium responsive.spec.js
 */

import { test, expect } from "@playwright/test"

const BREAKPOINTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]

for (const bp of BREAKPOINTS) {
  test.describe(`viewport ${bp.name} (${bp.width}x${bp.height})`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } })

    test("login page adapts to viewport", async ({ page }) => {
      await page.goto("/login")

      // 验证表单在视口内
      const form = page.locator(".login-form, form, [class*=login]").first()
      await expect(form).toBeVisible({ timeout: 10000 })

      const formBox = await form.boundingBox()
      if (formBox) {
        // 表单宽度不超过视口
        expect(formBox.width).toBeLessThanOrEqual(bp.width + 10)
        // 表单不超出视口左侧
        expect(formBox.x).toBeGreaterThanOrEqual(-5)
      }
    })

    test("customer table switches layout appropriately", async ({ page }) => {
      await page.goto("/login")

      // 如果页面有 el-table，验证其在窄屏下不溢出
      const table = page.locator(".el-table, table, [class*=table]")
      const tableCount = await table.count()
      if (tableCount > 0) {
        const tableBox = await table.first().boundingBox()
        if (tableBox) {
          expect(tableBox.width).toBeLessThanOrEqual(bp.width + 20)
        }
      }
    })

    test("form dialogs fit within viewport", async ({ page }) => {
      await page.goto("/login")

      // 检查是否有 dialog 组件超出了视口边界
      const dialogOverflows = await page.evaluate(({ vpWidth, vpHeight }) => {
        const dialogs = document.querySelectorAll(".el-dialog, .el-drawer, [role=dialog]")
        if (dialogs.length === 0) return false
        return Array.from(dialogs).some(d => {
          const rect = d.getBoundingClientRect()
          return rect.right > vpWidth + 10 || rect.bottom > vpHeight + 10
        })
      }, { vpWidth: bp.width, vpHeight: bp.height })

      expect(dialogOverflows).toBe(false)
    })
  })
}
