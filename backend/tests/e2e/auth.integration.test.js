/**
 * 认证流程集成测试
 * 真实数据库，覆盖登录/me/登出/token黑名单
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

// 测试用管理员
const ADMIN = {
  username: 'testadmin_auth',
  password: 'Test@12345',
  real_name: '测试管理员'
};

let adminToken;
let adminUserId;

describe('认证流程 /api/v1/auth', () => {
  beforeAll(async () => {
    // 插入 ADMIN 角色（如不存在）
    await pool.query(
      `INSERT IGNORE INTO sys_role (id, name, code, description, status, view_all, manage_all)
       VALUES (1, '管理员', 'ADMIN', '系统管理员', 1, 1, 1)`
    );

    // 插入测试用户
    const hash = await bcrypt.hash(ADMIN.password, 10);
    const [result] = await pool.query(
      `INSERT INTO sys_user (username, password, real_name, role_id, status)
       VALUES (?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE password = VALUES(password), status = 1`,
      [ADMIN.username, hash, ADMIN.real_name]
    );
    adminUserId = result.insertId || (await pool.query(
      'SELECT id FROM sys_user WHERE username = ?', [ADMIN.username]
    ))[0][0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sys_user WHERE username = ?', [ADMIN.username]);
    await pool.query('DELETE FROM sys_token_blacklist WHERE user_id = ?', [adminUserId]);
  });

  test('正确密码登录 → 200 + httpOnly Cookie token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userInfo.username).toBe(ADMIN.username);
    // token 不再在响应体返回，应通过 httpOnly Cookie 设置
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('token=')])
    );

    adminToken = res.headers['set-cookie'].find(c => c.startsWith('token='));
  });

  test('GET /me 带 token cookie → 200 + 用户信息', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [adminToken])
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.username).toBe(ADMIN.username);
  });

  test('GET /me 无 token → 401', async () => {
    await request(app)
      .get('/api/v1/auth/me')
      .expect(401);
  });

  test('错误密码登录 → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN.username, password: 'WrongPassword1' })
      .expect(401);

    expect(res.body.code).toBe(401);
  });

  test('登出后 token 失效 → 401', async () => {
    // 登出
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [adminToken])
      .expect(200);

    // 用同一 token cookie 访问 → 应被黑名单拦截
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [adminToken])
      .expect(401);
  });

  test('过期 token → 401', async () => {
    const expiredToken = jwt.sign(
      { userId: adminUserId, username: ADMIN.username, roleId: 1, viewAll: true, manageAll: true },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });
});

