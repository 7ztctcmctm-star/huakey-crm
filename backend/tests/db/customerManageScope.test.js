/**
 * P1-02：canManageCustomer 必须按 sys_data_permission 的 dept_and_sub 判定，
 * 不能把经理可管理范围写死为固定部门 ID。
 *
 * 真连库验证：
 *   · 本部门客户 → true
 *   · 子部门客户 → true
 *   · 无关部门客户 → false
 *   · 公海客户（owner_id IS NULL）→ 管理范围经理 true
 * 全部使用临时角色/部门/用户，结束后清理，不触碰存量数据。
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const customerDetailService = require('../../services/customerDetailService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const created = { users: [], depts: [], roles: [], perms: [] };

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
    console.warn(`[customerManageScope] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });
});

afterAll(async () => {
  if (!pool) return;
  try {
    for (const id of created.users) await pool.query('DELETE FROM sys_user WHERE id = ?', [id]);
    for (const id of created.perms) await pool.query('DELETE FROM sys_data_permission WHERE id = ?', [id]);
    for (const id of created.depts) await pool.query('DELETE FROM sys_dept WHERE id = ?', [id]);
    for (const id of created.roles) await pool.query('DELETE FROM sys_role WHERE id = ?', [id]);
  } catch (e) {
    console.warn(`[customerManageScope] 清理临时数据失败：${e.message}`);
  }
  await pool.end();
});

function token() {
  return `p102${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function insertDept(name, parentId = 0) {
  const [r] = await pool.query('INSERT INTO sys_dept (name, parent_id) VALUES (?, ?)', [name, parentId]);
  created.depts.push(r.insertId);
  return r.insertId;
}

async function insertRole(code) {
  const [r] = await pool.query(
    'INSERT INTO sys_role (name, code, status, view_all, manage_all) VALUES (?, ?, 1, 0, 0)',
    [code, code]
  );
  created.roles.push(r.insertId);
  return r.insertId;
}

async function insertUser(username, deptId, roleId) {
  const [r] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, dept_id, role_id, status)
     VALUES (?, 'x', ?, ?, ?, 1)`,
    [username, username, deptId, roleId]
  );
  created.users.push(r.insertId);
  return r.insertId;
}

async function insertScope(roleId, dataScope, customDeptIds = null) {
  const [r] = await pool.query(
    'INSERT INTO sys_data_permission (role_id, module, data_scope, custom_dept_ids) VALUES (?, ?, ?, ?)',
    [roleId, 'customer', dataScope, customDeptIds]
  );
  created.perms.push(r.insertId);
  return r.insertId;
}

describe('canManageCustomer 按 sys_data_permission 判定（真连库，P1-02）', () => {
  it('dept_and_sub：本部门/子部门可管理，无关部门不可管理', async () => {
    if (!reachable) return;

    const t = token();
    const roleId = await insertRole(`tmp_${t}`);
    await insertScope(roleId, 'dept_and_sub');

    const parentDept = await insertDept(`tmp_${t}_父`);
    const childDept = await insertDept(`tmp_${t}_子`, parentDept);
    const otherDept = await insertDept(`tmp_${t}_无关`);

    const managerId = await insertUser(`tmp_${t}_mgr`, parentDept, roleId);
    const sameDeptOwner = await insertUser(`tmp_${t}_same`, parentDept, roleId);
    const childDeptOwner = await insertUser(`tmp_${t}_child`, childDept, roleId);
    const otherDeptOwner = await insertUser(`tmp_${t}_other`, otherDept, roleId);

    const manager = { userId: managerId, roleId, manageAll: false };

    expect(await customerDetailService.canManageCustomer(pool, manager, sameDeptOwner)).toBe(true);
    expect(await customerDetailService.canManageCustomer(pool, manager, childDeptOwner)).toBe(true);
    expect(await customerDetailService.canManageCustomer(pool, manager, otherDeptOwner)).toBe(false);
  });

  it('dept：仅本部门可管理，子部门不可管理', async () => {
    if (!reachable) return;

    const t = token();
    const roleId = await insertRole(`tmp_${t}`);
    await insertScope(roleId, 'dept');

    const dept = await insertDept(`tmp_${t}_本`);
    const childDept = await insertDept(`tmp_${t}_子`, dept);
    const managerId = await insertUser(`tmp_${t}_mgr`, dept, roleId);
    const sameDeptOwner = await insertUser(`tmp_${t}_same`, dept, roleId);
    const childDeptOwner = await insertUser(`tmp_${t}_child`, childDept, roleId);

    const manager = { userId: managerId, roleId, manageAll: false };

    expect(await customerDetailService.canManageCustomer(pool, manager, sameDeptOwner)).toBe(true);
    expect(await customerDetailService.canManageCustomer(pool, manager, childDeptOwner)).toBe(false);
  });

  it('公海客户（owner_id IS NULL）：dept_and_sub 经理可维护', async () => {
    if (!reachable) return;

    const t = token();
    const roleId = await insertRole(`tmp_${t}`);
    await insertScope(roleId, 'dept_and_sub');
    const dept = await insertDept(`tmp_${t}_公海`);
    const managerId = await insertUser(`tmp_${t}_mgr`, dept, roleId);

    const manager = { userId: managerId, roleId, manageAll: false };
    expect(await customerDetailService.canManageCustomer(pool, manager, null)).toBe(true);
  });

  it('无 sys_data_permission 配置：fail-closed，仅本人', async () => {
    if (!reachable) return;

    const t = token();
    const roleId = await insertRole(`tmp_${t}`);
    const dept = await insertDept(`tmp_${t}_无配置`);
    const managerId = await insertUser(`tmp_${t}_mgr`, dept, roleId);
    const peerId = await insertUser(`tmp_${t}_peer`, dept, roleId);

    const manager = { userId: managerId, roleId, manageAll: false };
    expect(await customerDetailService.canManageCustomer(pool, manager, peerId)).toBe(false);
    expect(await customerDetailService.canManageCustomer(pool, manager, managerId)).toBe(true);
  });
});
