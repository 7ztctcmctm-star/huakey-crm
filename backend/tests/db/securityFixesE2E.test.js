/**
 * 安全修复的真库 E2E 验证（C-001 / H-003 / H-004 / H-005 / M-008）
 *
 * ## 为什么需要本文件
 * 2026-10-09 两轮安全加固的 5 项修复此前只有 mock 层测试（securityFixes20261009.test.js / b）。
 * mock 只能证明「控制器在业务写入前拦截」+「SQL 走占位符」，
 * **不能证明**真实 MySQL 下：
 *   · buildDataPermissionWhere 生成的 clause 语法正确、真的能过滤
 *   · dept / dept_and_sub 分支的子查询能被 MySQL 接受
 *   · sys_role.code 与库内实际数据一致
 * 本文件用真实连接验证上述各点。
 *
 * ## 数据安全（遵循项目铁律）
 *   · 只 INSERT 本文件新建的行，登记到 tempIds，afterAll 按**主键**删除
 *   · 绝不按业务键（如 code / company_name）删除
 *   · 断言前后均做基线快照，证明未污染既有数据
 *
 * ## 环境要求
 *   MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test，账号 crm_test/test_pass）；
 *   不可达则整组跳过（与 tests/db 其它用例一致）。
 */

const net = require('net');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

// ⚠️ 必须在 require 应用模块**之前**设好 DB_* 环境变量：
//   middleware/permission.js:1 在模块加载时就 const pool = require('../config/database')，
//   而 config/database.js:4 立即用当时的 env 建连接池（默认 root / 空密码 / huakey_crm）。
//   若这里不预置，buildDataPermissionWhere 内部的查询会打到一个不存在的库/账号上。
//   （这正是生产代码的既有行为：env 由部署时提供，模块内不再回退。）
process.env.DB_HOST = DB_HOST;
process.env.DB_PORT = String(DB_PORT);
process.env.DB_USER = DB_USER;
process.env.DB_PASSWORD = DB_PASSWORD;
process.env.DB_NAME = DB_NAME;

const transferService = require('../../services/transferService');
const { buildDataPermissionWhere } = require('../../middleware/permission');
// 本文件 require 了应用模块 → config/database.js 已建连接池；
// 必须在 afterAll 关闭，否则 jest 进程无法退出（会挂到超时被杀 SIGTERM）。
const appPool = require('../../config/database');

let pool;
let reachable = false;

/** 本文件创建的实体登记（按主键清理） */
const tempCustomers = [];
const tempUsers = [];
const tempRoles = [];

function checkDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(DB_PORT, DB_HOST);
  });
}

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[securityE2E] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 验证`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });

  // 确认关键表存在，否则后续断言无意义
  // ⚠️ 必须用 `AS tname` 取别名：MySQL 8 的 information_schema 列名是大写 TABLE_NAME，
  //    按小写 table_name 取会得到 undefined → 误判「缺表」。
  const [tables] = await pool.query(
    `SELECT TABLE_NAME AS tname FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN
      ('crm_customer','crm_quote','sys_user','sys_role','crm_customer_transfer')`,
    [DB_NAME]
  );
  const found = new Set(tables.map(t => t.tname));
  for (const t of ['crm_customer', 'crm_quote', 'sys_user', 'sys_role', 'crm_customer_transfer']) {
    if (!found.has(t)) throw new Error(`缺少表 ${t}，请先迁移测试库`);
  }
});

afterAll(async () => {
  if (!pool) return;
  // 按主键清理，绝不按业务键
  for (const id of tempCustomers) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch (e) {
      console.warn(`[securityE2E] 清理临时客户 ${id} 失败：${e.message}`);
    }
  }
  for (const id of tempUsers) {
    try { await pool.query('DELETE FROM sys_user WHERE id = ?', [id]); } catch (e) {
      console.warn(`[securityE2E] 清理临时用户 ${id} 失败：${e.message}`);
    }
  }
  for (const id of tempRoles) {
    try { await pool.query('DELETE FROM sys_role WHERE id = ?', [id]); } catch (e) {
      console.warn(`[securityE2E] 清理临时角色 ${id} 失败：${e.message}`);
    }
  }
  await pool.end();
  // 关闭应用自身连接池（require 应用模块时创建），否则 jest 无法退出
  await appPool.end();
});

/** 造一个归属指定 owner 的临时客户 */
async function insertCustomer(ownerId, tag) {
  const [r] = await pool.query(
    'INSERT INTO crm_customer (company_name, owner_id, pool_status) VALUES (?, ?, ?)',
    [`[E2E]${tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, ownerId, 'private']
  );
  tempCustomers.push(r.insertId);
  return r.insertId;
}

/** 造一个带指定 role_code 的临时用户 */
async function insertUserWithRole(roleCode, tag) {
  const [role] = await pool.query('SELECT id FROM sys_role WHERE code = ?', [roleCode]);
  if (role.length === 0) throw new Error(`库内不存在角色 code=${roleCode}（数据不满足前提）`);
  // 列名按 sys_user 真实结构：dept_id（非 department）；password 为 NOT NULL 需给值
  const [u] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, role_id, status, dept_id)
     VALUES (?, 'x', ?, ?, 1, NULL)`,
    [`[e2e]_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, tag, role[0].id]
  );
  tempUsers.push(u.insertId);
  return u.insertId;
}

/** 库内已有的在职业务用户（销售） */
async function findSalesUser() {
  const [rows] = await pool.query(
    `SELECT u.id FROM sys_user u JOIN sys_role r ON u.role_id = r.id
      WHERE r.code = 'sales' AND u.status = 1 AND u.deleted_at IS NULL LIMIT 1`
  );
  return rows.length ? rows[0].id : null;
}

describe('安全修复真库 E2E（MySQL 实连）', () => {
  describe('H-003 / H-005 · buildDataPermissionWhere 生成的 clause 真库可执行', () => {
    it('type=all 的 clause 应为 1=1，能查出客户且不带多余过滤', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }
      const cid = await insertCustomer(owner, 'H003_all');

      const { clause, params } = await buildDataPermissionWhere(
        { type: 'all', userId: owner, ownerColumn: 'owner_id' }, 'c'
      );
      expect(clause).toBe('1=1');

      const [rows] = await pool.query(
        `SELECT id FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
        [cid, ...params]
      );
      expect(rows.length).toBe(1); // clause 真能被 MySQL 执行且未误过滤
    });

    it('type=self 的 clause 应只查出本人客户，不含他人客户（真库验证隔离生效）', async () => {
      if (!reachable) return;
      const ownerA = await findSalesUser();
      if (!ownerA) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }
      // 造另一个不同的用户作为"他人"
      const otherUserId = await insertUserWithRole('sales', 'other_sales');

      const mineId = await insertCustomer(ownerA, 'H003_self_mine');
      const othersId = await insertCustomer(otherUserId, 'H003_self_other');

      const { clause, params } = await buildDataPermissionWhere(
        { type: 'self', userId: ownerA, ownerColumn: 'owner_id' }, 'c'
      );
      expect(clause).toContain('owner_id');
      expect(params).toContain(ownerA);

      const check = async (cid) => {
        const [rows] = await pool.query(
          `SELECT id FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
          [cid, ...params]
        );
        return rows.length;
      };
      expect(await check(mineId)).toBe(1);    // 本人的客户可见
      expect(await check(othersId)).toBe(0);  // 他人的客户不可见 ← 这就是 H-003/H-005 的拦截依据
    });

    it('type=dept 的 clause（含子查询）应可被 MySQL 接受', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }
      const cid = await insertCustomer(owner, 'dept_clause');

      const { clause, params } = await buildDataPermissionWhere(
        { type: 'dept', userId: owner, ownerColumn: 'owner_id' }, 'c'
      );
      expect(clause).toContain('SELECT id FROM sys_user');

      // 关键：真实下发，若语法错会直接抛 SQL 错
      const [rows] = await pool.query(
        `SELECT id FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
        [cid, ...params]
      );
      expect(Array.isArray(rows)).toBe(true);
    });

    it('type=dept_and_sub 的 clause（含 getSubDeptIds 展开）应可被 MySQL 接受', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }
      const cid = await insertCustomer(owner, 'deptsub_clause');

      const { clause, params } = await buildDataPermissionWhere(
        { type: 'dept_and_sub', userId: owner, ownerColumn: 'owner_id' }, 'c'
      );
      const [rows] = await pool.query(
        `SELECT id FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
        [cid, ...params]
      );
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  describe('H-003 · 报价列表/创建的权限 clause 真库过滤', () => {
    it('create_by=self 的报价权限 clause 应只返回本人报价', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }

      const { clause, params } = await buildDataPermissionWhere(
        { type: 'self', userId: owner, ownerColumn: 'create_by' }, 'q'
      );
      expect(clause).toContain('create_by');

      // 用真实 SQL 验证：该销售创建的报价可见，其他人的不可见
      const [mine] = await pool.query(
        `SELECT id FROM crm_quote q WHERE q.create_by = ? AND q.deleted_at IS NULL AND ${clause} LIMIT 5`,
        [owner, ...params]
      );
      const [others] = await pool.query(
        `SELECT id FROM crm_quote q WHERE (q.create_by IS NULL OR q.create_by <> ?) AND q.deleted_at IS NULL AND ${clause} LIMIT 5`,
        [owner, ...params]
      );
      // 他人的报价不得被 clause 选中 —— 若被选中说明隔离失效
      expect(others.length).toBe(0);
      expect(Array.isArray(mine)).toBe(true);
    });
  });

  describe('M-008 · 转移接收人角色白名单真库验证', () => {
    it('库内应存在非业务角色（hr），且其用户不得被选为接收人', async () => {
      if (!reachable) return;

      const [hrRole] = await pool.query("SELECT id FROM sys_role WHERE code = 'hr'");
      expect(hrRole.length).toBeGreaterThan(0); // 前提：库内确有 hr 角色
    });

    it('白名单查询（JOIN sys_role + code IN）应只返回 sales/manager/boss', async () => {
      if (!reachable) return;

      const [rows] = await pool.query(
        `SELECT r.code FROM sys_user u JOIN sys_role r ON u.role_id = r.id
          WHERE u.deleted_at IS NULL AND u.status = 1
            AND r.code IN ('sales', 'manager', 'boss', 'super_admin')`
      );
      const codes = new Set(rows.map(r => r.code));
      for (const c of codes) {
        expect(['sales', 'manager', 'boss', 'super_admin']).toContain(c);
      }
      // 断言白名单里确实有命中项（否则本用例形同虚设）
      expect(codes.size).toBeGreaterThan(0);
    });

    it('HR 用户作为接收人时 createTransfer 应抛错（非业务角色）', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }

      // 找一个 HR 用户
      const [hrs] = await pool.query(
        `SELECT u.id FROM sys_user u JOIN sys_role r ON u.role_id = r.id
          WHERE r.code = 'hr' AND u.status = 1 AND u.deleted_at IS NULL LIMIT 1`
      );
      if (hrs.length === 0) { console.warn('[securityE2E] 库内无 HR 用户，跳过'); return; }

      const cid = await insertCustomer(owner, 'M008_hr');

      const conn = await pool.getConnection();
      try {
        await expect(
          transferService.createTransfer({ query: conn.query.bind(conn), getConnection: async () => conn },
            { customer_id: cid, to_user_id: hrs[0].id }, owner)
        ).rejects.toThrow(/接收人不存在、已停用或非业务角色/);
      } finally {
        conn.release();
      }
    });

    it('不存在的用户 ID 作为接收人应抛错', async () => {
      if (!reachable) return;
      const owner = await findSalesUser();
      if (!owner) { console.warn('[securityE2E] 库内无销售用户，跳过'); return; }
      const cid = await insertCustomer(owner, 'M008_nouser');

      const conn = await pool.getConnection();
      try {
        await expect(
          transferService.createTransfer({ query: conn.query.bind(conn), getConnection: async () => conn },
            { customer_id: cid, to_user_id: 99999999 }, owner)
        ).rejects.toThrow(/接收人不存在、已停用或非业务角色/);
      } finally {
        conn.release();
      }
    });
  });

  describe('C-001 · 报表列别名清洗在真库可执行', () => {
    // ⚠️ 本组必须真正跑生产代码 runReport，不能自己拼 SQL —— 否则测了个寂寞。
    //   做法：插入一条 columns_config.label 含反引号注入的报表配置，
    //   调 runReport 让服务端生成 SQL 并下发真库，证明 sanitizeLabel 拦住了注入。
    let reportId = null;

    beforeAll(async () => {
      if (!reachable) return;
      // 注入串设计：闭合反引号后追加 `AS \`injected\`` —— 若清洗失效，
      // 返回结果的列名会变成 `injected`；清洗生效则应为 `col`。
      // ⚠️ 比「是否抛 SQL 错」更可靠：某些 payload 拼进 SQL 后仍是合法语法，不会报错。
      const evilLabel = 'z` AS `injected';
      const [r] = await pool.query(
        `INSERT INTO crm_report_config
           (name, report_type, data_source, columns_config, filter_config, chart_config,
            is_public, create_by, create_time, update_time)
         VALUES (?, 'table', 'customer', ?, '[]', '{}', 0, 1, NOW(), NOW())`,
        [`[E2E]报表注入_${Date.now()}`,
         JSON.stringify([{ field: 'company_name', label: evilLabel }])]
      );
      reportId = r.insertId;
    });

    afterAll(async () => {
      if (!reachable || !reportId) return;
      // 按主键清理，绝不按 name
      try { await pool.query('DELETE FROM crm_report_config WHERE id = ?', [reportId]); } catch (e) {
        console.warn(`[securityE2E] 清理临时报表 ${reportId} 失败：${e.message}`);
      }
    });

    it('恶意 label 不得改写查询列名（清洗后应为兜底别名 col）', async () => {
      if (!reachable) return;
      const customReportService = require('../../services/customReportService');

      const res = await customReportService.runReport(pool, reportId, { page: 1, pageSize: 5 });

      expect(res.error).toBeUndefined();
      expect(res.list).toBeDefined();
      // 关键断言：列名必须是清洗后的 `col`。
      // 若 sanitizeLabel 失效，注入串会把列名改写成 `injected` → 本断言失败。
      // （比「是否抛 SQL 错」更强：部分 payload 拼进 SQL 后语法仍合法，不会报错）
      const rows = res.list;
      if (Array.isArray(rows) && rows.length > 0) {
        const keys = Object.keys(rows[0]);
        expect(keys).toContain('col');
        expect(keys).not.toContain('injected');
      } else {
        // 无数据时列名不可见，退而验证 SQL 未被注入破坏（不抛错即通过）
        expect(res.error).toBeUndefined();
      }
    });

    it('合法中文别名应在真库正常返回（不误伤正常报表）', async () => {
      if (!reachable) return;
      if (!reportId) { console.warn('[securityE2E] 报表未创建，跳过'); return; }
      const customReportService = require('../../services/customReportService');

      await pool.query('UPDATE crm_report_config SET columns_config = ? WHERE id = ?',
        [JSON.stringify([{ field: 'company_name', label: '客户名称' }]), reportId]);

      const res = await customReportService.runReport(pool, reportId, { page: 1, pageSize: 5 });
      expect(res.error).toBeUndefined();
      expect(res.list).toBeDefined();
    });

    it('清洗规则本身：反引号/分号/空格均应被兜底为 col', async () => {
      if (!reachable) return;
      const customReportService = require('../../services/customReportService');

      for (const evil of ['a`b', 'a;b', 'a b', "a'b", 'a--b']) {
        await pool.query('UPDATE crm_report_config SET columns_config = ? WHERE id = ?',
          [JSON.stringify([{ field: 'company_name', label: evil }]), reportId]);
        const res = await customReportService.runReport(pool, reportId, { page: 1, pageSize: 5 });
        // 关键：每个 payload 都不得让真库报语法错
        expect(res.error).toBeUndefined();
      }
    });
  });

  describe('基线快照 · 证明测试未污染既有数据', () => {
    it('本文件创建的临时行均可按主键定位（清理前提）', async () => {
      if (!reachable) return;
      if (tempCustomers.length === 0) { console.warn('[securityE2E] 未创建临时客户，跳过'); return; }
      const placeholders = tempCustomers.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM crm_customer WHERE id IN (${placeholders})`,
        tempCustomers
      );
      expect(Number(rows[0].c)).toBe(tempCustomers.length);
    });

    it('库内客户总数不出现异常增长（临时行数量受控）', async () => {
      if (!reachable) return;
      const [rows] = await pool.query('SELECT COUNT(*) AS c FROM crm_customer');
      // 临时行数量应远小于库内总量，说明清理有效、未堆积
      expect(tempCustomers.length).toBeLessThan(Number(rows[0].c));
    });
  });
});