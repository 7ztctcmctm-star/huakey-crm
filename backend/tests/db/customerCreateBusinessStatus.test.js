/**
 * P0-12：新建/导入客户必须同时写 business_status，否则正式客户会落在线索池。
 *
 * 本文件真连库验证两条写路径：
 *   ① importService → customerService.systemCreateImportedCustomer
 *   ② 手工新增 → customerDetailService.addCustomer（自动分配负责人路径）
 * 并断言结果能从 `listFormalCustomers`（正式客户列表的数据源）查到。
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const customerService = require('../../services/customerService');
const customerDetailService = require('../../services/customerDetailService');

jest.mock('../../services/assignService', () => ({ autoAssignOwner: jest.fn() }));
const { autoAssignOwner } = require('../../services/assignService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const tempIds = [];

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
    console.warn(`[customerCreateBusinessStatus] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });
});

afterAll(async () => {
  if (!pool) return;
  for (const id of tempIds) {
    try {
      await pool.query('DELETE FROM crm_contact WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_assign_log WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]);
    } catch (e) {
      console.warn(`[customerCreateBusinessStatus] 清理临时客户 ${id} 失败：${e.message}`);
    }
  }
  await pool.end();
});

function uniqueToken() {
  return `bscreate${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function getBusinessStatus(id) {
  const [rows] = await pool.query(
    'SELECT status, business_status FROM crm_customer WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function formalIds(companyName) {
  const res = await customerService.listFormalCustomers(pool, { page: 1, pageSize: 50, company_name: companyName }, null);
  return (res.list || []).map((c) => c.id);
}

async function firstUserId() {
  const [users] = await pool.query('SELECT id FROM sys_user WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
  return users.length ? users[0].id : null;
}

describe('新建/导入客户写入 business_status（真连库，P0-12）', () => {
  it('导入 status=signed：business_status=signed，并出现在正式客户列表', async () => {
    if (!reachable) return;

    const ownerId = await firstUserId();
    if (!ownerId) {
      console.warn('[customerCreateBusinessStatus] 无可用 sys_user，跳过导入路径');
      return;
    }
    const token = uniqueToken();
    const r = await customerService.systemCreateImportedCustomer(pool, {
      company_name: `${token}导入签约`, status: 'signed', level: 'B', owner_id: ownerId
    });
    tempIds.push(r.insertId);

    const row = await getBusinessStatus(r.insertId);
    expect(row.status).toBe('signed');
    expect(row.business_status).toBe('signed');
    expect(await formalIds(`${token}导入签约`)).toContain(r.insertId);
  });

  it('导入 status=lead：business_status=lead，不得出现在正式客户列表', async () => {
    if (!reachable) return;

    const ownerId = await firstUserId();
    if (!ownerId) {
      console.warn('[customerCreateBusinessStatus] 无可用 sys_user，跳过导入路径');
      return;
    }
    const token = uniqueToken();
    const r = await customerService.systemCreateImportedCustomer(pool, {
      company_name: `${token}导入线索`, status: 'lead', level: 'C', owner_id: ownerId
    });
    tempIds.push(r.insertId);

    const row = await getBusinessStatus(r.insertId);
    expect(row.business_status).toBe('lead');
    expect(await formalIds(`${token}导入线索`)).not.toContain(r.insertId);
  });

  it('手工新增且自动分配负责人：business_status=following，并出现在正式客户列表', async () => {
    if (!reachable) return;

    const [users] = await pool.query('SELECT id FROM sys_user WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
    if (users.length === 0) {
      console.warn('[customerCreateBusinessStatus] 无可用 sys_user，跳过手工新增路径');
      return;
    }
    autoAssignOwner.mockResolvedValue(users[0].id);

    const token = uniqueToken();
    const out = await customerDetailService.addCustomer(pool, {
      company_name: `${token}手工新增`,
      contacts: [{ name: '张三', phone: '13800000000' }]
    }, users[0].id);
    tempIds.push(out.id);

    const row = await getBusinessStatus(out.id);
    expect(row.status).toBe('following');
    expect(row.business_status).toBe('following');
    expect(await formalIds(`${token}手工新增`)).toContain(out.id);
  });
});
