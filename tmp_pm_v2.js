#!/usr/bin/env node
/**
 * 权限矩阵验证 — 正确处理 CSRF（double-submit cookie）
 * 1. 先 GET 一个端点拿 csrf-token cookie
 * 2. 所有后续请求带 Cookie + X-CSRF-Token header
 */
const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = process.env.JWT_SECRET;
function makeToken(userId, roleId, roleCode, manageAll, viewAll) {
  return jwt.sign({ userId, username: roleCode + '_user', roleId, roleCode, manageAll, viewAll },
    JWT_SECRET, { expiresIn: '1h' });
}

const ROLES = {
  boss:    { id: 1,  code: 'boss',      manageAll: true,  viewAll: true },
  manager: { id: 2,  code: 'manager',   manageAll: false, viewAll: true  },
  sales:   { id: 3,  code: 'sales',     manageAll: false, viewAll: false },
  finance: { id: 6,  code: 'finance',   manageAll: false, viewAll: true  },
};
const tokens = {};
for (const [name, r] of Object.entries(ROLES)) {
  tokens[name] = makeToken(100 + r.id, r.id, r.code, r.manageAll, r.viewAll);
}

function parseCookies(setCookie) {
  if (!setCookie) return {};
  const cookies = {};
  const parts = (Array.isArray(setCookie) ? setCookie : [setCookie]);
  for (const part of parts) {
    const [main] = part.split(';');
    const [k, v] = main.split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.trim());
  }
  return cookies;
}

function req(method, path, token, body, cookies, csrfToken) {
  return new Promise(resolve => {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (cookies && Object.keys(cookies).length) {
      headers['Cookie'] = Object.entries(cookies).map(([k,v]) => k + '=' + v).join('; ');
    }
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const opts = { hostname: '127.0.0.1', port: 5000, path, method, headers };
    const r = http.request(opts, res => {
      const nextCookies = parseCookies(res.headers['set-cookie']);
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d), cookies: nextCookies }); }
        catch { resolve({ status: res.statusCode, body: d, cookies: nextCookies }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: e.message, cookies: {} }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const MATRIX = [
  { group: '客户', name: 'list',    m: 'POST', p: '/api/v1/customers/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '客户', name: 'add',     m: 'POST', p: '/api/v1/customers/add',
    b: { company_name:'PM', contact:'X', phone:'1' },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '客户', name: 'assign',  m: 'POST', p: '/api/v1/customers/assign',
    b: { ids:[1], owner_id:2 },
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '客户', name: 'transfer', m: 'POST', p: '/api/v1/customers/transfer',
    b: { customer_id:1, new_owner_id:3, reason:'t' },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '公海', name: 'list',     m: 'POST', p: '/api/v1/pool',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '公海', name: 'claim',    m: 'POST', p: '/api/v1/pool/claim',
    b: { customer_id:1 },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '跟进', name: 'list',     m: 'POST', p: '/api/v1/follow-up/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '报价', name: 'list',     m: 'POST', p: '/api/v1/quote/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '报价', name: 'create',   m: 'POST', p: '/api/v1/quote/create',
    b: { customer_id:1, title:'PM_TEST' },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '合同', name: 'list',     m: 'POST', p: '/api/v1/contract/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '合同', name: 'create',   m: 'POST', p: '/api/v1/contract/create',
    b: { customer_id:1, title:'PM_TEST', amount:1 },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '财务', name: 'overview', m: 'GET',  p: '/api/v1/report/overview',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '财务', name: 'payments', m: 'POST', p: '/api/v1/contract/payment/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '竞品', name: 'list',     m: 'GET',  p: '/api/v1/competitor/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '竞品', name: 'add',      m: 'POST', p: '/api/v1/competitor/add',
    b: { name:'PM_TEST' },
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '报表', name: 'quick',    m: 'GET',  p: '/api/v1/report/quick-stats',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '报表', name: 'overdue',  m: 'GET',  p: '/api/v1/report/overdue-stats',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '系统', name: 'user',     m: 'POST', p: '/api/v1/user/list',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'role',     m: 'POST', p: '/api/v1/role/list',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'permission',m: 'GET', p: '/api/v1/permission/list',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'log list', m: 'POST', p: '/api/v1/log/list',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✓' } },
  { group: '系统', name: 'log exp',  m: 'POST', p: '/api/v1/log/export',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✓' } },
  { group: '商机', name: 'list',     m: 'POST', p: '/api/v1/opportunity/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '产品', name: 'list',     m: 'POST', p: '/api/v1/product/list',
    e: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '采购', name: 'list',     m: 'POST', p: '/api/v1/purchase/list',
    e: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
];

async function run() {
  console.log('=== HUAKEYCRM 权限矩阵验证 (double-submit CSRF) ===');
  console.log('时间:', new Date().toISOString());
  console.log('');

  // Step 1: 拿 CSRF token（先 GET 一个端点让服务端 set cookie）
  const initRes = await req('GET', '/api/v1/report/quick-stats', tokens.boss);
  const csrfCookies = initRes.cookies || {};
  const csrfToken = csrfCookies['csrf-token'];
  console.log('CSRF cookie:', csrfToken ? '✓' : '✗ 无');
  await new Promise(r => setTimeout(r, 50));

  let pass = 0, fail = 0;
  const results = [];

  for (const tc of MATRIX) {
    const row = { g: tc.group, n: tc.name, p: tc.m + ' ' + tc.p, checks: {} };
    for (const [role, expected] of Object.entries(tc.e)) {
      const r = await req(tc.m, tc.p, tokens[role], tc.b, csrfCookies, csrfToken);
      const isAllow = r.status >= 200 && r.status < 300;
      const actual = isAllow ? '✓' : (r.status === 403 ? '✗' : '✗(' + r.status + ')');
      const ok = actual === expected;
      row.checks[role] = { expected, actual, ok };
      if (ok) pass++; else fail++;
      await new Promise(r => setTimeout(r, 3));
    }
    results.push(row);
  }

  console.log('');
  console.log(`${'功能'.padEnd(14)} ${'API'.padEnd(35)} ${'boss'.padEnd(5)} ${'mgr'.padEnd(5)} ${'sales'.padEnd(5)} ${'fin'.padEnd(5)} 结果`);
  console.log('-'.repeat(85));
  let curGroup = '';
  for (const r of results) {
    const groupTag = r.g !== curGroup ? r.g.padEnd(8) : '        ';
    curGroup = r.g;
    const cells = [];
    let issues = [];
    for (const role of ['boss','manager','sales','finance']) {
      const c = r.checks[role];
      cells.push((c.ok ? '' : '✗') + c.actual.padEnd(3));
      if (!c.ok) issues.push(`${role}(${c.expected}≠${c.actual})`);
    }
    console.log(groupTag + r.n.padEnd(10) + r.p.substring(0,25).padEnd(32) + cells.join('  ') + ' ' + (issues.length ? '❌ ' + issues.join(',') : '✓'));
  }
  console.log('');
  console.log(`总计: ${pass} 通过 / ${fail} 失败 / ${pass+fail} 测试`);

  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error('FATAL:', e); process.exit(1); });
