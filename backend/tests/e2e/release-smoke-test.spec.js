/**
 * Release Smoke Test — v1 发布冒烟测试
 *
 * 覆盖完整业务链 + 权限隔离，作为发布前的快速回归门禁：
 *   1. 用户认证（无 token 拒绝）
 *   2. 创建客户（mock 服务层）
 *   3. 创建商机（关联客户，DB mock）
 *   4. 创建报价（关联商机+客户，一致性校验）
 *   5. 创建合同（关联客户+商机，customer status=signed 校验）
 *   6. 审批合同（manager manageAll=true 通过）
 *   7. 权限隔离（sales 不能审批 / 数据范围=self）
 *
 * 约束: 不修改冻结模块, mock pool 模式
 * 策略: 创建流使用 super_admin（绕过 checkPermission 简化 mock），权限隔离用 sales
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_release_smoke_v2';
process.env.NODE_ENV = 'test';

// ============================================================================
// Mock Pool
// ============================================================================
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  })
};

jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../config/roles', () => ({
  ADMIN: 1, MANAGER: 2, SALES: 3,
  ROLE_CODES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', BOSS: 'boss', SALES: 'sales' },
  ADMIN_ROLE_CODES: new Set(['super_admin'])
}));
jest.mock('../../utils/pagination', () => ({ paginatedQuery: jest.fn().mockResolvedValue({ list: [], total: 0 }) }));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

// Mock customerDetailService（客户创建走服务层，smoke test 验证 HTTP 链路即可）
jest.mock('../../services/customerDetailService', () => ({
  addCustomer: jest.fn().mockResolvedValue({ id: 100, possibleDuplicates: [] }),
  VALID_SOURCES: ['展会', 'Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道', '转介绍', '电话', '其他'],
  SOURCE_PARENT_MAP: { '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道'] }
}));

// Mock permissionService
const mockGetUserPermissions = jest.fn();
const mockGetDataPermissions = jest.fn();
jest.mock('../../services/permissionService', () => ({
  getUserPermissions: (...args) => mockGetUserPermissions(...args),
  getDataPermissions: (...args) => mockGetDataPermissions(...args)
}));

// ============================================================================
// App
// ============================================================================
const app = express();
app.use(express.json());

const customerRoutes = require('../../routes/customers');
const opportunityRoutes = require('../../routes/opportunity');
const quoteRoutes = require('../../routes/quote');
const contractRoutes = require('../../routes/contract');

app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/opportunity', opportunityRoutes);
app.use('/api/v1/quote', quoteRoutes);
app.use('/api/v1/contract', contractRoutes);

app.use((err, req, res, _next) => {
  const httpStatus = err.httpStatus || err.statusCode || 500;
  res.status(httpStatus).json({ code: err.code || 500, message: err.message || '服务器内部错误', data: null });
});

// ============================================================================
// Tokens
// ============================================================================
const adminToken = () => jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true, viewAll: true },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);
const salesToken = () => jwt.sign(
  { userId: 10, username: 'sales01', roleId: 5, roleCode: 'sales', manageAll: false, viewAll: false },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);
const managerToken = () => jwt.sign(
  { userId: 2, username: 'manager', roleId: 2, roleCode: 'admin', manageAll: true, viewAll: false },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

// super_admin auth（绕过 checkPermission，仅 3 次 DB 查询）
const mockAuthAdmin = () => {
  mockPool.query
    .mockResolvedValueOnce([[]])                                     // blacklist
    .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])      // role
    .mockResolvedValueOnce([[{ must_change_password: 0 }]]);        // user
};
const mockAuthSales = () => {
  mockPool.query
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0, role_code: 'sales' }]])
    .mockResolvedValueOnce([[{ must_change_password: 0 }]]);
};

// ============================================================================
// Tests
// ============================================================================
describe('HuakeyCRM v1 Release Smoke Test', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
    // 重置 connection query
    const conn = mockPool.getConnection();
    if (conn && typeof conn.then === 'function') {
      // async mock — reset in test
    }
  });

  // 1. 认证
  it('1. 无 token 访问返回 401', async () => {
    const res = await request(app).get('/api/v1/opportunity/detail/1');
    expect(res.status).toBe(401);
  });

  // 2. 创建客户（super_admin，mock 服务层）
  it('2. 创建客户成功', async () => {
    mockAuthAdmin();
    const res = await request(app)
      .post('/api/v1/customers/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        company_name: 'A汽车灯具有限公司',
        contacts: [{ name: '陈志明', phone: '+8675788888001' }],
        industry: '汽车零部件制造',
        level: 'A',
        source: '展会'
      });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(100);
  });

  // 3. 创建商机（super_admin，关联 customer_id）
  it('3. 创建商机成功，生成 opportunity_no', async () => {
    mockAuthAdmin();
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, status: 'following' }]])  // SELECT customer
      .mockResolvedValueOnce([[{ cnt: 0 }]])                         // generateOpportunityNo
      .mockResolvedValueOnce([{ insertId: 200 }]);                   // INSERT

    const res = await request(app)
      .post('/api/v1/opportunity/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ customer_id: 100, name: 'A汽车灯具自动化生产线升级项目', expected_amount: 5800000, stage: 2, win_rate: 25 });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(200);
    expect(res.body.data.opportunity_no).toMatch(/^OPP-\d{6}-001$/);
  });

  // 4. 创建报价（super_admin，关联 opportunity+customer 一致）
  it('4. 创建报价成功，校验 opportunity/customer 一致', async () => {
    const conn = await mockPool.getConnection();
    conn.query.mockReset();
    conn.query
      .mockResolvedValueOnce([[{ id: 100 }]])                          // SELECT customer
      .mockResolvedValueOnce([[{ id: 200, customer_id: 100 }]])        // SELECT opportunity（一致）
      .mockResolvedValueOnce([[{ id: 1, name: '产品A', code: 'P001', price: 100 }]])  // SELECT product
      .mockResolvedValueOnce([[{ cnt: 0 }]])                            // generateQuoteNo
      .mockResolvedValueOnce([{ insertId: 300 }])                       // INSERT quote
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                    // INSERT quote_item

    mockAuthAdmin();
    mockPool.query
      .mockResolvedValueOnce([[{ company_name: 'A汽车灯具' }]])         // notification customer
      .mockResolvedValueOnce([[{ real_name: '管理员' }]])               // notification user
      .mockResolvedValueOnce([{ affectedRows: 0 }]);                   // notification INSERT

    const res = await request(app)
      .post('/api/v1/quote/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ customer_id: 100, opportunity_id: 200, items: [{ product_id: 1, quantity: 5, unit_price: 1000 }], discount: 0.05, valid_days: 30 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  // 4b. 报价一致性校验
  it('4b. 报价 opportunity/customer 不匹配返回 400', async () => {
    const conn = await mockPool.getConnection();
    conn.query.mockReset();
    conn.query
      .mockResolvedValueOnce([[{ id: 999 }]])                          // SELECT customer
      .mockResolvedValueOnce([[{ id: 200, customer_id: 100 }]]);       // opportunity 属于 100，非 999

    mockAuthAdmin();

    const res = await request(app)
      .post('/api/v1/quote/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ customer_id: 999, opportunity_id: 200, items: [{ product_id: 1, quantity: 1, unit_price: 100 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('不匹配');
  });

  // 5. 创建合同（super_admin，customer status=signed 校验通过）
  it('5. 创建合同成功，customer status=signed', async () => {
    const conn = await mockPool.getConnection();
    conn.query.mockReset();
    conn.query
      .mockResolvedValueOnce([[{ id: 100, status: 'signed', company_name: 'A汽车灯具' }]])  // 客户校验 ✅
      .mockResolvedValueOnce([[{ id: 200, customer_id: 100 }]])        // 商机校验 ✅
      .mockResolvedValueOnce([[{ cnt: 0 }]])                            // generateContractNo
      .mockResolvedValueOnce([{ insertId: 500 }])                       // INSERT contract
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                    // INSERT plan

    mockAuthAdmin();

    const res = await request(app)
      .post('/api/v1/contract/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ customer_id: 100, opportunity_id: 200, amount: 5510000, sign_date: '2026-08-20', plans: [{ plan_date: '2026-08-20', plan_amount: 1653000 }] });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  // 6. 审批合同（manager manageAll=true）
  it('6. manager 审批合同通过', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])                                     // blacklist
      .mockResolvedValueOnce([[{ view_all: 0, manage_all: 1, role_code: 'admin' }]])  // role
      .mockResolvedValueOnce([[{ must_change_password: 0 }]])          // user
      .mockResolvedValueOnce([[{ id: 500, approval_status: 1 }]])      // SELECT contract
      .mockResolvedValueOnce([{ affectedRows: 1 }])                    // UPDATE approval_status=2
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                   // dismiss notification

    const res = await request(app)
      .post('/api/v1/contract/approve')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ id: 500, approval_status: 2 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('审批通过');
  });

  // 7. 权限隔离：sales 不能审批合同
  it('7a. sales 审批合同被拒 403', async () => {
    mockAuthSales();
    const res = await request(app)
      .post('/api/v1/contract/approve')
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ id: 500, approval_status: 2 });
    expect(res.status).toBe(403);
  });

  // 7b. 权限隔离：sales 数据范围=self，他人商机 404
  it('7b. sales 查看他人商机返回 404', async () => {
    mockAuthSales();
    mockGetDataPermissions.mockResolvedValue([]);   // → type='self'
    mockPool.query.mockResolvedValueOnce([[]]);      // detail query empty

    const res = await request(app)
      .get('/api/v1/opportunity/detail/200')
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(404);
  });

  // 8. 领域边界：商机创建不触发 UPDATE crm_customer
  it('8. 创建商机不触发 UPDATE crm_customer（领域边界）', async () => {
    mockAuthAdmin();
    mockPool.query
      .mockResolvedValueOnce([[{ id: 100, status: 'following' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ insertId: 201 }]);

    await request(app)
      .post('/api/v1/opportunity/add')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ customer_id: 100, name: '领域边界验证商机', expected_amount: 100000 });

    const allSqls = mockPool.query.mock.calls.map(c => c[0]);
    expect(allSqls.find(sql => /UPDATE\s+crm_customer/i.test(sql))).toBeUndefined();
  });
});
