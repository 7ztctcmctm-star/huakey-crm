/**
 * 真实数据库权限链路测试（不 mock permissionService）
 *
 * 前置：插入 3 个用户（admin/manager/sales）+ 角色权限数据
 * 覆盖：功能权限（checkPermission）+ 数据权限（checkDataPermission self 模式）
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

// 测试用户
const USERS = {
  admin: { username: 'testperm_admin', password: 'Test@12345', real_name: '权限测试管理员', role_id: 1 },
  manager: { username: 'testperm_manager', password: 'Test@12345', real_name: '权限测试经理', role_id: 2 },
  sales_a: { username: 'testperm_sales_a', password: 'Test@12345', real_name: '权限测试销售A', role_id: 3 },
  sales_b: { username: 'testperm_sales_b', password: 'Test@12345', real_name: '权限测试销售B', role_id: 3 }
};

// 需要插入的权限码（与路由中 checkPermission() 保持一致）
const PERMISSIONS = [
  { name: '用户管理', code: 'system:user', type: 'button', parent_id: 0 },
  { name: '新增用户', code: 'system:user:add', type: 'button', parent_id: 0 },
  { name: '客户管理', code: 'customer', type: 'menu', parent_id: 0 },
  { name: '新增客户', code: 'customer:add', type: 'button', parent_id: 0 },
  { name: '审批管理', code: 'approval', type: 'menu', parent_id: 0 }
];

// 角色 → 权限映射
const ROLE_PERMISSIONS = {
  1: ['system:user', 'system:user:add', 'customer', 'customer:add', 'approval'], // admin 全部
  2: ['customer:add', 'approval'],                                                // manager
  3: ['customer:add']                                                             // sales
};

const userIds = {};
const tokens = {};
let permIds = {};

describe('权限链路测试（真实数据库）', () => {
  beforeAll(async () => {
    // 1. 确保角色存在
    await pool.query(
      `INSERT IGNORE INTO sys_role (id, name, code, description, status, view_all, manage_all)
       VALUES (1, '管理员', 'ADMIN', '系统管理员', 1, 1, 1)`
    );
    await pool.query(
      `INSERT IGNORE INTO sys_role (id, name, code, description, status, view_all, manage_all)
       VALUES (2, '经理', 'MANAGER', '部门经理', 1, 0, 0)`
    );
    await pool.query(
      `INSERT IGNORE INTO sys_role (id, name, code, description, status, view_all, manage_all)
       VALUES (3, '销售', 'SALES', '销售人员', 1, 0, 0)`
    );

    // 2. 插入测试用户
    for (const [key, user] of Object.entries(USERS)) {
      const hash = await bcrypt.hash(user.password, 10);
      const [result] = await pool.query(
        `INSERT INTO sys_user (username, password, real_name, role_id, status)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE password = VALUES(password), status = 1, role_id = VALUES(role_id)`,
        [user.username, hash, user.real_name, user.role_id]
      );
      userIds[key] = result.insertId || (await pool.query(
        'SELECT id FROM sys_user WHERE username = ?', [user.username]
      ))[0][0].id;
    }

    // 3. 插入权限记录
    for (const perm of PERMISSIONS) {
      await pool.query(
        `INSERT INTO sys_permission (name, code, type, parent_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [perm.name, perm.code, perm.type, perm.parent_id]
      );
    }
    // 获取权限 ID
    const [perms] = await pool.query(
      `SELECT id, code FROM sys_permission WHERE code IN (${PERMISSIONS.map(() => '?').join(',')})`,
      PERMISSIONS.map(p => p.code)
    );
    perms.forEach(p => { permIds[p.code] = p.id; });

    // 4. 插入角色权限关联
    for (const [roleId, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        const permId = permIds[code];
        if (permId) {
          await pool.query(
            `INSERT IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)`,
            [parseInt(roleId), permId]
          );
        }
      }
    }

    // 5. 配置数据权限：sales 为 self 模式
    await pool.query(
      `INSERT INTO sys_data_permission (role_id, module, data_scope)
       VALUES (3, 'customer', 'self')
       ON DUPLICATE KEY UPDATE data_scope = 'self'`,
    );

    // 6. 清除权限缓存（node-cache 内存缓存，重启进程即清；这里通过新 token 绕过）
    // 集成测试每次是新进程，缓存天然为空，无需额外处理

    // 7. 为每个用户生成 token（走 JWT，不经过登录接口）
    for (const [key, user] of Object.entries(USERS)) {
      tokens[key] = jwt.sign(
        { userId: userIds[key], username: user.username, roleId: user.role_id, viewAll: user.role_id === 1, manageAll: user.role_id === 1 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    }
  });

  afterAll(async () => {
    // 清理：先删关联表，再删权限和用户
    const codes = PERMISSIONS.map(p => p.code);
    if (codes.length > 0) {
      const [perms] = await pool.query(
        `SELECT id FROM sys_permission WHERE code IN (${codes.map(() => '?').join(',')})`, codes
      );
      const pids = perms.map(p => p.id);
      if (pids.length > 0) {
        await pool.query(
          `DELETE FROM sys_role_permission WHERE permission_id IN (${pids.map(() => '?').join(',')})`, pids
        );
        await pool.query(
          `DELETE FROM sys_permission WHERE id IN (${pids.map(() => '?').join(',')})`, pids
        );
      }
    }
    await pool.query('DELETE FROM sys_data_permission WHERE role_id = 3 AND module = ?', ['customer']);
    for (const user of Object.values(USERS)) {
      await pool.query('DELETE FROM sys_user WHERE username = ?', [user.username]);
    }
  });

  // ─── 功能权限测试 ───

  test('1. admin 访问 POST /api/v1/user/add → 200（管理员绕过权限检查）', async () => {
    const res = await request(app)
      .post('/api/v1/user/add')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        username: 'testperm_temp_user',
        password: 'Temp@12345',
        real_name: '临时用户',
        role_id: 3
      });

    // admin 绕过 checkPermission，但可能因业务逻辑返回 200 或其他非 403 状态
    expect(res.status).not.toBe(403);

    // 清理临时用户
    await pool.query('DELETE FROM sys_user WHERE username = ?', ['testperm_temp_user']);
  });

  test('2. manager 访问 POST /api/v1/user/add → 403（无 system:user:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/user/add')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({
        username: 'testperm_temp_user2',
        password: 'Temp@12345',
        real_name: '临时用户2',
        role_id: 3
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
  });

  test('3. sales 访问 POST /api/v1/user/add → 403（无 system:user:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/user/add')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({
        username: 'testperm_temp_user3',
        password: 'Temp@12345',
        real_name: '临时用户3',
        role_id: 3
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
  });

  test('4. manager 访问 POST /api/v1/customer/add → 200（有 customer:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/customer/add')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({
        company_name: '权限测试_经理创建公司',
        source: '网络',
        level: 'C'
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);

    // 清理
    if (res.body.data && res.body.data.id) {
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [res.body.data.id]);
    }
  });

  test('5. sales 访问 POST /api/v1/customer/add → 200（有 customer:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/customer/add')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({
        company_name: '权限测试_销售A创建公司',
        source: '网络',
        level: 'C'
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  test('6. sales 访问 POST /api/v1/approval/approve/1 → 403（无 approval 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/approval/approve/1')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({ remark: '测试审批' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
  });

  // ─── 数据权限测试 ───

  test('7. 数据权限 self 模式：sales_a 创建的客户，sales_b 看不到', async () => {
    // sales_a 创建一个客户
    const createRes = await request(app)
      .post('/api/v1/customer/add')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({
        company_name: '数据权限隔离测试公司',
        source: '网络',
        level: 'C'
      });
    expect(createRes.status).toBe(200);
    const customerId = createRes.body.data.id;

    try {
      // sales_b 查询客户列表 — 应看不到 sales_a 创建的客户
      const listRes = await request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${tokens.sales_b}`)
        .send({ page: 1, pageSize: 100 });

      expect(listRes.status).toBe(200);
      const list = listRes.body.data.list || [];
      const found = list.find(c => c.id === customerId);
      expect(found).toBeUndefined();

      // sales_a 查询客户列表 — 应能看到自己创建的客户
      const listResA = await request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${tokens.sales_a}`)
        .send({ page: 1, pageSize: 100 });

      expect(listResA.status).toBe(200);
      const listA = listResA.body.data.list || [];
      const foundA = listA.find(c => c.id === customerId);
      expect(foundA).toBeDefined();
    } finally {
      // 清理
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);
    }
  });
});

