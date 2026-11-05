/**
 * P1-09：成本价字段级脱敏（路由级运行时验证）。
 *
 * 审计结论：productService.listProducts 显式 SELECT cost_price，前端仅用 v-if 隐藏，
 * 响应体仍带成本价。复核后发现 C1 已挂 checkFieldPermission('product') + stripRestrictedFields，
 * 但存在两个未收口点，本用例锁定：
 *   1) 销售（manageAll=0）列表响应不得含 cost_price；老板（manageAll=1）可含；
 *   2) 受限用户编辑产品时回传的 cost_price 必须被后端丢弃，
 *      否则前端回填的 0 会覆盖真实成本（数据损坏）。
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../../config/database', () => mockPool);

jest.mock('../../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

const { installAuthAwareQuery } = require('../helpers/authMock');
const { getUserPermissions } = require('../../services/permissionService');
const { appErrorHandler, globalErrorHandler } = require('../../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/v1/product', require('../../routes/product'));
app.use(appErrorHandler);
app.use(globalErrorHandler);

const PRODUCT_ROW = { id: 1, name: '产品A', code: 'P1', price: 200, cost_price: 80, stock: 10 };

function token(roleCode, roleId, userId) {
  return jwt.sign(
    { userId, username: roleCode, roleId, roleCode, manageAll: false },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
}

function businessQuery(sql) {
  const s = String(sql);
  if (/COUNT\(\*\)/.test(s)) return [[{ total: 1 }]];
  if (/FROM crm_product/.test(s) && /WHERE id = \?/.test(s)) return [[{ ...PRODUCT_ROW }]];
  if (/FROM crm_product/.test(s)) return [[{ ...PRODUCT_ROW }]];
  if (/UPDATE crm_product/.test(s)) return [{ affectedRows: 1 }];
  return [[]];
}

describe('产品成本价字段权限（P1-09）', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    getUserPermissions.mockReset();
  });

  it('销售（manageAll=0）产品列表响应不含 cost_price', async () => {
    getUserPermissions.mockResolvedValue(['product']);
    installAuthAwareQuery(mockPool, businessQuery, { role_id: 3, role_code: 'sales', view_all: 0, manage_all: 0 });

    const res = await request(app)
      .post('/api/v1/product/list')
      .set('Authorization', `Bearer ${token('sales', 3, 7)}`)
      .send({ page: 1, pageSize: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.list[0]).not.toHaveProperty('cost_price');
    expect(res.body.data.list[0].price).toBe(200);
  });

  it('老板（manageAll=1）产品列表可含 cost_price', async () => {
    installAuthAwareQuery(mockPool, businessQuery, { role_id: 1, role_code: 'boss', view_all: 1, manage_all: 1 });

    const res = await request(app)
      .post('/api/v1/product/list')
      .set('Authorization', `Bearer ${token('boss', 1, 1)}`)
      .send({ page: 1, pageSize: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.list[0].cost_price).toBe(80);
  });

  it('受限用户编辑产品：UPDATE 不得包含 cost_price（防止 0 覆盖真实成本）', async () => {
    getUserPermissions.mockResolvedValue(['product:edit']);
    installAuthAwareQuery(mockPool, businessQuery, { role_id: 2, role_code: 'manager', view_all: 1, manage_all: 0 });

    const res = await request(app)
      .post('/api/v1/product/update')
      .set('Authorization', `Bearer ${token('manager', 2, 3)}`)
      .send({ id: 1, name: '产品A改', cost_price: 0 });

    expect(res.status).toBe(200);
    const updateCall = mockPool.query.mock.calls.find(c => /UPDATE crm_product/.test(c[0]));
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toContain('name = ?');
    expect(updateCall[0]).not.toContain('cost_price');
    expect(updateCall[1]).not.toContain(0);
  });

  it('老板编辑产品：cost_price 正常更新', async () => {
    installAuthAwareQuery(mockPool, businessQuery, { role_id: 1, role_code: 'boss', view_all: 1, manage_all: 1 });

    const res = await request(app)
      .post('/api/v1/product/update')
      .set('Authorization', `Bearer ${token('boss', 1, 1)}`)
      .send({ id: 1, name: '产品A改', cost_price: 88 });

    expect(res.status).toBe(200);
    const updateCall = mockPool.query.mock.calls.find(c => /UPDATE crm_product/.test(c[0]));
    expect(updateCall[0]).toContain('cost_price = ?');
    expect(updateCall[1]).toContain(88);
  });

  it('受限用户新增产品：cost_price 被丢弃（按 0 落库）', async () => {
    getUserPermissions.mockResolvedValue(['product:add']);
    installAuthAwareQuery(mockPool, (sql) => {
      if (/INSERT INTO crm_product/.test(sql)) return [{ insertId: 9 }];
      return businessQuery(sql);
    }, { role_id: 2, role_code: 'manager', view_all: 1, manage_all: 0 });

    const res = await request(app)
      .post('/api/v1/product/add')
      .set('Authorization', `Bearer ${token('manager', 2, 3)}`)
      .send({ name: '新产品', price: 100, cost_price: 55 });

    expect(res.status).toBe(200);
    const insertCall = mockPool.query.mock.calls.find(c => /INSERT INTO crm_product/.test(c[0]));
    expect(insertCall[1]).toContain(0);
    expect(insertCall[1]).not.toContain(55);
  });
});
