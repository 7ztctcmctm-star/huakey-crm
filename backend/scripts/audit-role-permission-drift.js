/**
 * audit-role-permission-drift.js —— 角色授权漂移审计（只读）
 *
 * 【为什么需要它】
 *   `backend/scripts/init_role_permissions.js` 是角色的「授权事实来源」之一，
 *   它的第 340 行会 `DELETE FROM sys_role_permission WHERE role_id = ?`
 *   然后**按硬编码清单重建**。而权限码还有第二个来源：`database/migrations/*.sql`。
 *   两者不同步时，每次部署（deploy.sh 步骤 [11/12] 会跑这个脚本）
 *   都会把迁移刚授予的权限码**清掉**。
 *
 *   本脚本把「脚本清单」与「数据库实际授权」做差集，回答：
 *     · 下次部署会**丢掉**哪些授权（DB 有、清单无）→ 静默功能失效
 *     · 下次部署会**新增**哪些授权（清单有、DB 无）
 *     · 清单里有、DB 里没有的角色（脚本是否会创建）
 *
 * 【用法】
 *   cd backend && node scripts/audit-role-permission-drift.js [dbName]
 *   dbName 缺省取 .env.test 推导（huakey_crm_test）；也可显式传 huakey_crm
 *
 * 【退出码】始终 0（审计工具，不因发现漂移而失败）
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env.test'), quiet: true });
const mysql = require('mysql2/promise');

const SCRIPT_PATH = path.join(__dirname, 'init_role_permissions.js');

/** 解析 ROLE_PERMISSIONS 字面量：role: [ 'a', 'b', ... ] */
function parseRolePermissions(src) {
  const start = src.indexOf('const ROLE_PERMISSIONS');
  if (start === -1) throw new Error('未找到 ROLE_PERMISSIONS 定义');
  const body = src.slice(start);
  // 逐个角色块提取：两空格缩进的 `roleName: [` ... `],`
  const re = /^ {2}([A-Za-z_][\w]*):\s*\[([\s\S]*?)^ {2}\],?/gm;
  const out = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    const codes = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    out[m[1]] = new Set(codes);
  }
  return out;
}

(async () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const wanted = parseRolePermissions(src);
  const createsRoles = /INSERT[^;]*INTO\s+sys_role\b/i.test(src);

  const db = process.argv[2] || 'huakey_crm_test';
  console.log(`审计目标库：${db}`);
  console.log(`脚本清单包含角色：${Object.keys(wanted).join(', ')}`);
  console.log(`脚本是否创建角色（INSERT INTO sys_role）：${createsRoles ? '是' : '否'}`);
  console.log('');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: db
  });

  const [roles] = await conn.query('SELECT id, code, manage_all FROM sys_role ORDER BY id');
  const [grants] = await conn.query(
    `SELECT r.code AS role_code, p.code AS perm_code
       FROM sys_role_permission rp
       JOIN sys_role r ON r.id = rp.role_id
       JOIN sys_permission p ON p.id = rp.permission_id`
  );

  const dbGrants = {};
  for (const g of grants) {
    (dbGrants[g.role_code] ||= new Set()).add(g.perm_code);
  }

  const dbRoleCodes = new Set(roles.map(r => r.code));
  let totalLost = 0;
  let totalAdded = 0;

  for (const r of roles) {
    const dbSet = dbGrants[r.code] || new Set();
    const wantSet = wanted[r.code];
    if (!wantSet) {
      console.log(`【${r.code}】清单中无此角色 → 脚本不会动它的授权（${dbSet.size} 个码保持不变）`);
      continue;
    }
    const lost = [...dbSet].filter(c => !wantSet.has(c)).sort();
    const added = [...wantSet].filter(c => !dbSet.has(c)).sort();
    totalLost += lost.length;
    const note = r.manage_all ? '  ⚠️ manageAll=1，权限校验会被整体绕过，漂移对其无实际影响' : '';
    console.log(`【${r.code}】DB ${dbSet.size} 个 / 清单 ${wantSet.size} 个${note}`);
    if (lost.length) {
      console.log(`  ❗ 下次部署将【丢失】${lost.length} 个授权（功能静默失效）:`);
      lost.forEach(c => console.log(`     - ${c}`));
    }
    if (added.length) {
      console.log(`  ➕ 下次部署将【新增】${added.length} 个授权:`);
      added.slice(0, 20).forEach(c => console.log(`     + ${c}`));
      if (added.length > 20) console.log(`     ... 其余 ${added.length - 20} 个省略`);
    }
    if (!lost.length && !added.length) console.log('  ✅ 无漂移');
  }

  const missingRoles = Object.keys(wanted).filter(c => !dbRoleCodes.has(c));
  if (missingRoles.length) {
    console.log('');
    console.log(`⚠️ 清单中声明但库中不存在的角色：${missingRoles.join(', ')}`);
    if (!createsRoles) {
      console.log('   而脚本【不会创建角色】→ 这些角色的授权在当前库中永远不会被建立；');
      console.log('   若业务依赖它们（如 sales/manager），说明角色创建环节缺失。');
    }
  }

  console.log('');
  console.log(`=== 汇总：将丢失 ${totalLost} 个既有授权 ===`);
  await conn.end();
})().catch(e => { console.error('审计脚本异常:', e.message); process.exit(2); });
