#!/usr/bin/env node
/**
 * HUAKEYCRM 权限矩阵验证 — AGENTS.md Phase 20
 * 在 huakey-app 容器内 NODE_ENV=test 环境执行（自动跳过 CSRF）
 */

const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not set'); process.exit(1); }

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

function req(method, path, token, body) {
  return new Promise(resolve => {
    const opts = { hostname: '127.0.0.1', port: 5000, path, method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

/**
 * 权限矩阵
 * expected: { boss, manager, sales, finance }
 *   '✓' = 预期允许 (200/201)
 *   '✗' = 预期禁止 (403/404)
 */
const MATRIX = [
  // ======== 客户 ========
  { group: '客户', name: 'list',   method: 'POST', path: '/api/v1/customers/list',       expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '客户', name: 'add',    method: 'POST', path: '/api/v1/customers/add',         body: { company_name:'PM', contact:'X', phone:'1' },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '客户', name: 'assign', method: 'POST', path: '/api/v1/customers/assign',      body: { ids:[1], owner_id:2 },
    expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '客户', name: 'transfer', method: 'POST', path: '/api/v1/customers/transfer',  body: { customer_id:1, new_owner_id:3, reason:'t' },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 公海 ========
  { group: '公海', name: 'list',   method: 'POST', path: '/api/v1/pool',                  expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '公海', name: 'claim',  method: 'POST', path: '/api/v1/pool/claim',             body: { customer_id:1 },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 跟进 ========
  { group: '跟进', name: 'list',   method: 'POST', path: '/api/v1/follow-up/list',         expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 报价 ========
  { group: '报价', name: 'list',   method: 'POST', path: '/api/v1/quote/list',             expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '报价', name: 'create', method: 'POST', path: '/api/v1/quote/create',           body: { customer_id:1, title:'PM_TEST' },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 合同 ========
  { group: '合同', name: 'list',   method: 'POST', path: '/api/v1/contract/list',          expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '合同', name: 'create', method: 'POST', path: '/api/v1/contract/create',        body: { customer_id:1, title:'PM_TEST', amount:1 },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 财务 ========
  { group: '财务', name: 'overview', method: 'GET', path: '/api/v1/report/overview',       expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '财务', name: 'payments', method: 'POST', path: '/api/v1/contract/payment/list', expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },

  // ======== 竞品 ========
  { group: '竞品', name: 'list',   method: 'GET',  path: '/api/v1/competitor/list',         expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },
  { group: '竞品', name: 'add',    method: 'POST', path: '/api/v1/competitor/add',         body: { name:'PM_TEST' },
    expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 报表 ========
  { group: '报表', name: 'quick',  method: 'GET',  path: '/api/v1/report/quick-stats',      expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },
  { group: '报表', name: 'overdue', method: 'GET', path: '/api/v1/report/overdue-stats',     expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✓' } },

  // ======== 系统 ========
  { group: '系统', name: 'user list',   method: 'POST', path: '/api/v1/user/list',            expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'role list',   method: 'POST', path: '/api/v1/role/list',            expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'permission',  method: 'GET',  path: '/api/v1/permission/list',      expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
  { group: '系统', name: 'log list',    method: 'POST', path: '/api/v1/log/list',             expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✓' } },
  { group: '系统', name: 'log export',  method: 'POST', path: '/api/v1/log/export',           expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✓' } },

  // ======== 商机 ========
  { group: '商机', name: 'list',   method: 'POST', path: '/api/v1/opportunity/list',        expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 产品 ========
  { group: '产品', name: 'list',   method: 'POST', path: '/api/v1/product/list',            expected: { boss:'✓', manager:'✓', sales:'✓', finance:'✗' } },

  // ======== 采购 ========
  { group: '采购', name: 'list',   method: 'POST', path: '/api/v1/purchase/list',           expected: { boss:'✓', manager:'✓', sales:'✗', finance:'✗' } },
];

async function run() {
  console.log('=== HUAKEYCRM 权限矩阵验证 ===');
  console.log('时间:', new Date().toISOString(), '| NODE_ENV:', process.env.NODE_ENV);
  console.log('角色:', Object.keys(tokens).join(', '));
  console.log('');

  let pass = 0, fail = 0, skip = 0;
  const results = [];

  for (const tc of MATRIX) {
    const row = { group: tc.group, name: tc.name, path: tc.method + ' ' + tc.path, checks: {} };
    for (const [role, expected] of Object.entries(tc.expected)) {
      const r = await req(tc.method, tc.path, tokens[role], tc.body);
      const isAllow = r.status >= 200 && r.status < 300;
      const actual = isAllow ? '✓' : (r.status === 403 ? '✗' : '✗(' + r.status + ')');
      const ok = actual === expected;
      row.checks[role] = { expected, actual, ok };
      if (ok) pass++; else fail++;
      await new Promise(r => setTimeout(r, 5));
    }
    results.push(row);
  }

  // 表格
  console.log('```');
  console.log(`${'功能'.padEnd(14)} ${'API'.padEnd(38)} ${'boss'.padEnd(5)} ${'mgr'.padEnd(5)} ${'sales'.padEnd(5)} ${'fin'.padEnd(5)} 结果`);
  console.log('-'.repeat(85));
  let curGroup = '';
  for (const r of results) {
    const groupTag = r.group !== curGroup ? r.group.padEnd(8) : '        ';
    curGroup = r.group;
    const cells = [];
    let issues = [];
    for (const role of ['boss','manager','sales','finance']) {
      const c = r.checks[role];
      cells.push((c.ok ? '' : '✗') + c.actual.padEnd(3));
      if (!c.ok) issues.push(`${role}(${c.expected}≠${c.actual})`);
    }
    console.log(groupTag + r.name.padEnd(10) + r.path.substring(0,28).padEnd(30) + cells.join('  ') + ' ' + (issues.length ? '❌ ' + issues.join(',') : '✓'));
  }
  console.log('');
  console.log(`总计: ${pass} 通过 / ${fail} 失败 / ${pass+fail} 测试`);
  console.log('```');

  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error('FATAL:', e); process.exit(1); });
