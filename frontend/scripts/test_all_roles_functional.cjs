const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5173';
const PASSWORD = 'Temp@1234';
const CAPTCHA = 'abcd';
const OUT_DIR = path.join(__dirname, '..', '..', 'tmp', 'all-roles-test');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ROLES = [
  {
    code: 'boss',
    username: '_tmp_boss_01',
    expectAccessible: ['/dashboard', '/customer/list', '/opportunity', '/quotation', '/contract', '/system/user', '/report', '/settings'],
    expectDenied: []
  },
  {
    code: 'manager',
    username: '_tmp_manager_01',
    expectAccessible: ['/dashboard', '/customer/list', '/opportunity', '/quotation', '/contract', '/report'],
    expectDenied: ['/system/user', '/settings']
  },
  {
    code: 'hr',
    username: '_tmp_hr_01',
    expectAccessible: ['/dashboard', '/hr/employees', '/system/user'],
    expectDenied: ['/customer/list', '/opportunity', '/report', '/settings']
  },
  {
    code: 'purchase',
    username: '_tmp_purchaser_01',
    expectAccessible: ['/dashboard', '/purchase/list', '/supplier/list', '/product'],
    expectDenied: ['/customer/list', '/opportunity', '/report', '/settings']
  },
  {
    code: 'finance',
    username: '_tmp_finance_01',
    expectAccessible: ['/dashboard', '/payment', '/report'],
    expectDenied: ['/customer/list', '/opportunity', '/system/user', '/settings']
  },
  {
    code: 'engineer',
    username: '_tmp_engineer_01',
    expectAccessible: ['/dashboard', '/service', '/product'],
    expectDenied: ['/customer/list', '/opportunity', '/report', '/system/user', '/settings']
  }
];

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitStable(page) {
  await page.waitForLoadState('load', { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function testRole(browser, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const report = {
    role: role.code,
    username: role.username,
    login: { success: false, message: '', apiSuccess: false },
    menus: [],
    pages: []
  };

  try {
    page.on('console', msg => console.log(`[${role.code}]`, msg.type(), msg.text()));

    // 登录
    await page.goto(`${BASE_URL}/login`);
    await waitStable(page);

    await page.getByPlaceholder('请输入用户名').fill(role.username);
    await page.getByPlaceholder('请输入密码').fill(PASSWORD);
    await page.getByPlaceholder('请输入验证码').fill(CAPTCHA);

    let loginResponse = null;
    page.on('response', async res => {
      if (res.url().includes('/auth/login') && res.request().method() === 'POST') {
        try { loginResponse = await res.json(); } catch {}
      }
    });

    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 10000 });

    if (loginResponse) {
      report.login.apiSuccess = loginResponse.code === 200;
    }

    // 访问 dashboard 后稳定页面
    await page.goto(`${BASE_URL}/dashboard`);
    await waitStable(page);

    report.login.success = !page.url().includes('/login');
    report.login.currentUrl = page.url();

    // 提取菜单
    const menuItems = await page.locator('.el-menu-item, .el-sub-menu__title').allInnerTexts();
    report.menus = menuItems.map(t => t.trim()).filter(Boolean);

    await screenshot(page, `${role.code}-dashboard`);

    // 测试页面
    const tests = [
      ...role.expectAccessible.map(route => ({ route, expectAccessible: true })),
      ...role.expectDenied.map(route => ({ route, expectAccessible: false }))
    ];

    for (const t of tests) {
      try {
        await page.goto(`${BASE_URL}${t.route}`);
        await waitStable(page);
        const url = page.url();
        const forbiddenLocator = page.locator('text=403').or(page.locator('text=无权限')).or(page.locator('text=Forbidden'));
        const hasForbidden = await forbiddenLocator.count() > 0;
        const isLogin = url.includes('/login');
        const accessible = url.includes(t.route) && !hasForbidden && !isLogin;
        const passed = accessible === t.expectAccessible;
        report.pages.push({
          route: t.route,
          accessible,
          expected: t.expectAccessible,
          passed
        });
      } catch (e) {
        report.pages.push({ route: t.route, error: e.message, passed: false });
      }
    }
  } catch (e) {
    report.login.success = false;
    report.login.message = e.message;
    await screenshot(page, `${role.code}-error`);
  }

  await context.close();
  return report;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const reports = [];

  for (const role of ROLES) {
    console.log(`\n=== 测试角色: ${role.code} ===`);
    const report = await testRole(browser, role);
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    roles: reports.map(r => ({
      role: r.role,
      loginOk: r.login.success,
      pagePassed: r.pages.filter(p => p.passed).length,
      pageTotal: r.pages.length,
      pageFailed: r.pages.filter(p => !p.passed).map(p => ({ route: p.route, expected: p.expected, accessible: p.accessible }))
    }))
  };

  const reportFile = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify({ summary, reports }, null, 2));
  console.log('\n=== 总体摘要 ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nScreenshots saved to: ${OUT_DIR}`);
})();
