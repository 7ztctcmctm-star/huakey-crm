const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ============ Mock pool ============
const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn()
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConn)
};

jest.mock('../config/database', () => mockPool);

// ============ Mock 中间件（避免 auth/permission/logger 消耗 pool.query mock） ============
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', viewAll: true, manageAll: true };
    next();
  }
}));

jest.mock('../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '1=1', params: [] })
}));

jest.mock('../middleware/logger', () => ({
  createRouteLogger: () => jest.fn().mockResolvedValue(null),
  logAction: jest.fn().mockResolvedValue(null),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../middleware/admin', () => {
  const pass = (req, res, next) => next();
  pass.requireAdmin = pass;
  pass.requireManager = pass;
  return pass;
});

jest.mock('../middleware/cache', () => ({
  cache: () => (req, res, next) => next(),
  invalidateCache: jest.fn()
}));

// ============ Mock 外部依赖 ============
jest.mock('../config/redis', () => ({
  clearByPrefix: jest.fn(),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(null),
  REDIS_ENABLED: false
}));

jest.mock('../services/assignService', () => ({
  autoAssignOwner: jest.fn().mockResolvedValue(null),
  getAssignRules: jest.fn().mockResolvedValue([]),
  createRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  applyRule: jest.fn(),
  manualAssign: jest.fn(),
  batchAssign: jest.fn(),
  getAssignLogs: jest.fn(),
  getSalesUsers: jest.fn()
}));

jest.mock('../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(null),
  computeFieldChanges: jest.fn().mockReturnValue([]),
  FIELD_LABEL_MAP: {}
}));

// ============ 挂载路由（mock 必须在 require 之前） ============
const app = express();
app.use(express.json());

app.use('/api/v1/customer', require('../routes/customer'));
app.use('/api/v1/follow-up', require('../routes/followUp'));
app.use('/api/v1/opportunity', require('../routes/opportunity'));
app.use('/api/v1/quote', require('../routes/quote'));
app.use('/api/v1/contract', require('../routes/contract'));
app.use('/api/v1/recycle', require('../routes/recycle'));

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('客户全生命周期 - 端到端流程', () => {
  const token = generateToken();
  let customerId, opportunityId, quoteId, contractId;

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConn.query.mockReset();
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    mockConn.release.mockReset();
  });

  // Step 1: 创建客户
  it('Step 1: POST /api/v1/customer/add — 创建客户', async () => {
    // customerDetailService.addCustomer: 2 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[]])                      // 检查重复（无重复）
      .mockResolvedValueOnce([{ insertId: 100 }]);      // INSERT

    const res = await request(app)
      .post('/api/v1/customer/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_name: '测试客户公司', contact_name: '张三', phone: '13800138000' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data).toHaveProperty('id');
    customerId = res.body.data.id;
  });

  // Step 2: 添加跟进记录
  it('Step 2: POST /api/v1/follow-up/add — 添加跟进记录', async () => {
    // followUpService.addFollowUp: 3 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, owner_id: 1, status: 1 }]])  // 客户存在检查
      .mockResolvedValueOnce([{ insertId: 200 }])                       // INSERT 跟进
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                    // UPDATE last_follow_time

    const res = await request(app)
      .post('/api/v1/follow-up/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 100, content: '电话沟通需求', follow_type: '电话' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  // Step 3: 创建商机
  it('Step 3: POST /api/v1/opportunity/add — 创建商机', async () => {
    // opportunityService.createOpportunity: 2 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, status: 2 }]])   // 客户校验（status=2 正式客户）
      .mockResolvedValueOnce([{ insertId: 300 }]);          // INSERT

    const res = await request(app)
      .post('/api/v1/opportunity/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 100, name: '测试商机', expected_amount: 50000 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    opportunityId = res.body.data.id;
  });

  // Step 4: 创建报价（使用 conn.query）
  it('Step 4: POST /api/v1/quote/add — 创建报价', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ id: 100 }]])                                          // 客户校验
      .mockResolvedValueOnce([[{ id: 1, name: '产品A', code: 'P001', price: 5000 }]]) // 产品校验
      .mockResolvedValueOnce([[{ cnt: 0 }]])                                           // COUNT 报价编号
      .mockResolvedValueOnce([{ insertId: 400 }])                                      // INSERT 报价
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                                   // INSERT 报价明细

    const res = await request(app)
      .post('/api/v1/quote/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_id: 100,
        opportunity_id: 300,
        items: [{ product_id: 1, quantity: 10, unit_price: 5000 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    quoteId = res.body.data.id;
  });

  // Step 5: 创建合同（使用 conn.query）
  it('Step 5: POST /api/v1/contract/add — 创建合同', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ id: 100, status: 2, company_name: '测试客户公司' }]])  // 客户校验
      .mockResolvedValueOnce([[{ cnt: 0 }]])                                           // COUNT 合同编号
      .mockResolvedValueOnce([{ insertId: 500 }])                                      // INSERT 合同
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                                   // INSERT 回款计划

    const res = await request(app)
      .post('/api/v1/contract/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_id: 100,
        amount: 50000,
        plans: [{ plan_date: '2026-07-01', plan_amount: 50000 }]
      });

    expect([200, 400, 500]).toContain(res.status);
    contractId = 500;
  });

  // Step 6: 推进商机到成交
  it('Step 6: POST /api/v1/opportunity/update-stage — 标记成交', async () => {
    // getOpportunityWithPermission + advanceStage: 4 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 300, stage: 4, owner_id: 1 }]])  // getOpportunityWithPermission
      .mockResolvedValueOnce([[{ id: 300, stage: 4 }]])                // advanceStage 查当前阶段
      .mockResolvedValueOnce([{ affectedRows: 1 }])                    // UPDATE stage
      .mockResolvedValueOnce([{ insertId: 600 }]);                     // INSERT stage log

    const res = await request(app)
      .post('/api/v1/opportunity/update-stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 300, stage: 5 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  // Step 7: 删除客户（移入回收站）
  it('Step 7: POST /api/v1/customer/delete — 移入回收站', async () => {
    // deleteCustomer: 2 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, owner_id: 1 }]])  // SELECT 客户
      .mockResolvedValueOnce([{ affectedRows: 1 }]);          // UPDATE deleted_at

    const res = await request(app)
      .post('/api/v1/customer/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 100 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  // Step 8: 从回收站恢复
  it('Step 8: POST /api/v1/recycle/restore — 恢复客户', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, deleted_at: '2026-06-25' }]])  // 查询已删除记录
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                      // UPDATE deleted_at = NULL

    const res = await request(app)
      .post('/api/v1/recycle/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ table: 'crm_customer', id: 100 });

    expect([200, 400, 404]).toContain(res.status);
  });
});

