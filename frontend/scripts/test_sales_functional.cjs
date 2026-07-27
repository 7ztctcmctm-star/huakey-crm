const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5173';
const USERNAME = 'Ken';
const PASSWORD = 'Sales@1234';
const CAPTCHA = 'abcd';
const OUT_DIR = path.join(__dirname, '..', '..', 'tmp', 'sales-test');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const report = {
    login: { success: false, message: '', apiSuccess: false, permissions: [] },
    menus: [],
    pages: []
  };

  try {
    // 辅助：等待页面稳定（load + 短暂等待，避免 SSE/轮询导致 networkidle 超时）
    const waitStable = async (p) => {
      await p.waitForLoadState('load', { timeout: 15000 });
      await p.waitForTimeout(1500);
    };

    page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) console.log('[navigate]', frame.url());
    });

    // 1. 登录
    await page.goto(`${BASE_URL}/login`);
    await waitStable(page);

    await page.getByPlaceholder('请输入用户名').fill(USERNAME);
    await page.getByPlaceholder('请输入密码').fill(PASSWORD);
    await page.getByPlaceholder('请输入验证码').fill(CAPTCHA);

    // 捕获登录接口响应
    let loginResponse = null;
    page.on('response', async res => {
      if (res.url().includes('/auth/login') && res.request().method() === 'POST') {
        try { loginResponse = await res.json(); } catch {}
      }
    });

    await page.getByRole('button', { name: '登录' }).click();

    // 等待登录请求完成并离开登录页
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 10000 });
    if (loginResponse) {
      console.log('[loginResponse]', JSON.stringify(loginResponse));
      report.login.apiSuccess = loginResponse.code === 200;
      report.login.permissions = loginResponse.data?.userInfo?.permissions || [];
    }

    // 手动进入销售有权限的客户列表页（避免 dashboard 统计接口 403 干扰）
    await page.goto(`${BASE_URL}/customer/list`);
    await page.waitForURL(/\/customer\/list/, { timeout: 15000 });
    await waitStable(page);

    report.login.success = page.url().includes('/customer/list');
    report.login.currentUrl = page.url();
    await screenshot(page, '01-after-login-redirect');

    // 2. 提取左侧菜单文本
    const menuItems = await page.locator('.el-menu-item, .el-sub-menu__title').allInnerTexts();
    report.menus = menuItems.map(t => t.trim()).filter(Boolean);

    // 3. 测试核心页面加载情况
    const testPages = [
      { route: '/customer/list', name: '正式客户列表', expectAccessible: true },
      { route: '/customer/prospects', name: '潜客池', expectAccessible: true },
      { route: '/opportunity', name: '商机管理', expectAccessible: true },
      { route: '/quotation', name: '报价管理', expectAccessible: true },
      { route: '/follow-up/today', name: '今日待跟进', expectAccessible: false },
      { route: '/contract', name: '合同管理', expectAccessible: true },
      { route: '/settings', name: '系统设置', expectAccessible: false },
      { route: '/system/user', name: '用户管理（管理员）', expectAccessible: false },
      { route: '/system/log', name: '操作日志（管理员）', expectAccessible: false },
      { route: '/report', name: '数据报表（管理员）', expectAccessible: false },
    ];

    for (const p of testPages) {
      try {
        await page.goto(`${BASE_URL}${p.route}`);
        await waitStable(page);
        const url = page.url();
        const title = await page.title();
        const forbiddenLocator = page.locator('text=403').or(page.locator('text=无权限')).or(page.locator('text=Forbidden'));
        const hasForbidden = await forbiddenLocator.count() > 0;
        const isLogin = url.includes('/login');
        const accessible = url.includes(p.route) && !hasForbidden && !isLogin;
        const file = await screenshot(page, `page-${p.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}`);
        report.pages.push({
          name: p.name,
          route: p.route,
          finalUrl: url,
          title,
          accessible,
          expected: p.expectAccessible,
          passed: accessible === p.expectAccessible,
          screenshot: file
        });
      } catch (e) {
        report.pages.push({ name: p.name, route: p.route, error: e.message, passed: false });
      }
    }
  } catch (e) {
    report.login.success = false;
    report.login.message = e.message;
    await screenshot(page, '00-login-error');
  }

  await browser.close();

  const reportFile = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Screenshots saved to: ${OUT_DIR}`);
})();
