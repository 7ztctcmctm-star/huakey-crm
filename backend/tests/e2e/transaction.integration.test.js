/**
 * 事务 rollback 集成测试
 * 验证 quote 和 contract 的事务在失败时正确回滚
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

const ADMIN = {
  username: 'testadmin_txn',
  password: 'Test@12345',
  real_name: '事务测试员'
};

let agent;
let customerId;
let productId;

describe('事务回滚', () => {
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

    // 登录（httpOnly Cookie 认证）
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password });
    expect(loginRes.body.code).toBe(200);

    // 通过 GET /me 获取 CSRF cookie（agent 会自动保持 cookie）
    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.body.code).toBe(200);

    // 创建测试客户（status=2 正式客户，用于合同测试）
    const [custResult] = await pool.query(
      `INSERT INTO crm_customer (company_name, contact_name, phone, status, owner_id)
       VALUES ('事务测试公司', '李四', '13900139000', 2, 1)`
    );
    customerId = custResult.insertId;

    // 创建测试产品
    const [prodResult] = await pool.query(
      `INSERT INTO crm_product (name, code, price, status)
       VALUES ('测试产品', 'TEST-PROD-001', 100.00, 1)`
    );
    productId = prodResult.insertId;
  });

  afterAll(async () => {
    // 清理（按外键依赖顺序）
    await pool.query('DELETE FROM crm_quote_item WHERE product_id = ?', [productId]);
    await pool.query('DELETE FROM crm_quote WHERE customer_id = ?', [customerId]);
    await pool.query('DELETE FROM crm_contract WHERE customer_id = ?', [customerId]);
    await pool.query('DELETE FROM crm_product WHERE id = ?', [productId]);
    await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]);
    await pool.query('DELETE FROM sys_user WHERE username = ?', [ADMIN.username]);
  });

  describe('报价事务', () => {
    test('引用不存在的产品 → 事务回滚，quote 表无新增', async () => {
      // 记录操作前的 quote 数量
      const [before] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote');

      const res = await agent
        .post('/api/v1/quote/add')
        .send({
          customer_id: customerId,
          items: [
            { product_id: 999999, quantity: 1, unit_price: 100 } // 不存在的产品
          ]
        });

      // 应返回错误（404 或 500）
      expect(res.body.code).not.toBe(200);

      // 验证 quote 表没有新增
      const [after] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote');
      expect(after[0].cnt).toBe(before[0].cnt);

      // 验证 quote_item 表也没有新增
      const [items] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote_item');
      // 数量不变（这里只检查总量，因为 before 中 quote_item 也是 0）
      expect(items[0].cnt).toBe(0);
    });

    test('有效数据 → 事务提交，quote 和 quote_item 都有新增', async () => {
      const [beforeQuote] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote');
      const [beforeItem] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote_item');

      const res = await agent
        .post('/api/v1/quote/add')
        .send({
          customer_id: customerId,
          items: [
            { product_id: productId, quantity: 2, unit_price: 100 }
          ]
        })
        .expect(200);

      expect(res.body.code).toBe(200);
      expect(res.body.data.id).toBeDefined();

      const [afterQuote] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote');
      const [afterItem] = await pool.query('SELECT COUNT(*) as cnt FROM crm_quote_item');
      expect(afterQuote[0].cnt).toBe(beforeQuote[0].cnt + 1);
      expect(afterItem[0].cnt).toBe(beforeItem[0].cnt + 1);
    });
  });

  describe('合同事务', () => {
    test('不存在的客户 → 事务回滚，contract 表无新增', async () => {
      const [before] = await pool.query('SELECT COUNT(*) as cnt FROM crm_contract');

      const res = await agent
        .post('/api/v1/contract/add')
        .send({
          customer_id: 999999, // 不存在的客户
          amount: 10000
        });

      expect(res.body.code).not.toBe(200);

      const [after] = await pool.query('SELECT COUNT(*) as cnt FROM crm_contract');
      expect(after[0].cnt).toBe(before[0].cnt);
    });
  });
});
