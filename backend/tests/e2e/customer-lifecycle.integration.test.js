/**
 * 客户生命周期集成测试
 * 覆盖：创建客户 → 添加跟进 → 创建商机 → 软删除 → 恢复
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

const ADMIN = {
  username: 'testadmin_lifecycle',
  password: 'Test@12345',
  real_name: '生命周期测试员'
};

let agent;
let customerId;

describe('客户生命周期', () => {
  beforeAll(async () => {
    agent = request.agent(app);

    // 确保角色存在
    await pool.query(
      `INSERT IGNORE INTO sys_role (id, name, code, description, status, view_all, manage_all)
       VALUES (1, '管理员', 'ADMIN', '系统管理员', 1, 1, 1)`
    );

    // 插入测试用户
    const hash = await bcrypt.hash(ADMIN.password, 10);
    await pool.query(
      `INSERT INTO sys_user (username, password, real_name, role_id, status)
       VALUES (?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE password = VALUES(password), status = 1`,
      [ADMIN.username, hash, ADMIN.real_name]
    );

    // 登录获取 httpOnly Cookie 认证
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password });
    expect(res.body.code).toBe(200);
  });

  afterAll(async () => {
    // 清理测试数据（按外键依赖顺序）
    if (customerId) {
      await pool.query('DELETE FROM crm_follow_up WHERE customer_id = ?', [customerId]);
      await pool.query('DELETE FROM crm_opportunity WHERE customer_id = ?', [customerId]);
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);
    }
    await pool.query('DELETE FROM sys_user WHERE username = ?', [ADMIN.username]);
  });

  test('POST /api/v1/customer/add 创建客户', async () => {
    const res = await agent
      .post('/api/v1/customer/add')
      .send({
        company_name: '集成测试公司',
        contact_name: '张三',
        phone: '13800138000',
        source: '网络',
        level: 'B'
      })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBeDefined();
    customerId = res.body.data.id;

    // 验证 DB 中存在
    const [rows] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ?', [customerId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].company_name).toBe('集成测试公司');
    expect(rows[0].deleted_at).toBeNull();
  });

  test('POST /api/v1/follow-up/add 添加跟进', async () => {
    const res = await agent
      .post('/api/v1/follow-up/add')
      .send({
        customer_id: customerId,
        follow_type: '电话',
        content: '初次电话沟通，了解需求'
      })
      .expect(200);

    expect(res.body.code).toBe(200);

    // 验证 DB
    const [rows] = await pool.query(
      'SELECT * FROM crm_follow_up WHERE customer_id = ?', [customerId]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/v1/opportunity/add 创建商机', async () => {
    const res = await agent
      .post('/api/v1/opportunity/add')
      .send({
        name: '集成测试商机',
        customer_id: customerId,
        expected_amount: 50000,
        stage: 1,
        win_rate: 30
      })
      .expect(200);

    expect(res.body.code).toBe(200);

    // 验证 DB
    const [rows] = await pool.query(
      'SELECT * FROM crm_opportunity WHERE customer_id = ?', [customerId]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/v1/customer/delete 软删除客户', async () => {
    const res = await agent
      .post('/api/v1/customer/delete')
      .send({ id: customerId })
      .expect(200);

    expect(res.body.code).toBe(200);

    // 验证 deleted_at 非空
    const [rows] = await pool.query(
      'SELECT deleted_at FROM crm_customer WHERE id = ?', [customerId]
    );
    expect(rows[0].deleted_at).not.toBeNull();
  });

  test('POST /api/v1/recycle/restore 恢复客户', async () => {
    const res = await agent
      .post('/api/v1/recycle/restore')
      .send({ module: 'customer', id: customerId })
      .expect(200);

    expect(res.body.code).toBe(200);

    // 验证 deleted_at 为空
    const [rows] = await pool.query(
      'SELECT deleted_at FROM crm_customer WHERE id = ?', [customerId]
    );
    expect(rows[0].deleted_at).toBeNull();
  });
});
