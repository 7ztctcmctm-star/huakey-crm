#!/usr/bin/env node
// 脚本：用 boss token + CSRF 扫真实路径
const jwt = require('jsonwebtoken');
const http = require('http');

const TOKEN = jwt.sign(
  { userId: 101, username: 'boss', roleId: 1, roleCode: 'boss', manageAll: true, viewAll: true },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

function req(method, path, cookie) {
  return new Promise(resolve => {
    const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
    if (cookie) {
      const [name, val] = cookie.split('=');
      headers['Cookie'] = cookie;
      headers['X-CSRF-Token'] = val;
    }
    const r = http.request({ hostname: '127.0.0.1', port: 5000, path, method, headers }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        const sc = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, body: d.substring(0, 120), setCookie: sc.find(x => x.includes('csrf')) });
      });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    r.end(method === 'POST' ? '{}' : undefined);
  });
}

async function run() {
  // Step 1: get csrf cookie
  const init = await req('GET', '/api/v1/report/quick-stats');
  let csrfCookie = '';
  if (init.setCookie) csrfCookie = init.setCookie.split(';')[0];
  console.log('CSRF:', csrfCookie || '✗');

  const paths = [
    'POST /api/v1/customers/list',
    'POST /api/v1/customer/list',
    'POST /api/v1/customers',
    'POST /api/v1/pool',
    'POST /api/v1/pool/list',
    'POST /api/v1/quote/list',
    'POST /api/v1/contract/list',
    'POST /api/v1/contracts/list',
    'POST /api/v1/opportunity/list',
    'POST /api/v1/product/list',
    'POST /api/v1/purchase/list',
    'POST /api/v1/competitor/list',
    'POST /api/v1/follow-up/list',
    'POST /api/v1/user/list',
    'POST /api/v1/role/list',
    'POST /api/v1/log/list',
    'POST /api/v1/customer/add',
    'POST /api/v1/customers/add',
  ];

  for (const p of paths) {
    const [method, path] = p.split(' ');
    const r = await req(method, path, csrfCookie);
    const mark = r.status >= 200 && r.status < 300 ? '✓' : r.status;
    console.log(mark.toString().padStart(5), p);
    // CSRF cookie 自动续期
    if (r.setCookie) csrfCookie = r.setCookie.split(';')[0];
    await new Promise(s => setTimeout(s, 5));
  }
  process.exit(0);
}
run();
