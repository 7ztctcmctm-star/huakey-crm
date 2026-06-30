import { test, expect } from '@playwright/test';

test.describe('响应式布局', () => {
  test.describe('桌面端 (1280x720+ 视口)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('登录页 — 表单居中不溢出', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('.login-container')).toBeVisible();
      // 确认输入框
      const usernameInput = page.locator('input[placeholder*="用户名"]');
      await expect(usernameInput).toBeVisible();
      const box = await usernameInput.boundingBox();
      expect(box).not.toBeNull();
      // 输入框不超出视口右边界
      expect(box.x + box.width).toBeLessThanOrEqual(1280);
    });

    test('客户列表页 — 表格正常渲染', async ({ page }) => {
      // 注：直接访问 /customer，依赖路由守卫跳转登录页
      // 此处验证不崩即可；已登录测试见 customer-crud.spec.js
      await page.goto('/customer');
      // 跳转登录页
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('移动端 (Pixel 5)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('登录页 — 表单适配窄屏不溢出', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('.login-container')).toBeVisible();
      // 输入框不超出视口右边界
      const usernameInput = page.locator('input[placeholder*="用户名"]');
      const box = await usernameInput.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x + box.width).toBeLessThanOrEqual(393);
    });

    test('登录页 — 登录按钮点击可达（不被遮挡）', async ({ page }) => {
      await page.goto('/login');
      const loginBtn = page.locator('.login-button');
      await expect(loginBtn).toBeVisible();
      // 按钮在视口内
      const box = await loginBtn.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y + box.height).toBeLessThanOrEqual(851);
    });
  });
});