/**
 * P1-08：联系人列表跨客户 IDOR 收口（路由级）。
 *
 * 审计结论：POST /customers/contact/list 只挂 checkPermission('customer:view')，
 * 服务层仅按 customer_id 查询，任意持 view 权限的用户可读取他人客户的联系人
 * （电话/微信/邮箱）。修复：路由追加 checkDataPermission + buildDataPermissionWhere，
 * 服务层 JOIN crm_customer 并应用行级条件。
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

jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:view']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/v1/customers/contact', require('../../routes/customer/contact'));
app.use(appErrorHandler);
app.use(globalErrorHandler);

function salesToken(userId = 7) {
  return jwt.sign(
    { userId, username: 'sales7', roleId: 3, roleCode: 'sales', manageAll: false },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const SALES_USER_ROW = {
  id: 7, username: 'sales7', status: 1, must_change_password: 0,
  password_changed_at: null, fresh_role_id: 3, role_id: 3,
  role_code: 'sales', view_all: 0, manage_all: 0
};

describe('POST /customers/contact/list 数据范围（P1-08）', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('sales（self 范围）列表 SQL 带客户归属条件，参数含当前用户', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]]) // token 黑名单
      .mockResolvedValueOnce([[SALES_USER_ROW]]) // 实时角色查询
      .mockResolvedValueOnce([[{ total: 1 }]]) // count
      .mockResolvedValueOnce([[{ id: 3, name: '张三' }]]); // rows

    const res = await request(app)
      .post('/api/v1/customers/contact/list')
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ customer_id: 99 });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);

    const countCall = mockPool.query.mock.calls.find(c => /COUNT\(\*\)/.test(c[0]));
    const rowsCall = mockPool.query.mock.calls.find(c => /ORDER BY ct\.is_primary/.test(c[0]));
    expect(countCall[0]).toContain('JOIN crm_customer c');
    expect(countCall[0]).toContain('c.owner_id = ?');
    expect(countCall[1]).toEqual([99, 7]);
    expect(rowsCall[0]).toContain('JOIN crm_customer c');
    expect(rowsCall[1]).toEqual([99, 7, 20, 0]);
  });

  it('manageAll 用户不追加归属条件（仍走 join 排除已删客户）', async () => {
    const bossToken = jwt.sign(
      { userId: 1, username: 'boss', roleId: 1, roleCode: 'boss', manageAll: true },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ...SALES_USER_ROW, id: 1, role_id: 1, role_code: 'boss', view_all: 1, manage_all: 1 }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/v1/customers/contact/list')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ customer_id: 99 });

    expect(res.status).toBe(200);
    const countCall = mockPool.query.mock.calls.find(c => /COUNT\(\*\)/.test(c[0]));
    expect(countCall[0]).not.toContain('c.owner_id');
    expect(countCall[0]).toContain('c.deleted_at IS NULL');
    expect(countCall[1]).toEqual([99]);
  });
});
