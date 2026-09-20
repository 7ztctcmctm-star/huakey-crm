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
  { name: '查看客户', code: 'customer:view', type: 'button', parent_id: 0 },
  { name: '新增客户', code: 'customer:add', type: 'button', parent_id: 0 },
  { name: '审批管理', code: 'approval', type: 'menu', parent_id: 0 }
];

// 角色 → 权限映射
const ROLE_PERMISSIONS = {
  1: ['system:user', 'system:user:add', 'customer', 'customer:view', 'customer:add', 'approval'], // admin 全部
  2: ['customer:view', 'customer:add', 'approval'],                                                // manager
  3: ['customer:view', 'customer:add']                                                             // sales
};

const userIds = {};
const tokens = {};
let permIds = {};

/**
 * ⭐ 基线快照 —— afterAll 只清理"本测试新建"的行、并还原"本测试删除"的行。
 *
 * 背景（历史缺陷，见 docs/ci-failure-analysis-2026-09-20.md §10.4）：
 * 原 afterAll 按 **code** 删除 sys_permission / sys_role_permission，会把基线里本来就有的
 * 同名记录一并删掉（实测把本机 sys_permission 由 114 删到 108、sys_role_permission 由 315 删到 300）；
 * 且 beforeAll 第 4b 步删掉 role 3 的 approval 关联后**从不还原**。
 * 这类"删了不还"的副作用在 CI 一次性库上无害，但会破坏本机/共享库的基线数据。
 */
const baseline = {
  permissionIds: new Set(), // 测试开始前，这 6 个权限码下已存在的 sys_permission.id
  permissionRows: new Map(), // id -> {name, type, parent_id}：步骤 3 的 ON DUPLICATE KEY UPDATE 会覆盖 name，需还原
  rolePerms: new Set(), // 测试开始前，受影响角色×这 6 个权限码 已存在的关联（'roleId:permId'）
  removedRolePerms: [], // 本测试主动删除的关联（4b），afterAll 需还原
  dataPerm: null // 测试开始前 (role 3, customer) 的 data_scope；null 表示原本不存在
};

async function captureBaseline() {
  const codes = PERMISSIONS.map(p => p.code);
  const roleIds = Object.keys(ROLE_PERMISSIONS).map(Number);

  const [perms] = await pool.query(
    `SELECT id, name, type, parent_id FROM sys_permission WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
  perms.forEach(r => {
    baseline.permissionIds.add(r.id);
    baseline.permissionRows.set(r.id, { name: r.name, type: r.type, parent_id: r.parent_id });
  });

  const [rps] = await pool.query(
    `SELECT rp.role_id, rp.permission_id
       FROM sys_role_permission rp
       JOIN sys_permission p ON rp.permission_id = p.id
      WHERE rp.role_id IN (${roleIds.map(() => '?').join(',')})
        AND p.code IN (${codes.map(() => '?').join(',')})`,
    [...roleIds, ...codes]);
  rps.forEach(r => baseline.rolePerms.add(`${r.role_id}:${r.permission_id}`));

  const [dp] = await pool.query(
    `SELECT data_scope FROM sys_data_permission WHERE role_id = 3 AND module = 'customer'`);
  baseline.dataPerm = dp.length ? dp[0].data_scope : null;
}

describe('权限链路测试（真实数据库）', () => {
  beforeAll(async () => {
    // 0. 先记录基线（必须在任何写入之前）—— 决定 afterAll 能删什么、要还原什么
    await captureBaseline();

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

    // 4b. 显式撤销 role 3 (sales) 的 approval 功能权限。
    // 用例 6 断言「sales 无 approval 权限 → 403」，但第 4 步的 INSERT IGNORE 只做新增，
    // 无法移除 CI 基线 / 真实库中 role 3 已有的 approval 授权 —— 那样请求会穿透到
    // approvalService，并因审批记录不存在而返回 404（而非被权限层拦下）。
    // 显式 DELETE 让前提自洽，不依赖库的初始状态。
    // 用 JOIN 按 code 删除：sys_permission.code 未必有唯一约束，按 code 匹配可覆盖重复行。
    // ⚠️ 这是**破坏性**操作 ⇒ 先记下被删的行，afterAll 必须还原（否则会永久削弱基线角色的权限）。
    const [removedRp] = await pool.query(
      `SELECT rp.role_id, rp.permission_id
         FROM sys_role_permission rp
         JOIN sys_permission p ON rp.permission_id = p.id
        WHERE rp.role_id = 3 AND p.code = 'approval'`
    );
    const [delResult] = await pool.query(
      `DELETE rp FROM sys_role_permission rp
       JOIN sys_permission p ON rp.permission_id = p.id
       WHERE rp.role_id = 3 AND p.code = 'approval'`
    );
    if (delResult.affectedRows > 0) {
      baseline.removedRolePerms.push(...removedRp.map(r => [r.role_id, r.permission_id]));
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
    // ⭐ 只清理"本测试新建"的行、并还原"本测试删除"的行 —— 绝不碰基线数据（见 §10.4）。
    // 判据：新建 = 当前存在但不在 baseline.permissionIds 里的 id。

    // 1. 还原 4b 主动删掉的 role 3 approval 关联
    for (const [roleId, permId] of baseline.removedRolePerms) {
      await pool.query(
        `INSERT IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)`,
        [roleId, permId]
      );
    }

    const createdPermIds = Object.values(permIds).filter(id => !baseline.permissionIds.has(id));

    // 2. 只删"本测试新建"的角色权限关联（基线既有授权一律保留）
    if (createdPermIds.length > 0) {
      const [pairs] = await pool.query(
        `SELECT role_id, permission_id FROM sys_role_permission
          WHERE permission_id IN (${createdPermIds.map(() => '?').join(',')})`, createdPermIds
      );
      const toDelete = pairs.filter(r => !baseline.rolePerms.has(`${r.role_id}:${r.permission_id}`));
      for (const r of toDelete) {
        await pool.query(
          `DELETE FROM sys_role_permission WHERE role_id = ? AND permission_id = ?`,
          [r.role_id, r.permission_id]
        );
      }
    }

    // 3. 只删"本测试新建"的权限行；基线已有的同名 code 行**保留**
    if (createdPermIds.length > 0) {
      await pool.query(
        `DELETE FROM sys_permission WHERE id IN (${createdPermIds.map(() => '?').join(',')})`,
        createdPermIds
      );
    }

    // 4. 还原基线行的字段：步骤 3 的 ON DUPLICATE KEY UPDATE 会把基线行的 name 覆盖成本测试的名字
    for (const [id, row] of baseline.permissionRows) {
      await pool.query(
        `UPDATE sys_permission SET name = ?, type = ?, parent_id = ? WHERE id = ?`,
        [row.name, row.type, row.parent_id, id]
      );
    }

    // 5. 还原 (role 3, customer) 的数据权限：基线有则改回原值，本来没有才删
    if (baseline.dataPerm === null) {
      await pool.query(
        `DELETE FROM sys_data_permission WHERE role_id = 3 AND module = ?`, ['customer']
      );
    } else {
      await pool.query(
        `UPDATE sys_data_permission SET data_scope = ? WHERE role_id = 3 AND module = ?`,
        [baseline.dataPerm, 'customer']
      );
    }

    // 6. 清理测试用户
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

  test('4. manager 访问 POST /api/v1/customers/add → 200（有 customer:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/customers/add')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({
        company_name: '权限测试_经理创建公司',
        contacts: [{ name: '测试联系人', phone: '13800138000' }],
        source: '其他网络渠道',
        level: 'C'
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);

    // 清理
    if (res.body.data && res.body.data.id) {
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [res.body.data.id]);
    }
  });

  test('5. sales 访问 POST /api/v1/customers/add → 200（有 customer:add 权限）', async () => {
    const res = await request(app)
      .post('/api/v1/customers/add')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({
        company_name: '权限测试_销售A创建公司',
        contacts: [{ name: '测试联系人', phone: '13800138000' }],
        source: '其他网络渠道',
        level: 'C'
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);

    // 清理：本用例创建的客户必须删掉（原实现漏了，会在库里留残留数据）
    if (res.body.data && res.body.data.id) {
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [res.body.data.id]);
    }
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
      .post('/api/v1/customers/add')
      .set('Authorization', `Bearer ${tokens.sales_a}`)
      .send({
        company_name: '数据权限隔离测试公司',
        contacts: [{ name: '测试联系人', phone: '13800138000' }],
        source: '其他网络渠道',
        level: 'C'
      });
    expect(createRes.status).toBe(200);
    const customerId = createRes.body.data.id;

    // autoAssignOwner 可能未分配负责人（客户进公海 owner_id=null，公海客户所有人可见）
    // 数据权限 self 模式隔离需要客户归属 sales_a，手动设置 owner_id
    await pool.query(
      'UPDATE crm_customer SET owner_id = ? WHERE id = ?',
      [userIds.sales_a, customerId]
    );

    try {
      // sales_b 查询客户列表 — 应看不到 sales_a 创建的客户
      const listRes = await request(app)
        .post('/api/v1/customers/list')
        .set('Authorization', `Bearer ${tokens.sales_b}`)
        .send({ page: 1, pageSize: 100 });

      expect(listRes.status).toBe(200);
      const list = listRes.body.data.list || [];
      const found = list.find(c => c.id === customerId);
      expect(found).toBeUndefined();

      // sales_a 查询客户列表 — 应能看到自己创建的客户
      const listResA = await request(app)
        .post('/api/v1/customers/list')
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

