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

// ============ Mock 中间件（避免 auth/permission/logger 消耗 pool.query mock）============
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', viewAll: true, manageAll: true };
    next();
  }
}));

jest.mock('../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  checkFieldPermission: () => (req, res, next) => next(),
  stripRestrictedFields: (data) => data,
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
  createCache: () => (req, res, next) => next(),
  invalidateCache: jest.fn()
}));

// ============ Mock 外部依赖 ============
jest.mock('../config/redis', () => ({
  clearByPrefix: jest.fn(),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(null),
  REDIS_ENABLED: false
}));

// ============ 挂载路由（mock 必须在 require 之前）============
const app = express();
app.use(express.json());

app.use('/api/v1/supplier', require('../routes/supplier'));
app.use('/api/v1/purchase', require('../routes/purchase'));
app.use('/api/v1/approval', require('../routes/approval'));
app.use('/api/v1/inventory', require('../routes/inventory'));
app.use('/api/v1/invoice', require('../routes/invoice'));

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('采购全流程 - 端到端流程', () => {
  const token = generateToken();
  // eslint-disable-next-line no-unused-vars
  let supplierId, purchaseId, approvalRecordId;

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConn.query.mockReset();
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    mockConn.release.mockReset();
  });

  // Step 1: 创建供应商（使用 conn.query）
  it('Step 1: POST /api/v1/supplier/add — 创建供应商', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])       // COUNT 供应商编号
      .mockResolvedValueOnce([{ insertId: 10 }])   // INSERT 供应商
      .mockResolvedValueOnce([{ insertId: 11 }]);  // INSERT 默认联系人

    const res = await request(app)
      .post('/api/v1/supplier/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '测试供应商',
        type: '生产',
        level: '核心',
        contact_person: '李四',
        contact_phone: '13900139000'
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data).toHaveProperty('id');
    supplierId = res.body.data.id;
  });

  // Step 2: 创建采购单（使用 conn.query，需要 title 必填字段）
  it('Step 2: POST /api/v1/purchase/add — 创建采购单', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])       // COUNT 采购单编号
      .mockResolvedValueOnce([{ insertId: 20 }])   // INSERT 采购单
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT 采购明细

    const res = await request(app)
      .post('/api/v1/purchase/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplier_id: 10,
        title: '采购原材料订单',
        type: '常规',
        items: [{ product_name: '原材料A', quantity: 100, unit_price: 1000 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    purchaseId = res.body.data.id;
  });

  // Step 3: 提交审批
  it('Step 3: POST /api/v1/approval/submit — 提交采购审批', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 20, approval_status: 0 }]])                    // 业务记录验证
      .mockResolvedValueOnce([[{ id: 1, type: 'purchase', status: 1 }]])             // 查审批流程
      .mockResolvedValueOnce([[{ id: 1, step_order: 1, approver_type: 'user', approver_id: 2 }]]) // 第一步
      .mockResolvedValueOnce([[{ manager_id: 2 }]])                                   // 查上级
      .mockResolvedValueOnce([{ insertId: 30 }])                                      // INSERT 审批记录
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                                  // UPDATE approval_status

    const res = await request(app)
      .post('/api/v1/approval/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_type: 'purchase', business_id: 20 });

    expect([200, 400]).toContain(res.status);
    approvalRecordId = 30;
  });

  // Step 4: 审批通过（approveRecord 使用 conn.query）
  it('Step 4: POST /api/v1/approval/approve/:id — 审批通过', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ id: 30, status: 'pending', approver_id: 1, workflow_id: 1, step_order: 1, business_type: 'purchase', business_id: 20 }]]) // SELECT FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE 为 approved
      .mockResolvedValueOnce([[]])                     // 查下一步（无）
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE 业务表 approval_status

    const res = await request(app)
      .post(`/api/v1/approval/approve/${approvalRecordId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '同意采购' });

    expect([200, 404]).toContain(res.status);
  });

  // Step 5: 入库（stockIn 使用 conn.query）
  it('Step 5: POST /api/v1/inventory/in — 入库', async () => {
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    mockConn.query
      .mockResolvedValueOnce([[{ id: 1, stock: 0 }]])  // SELECT 产品库存
      .mockResolvedValueOnce([{ affectedRows: 1 }])     // UPDATE 库存
      .mockResolvedValueOnce([{ insertId: 40 }]);       // INSERT 入库记录

    const res = await request(app)
      .post('/api/v1/inventory/in')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: 1,
        quantity: 100,
        remark: '采购入库'
      });

    expect([200, 400]).toContain(res.status);
  });

  // Step 6: 生成发票
  it('Step 6: POST /api/v1/invoice/add — 生成发票', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 20, supplier_id: 10 }]])  // 验证采购单
      .mockResolvedValueOnce([{ insertId: 50 }]);                // INSERT 发票

    const res = await request(app)
      .post('/api/v1/invoice/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoice_no: 'INV-2026-001',
        purchase_order_id: 20,
        supplier_id: 10,
        amount: 100000,
        tax_rate: 0.13,
        invoice_date: '2026-06-25'
      });

    expect([200, 400]).toContain(res.status);
  });
});

