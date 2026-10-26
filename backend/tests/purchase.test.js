const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockConnection = {
  release: jest.fn(),
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined)
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection)
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['purchase', 'purchase:add']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const purchaseRoutes = require('../routes/purchase');
app.use('/api/v1/purchase', purchaseRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('采购管理模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/v1/purchase/add', () => {
    it('应该返回400当缺少supplier_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/purchase/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '采购单', items: [{ product_name: '螺丝', quantity: 100, unit_price: 0.5 }] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建采购单', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count for order_no generation
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert order
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert items

      const res = await request(app)
        .post('/api/v1/purchase/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supplier_id: 1,
          title: '6月采购单',
          type: '常规',
          items: [
            { product_name: '螺丝', quantity: 100, unit_price: 0.5 },
            { product_name: '螺母', quantity: 200, unit_price: 0.3 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('order_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/purchase/list', () => {
    it('应该返回采购列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // list
          { id: 1, order_no: 'PO-260623-001', title: '6月采购单', status: '草稿' },
          { id: 2, order_no: 'PO-260623-002', title: '紧急采购', status: '已确认' }
        ]])
        .mockResolvedValueOnce([[{ total: 2 }]]); // count

      const res = await request(app)
        .post('/api/v1/purchase/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/v1/purchase/update-status', () => {
    it('应该返回200当正常更新采购单状态', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]])          // [P1-01] 数据范围锁采购单
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update status

      const res = await request(app)
        .post('/api/v1/purchase/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, status: '已确认' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('销售越权更新他人采购单应 403，且不执行 UPDATE', async () => {
      const salesToken = jwt.sign(
        { userId: 7, username: 'sales', roleId: 2, roleCode: 'sales', manageAll: false },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ id: 7, username: 'sales', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 2, role_id: 2, role_code: 'sales', view_all: 0, manage_all: 0 }]]);
      mockConnection.query.mockResolvedValueOnce([[]]); // 数据范围内查不到该采购单

      const res = await request(app)
        .post('/api/v1/purchase/update-status')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ id: 1, status: '已确认' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(403001);
      expect(mockConnection.query.mock.calls[0][0]).toContain('po.owner_id = ?');
      expect(mockConnection.query.mock.calls.some((c) => String(c[0]).includes('UPDATE crm_purchase_order'))).toBe(false);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/purchase/receipt/add', () => {
    it('应该返回200当正常到货验收', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // [P1-01] 数据范围锁采购单
        .mockResolvedValueOnce([[{ id: 1 }]]) // [P1-01] 明细归属校验
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count for receipt_no
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert receipt
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update item received_qty
        .mockResolvedValueOnce([[{ received_qty: 50, quantity: 100 }]]) // check item qty
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update order status

      const res = await request(app)
        .post('/api/v1/purchase/receipt/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: 1, item_id: 1, quantity: 50, quality_result: '合格' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('receipt_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('明细不属于该采购单应 400，且不写收货/库存（P1-01）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]);

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // 采购单在范围内
        .mockResolvedValueOnce([[]]);          // 明细不属于该采购单

      const res = await request(app)
        .post('/api/v1/purchase/receipt/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: 1, item_id: 999, quantity: 50, quality_result: '合格' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('不属于该采购单');
      expect(mockConnection.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO crm_purchase_receipt'))).toBe(false);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/purchase/receipt/add 缺少必填字段', () => {
    it('应该返回400当缺少order_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/purchase/receipt/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ item_id: 1, quantity: 50 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });

  describe('POST /api/v1/purchase/payment/add', () => {
    it('正常登记付款（数据范围内）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]);

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]])   // [P1-01] 数据范围锁采购单
        .mockResolvedValueOnce([{ insertId: 5 }]); // INSERT payment

      const res = await request(app)
        .post('/api/v1/purchase/payment/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: 1, amount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('销售越权给他人采购单付款应 403，且不 INSERT', async () => {
      const salesToken = jwt.sign(
        { userId: 7, username: 'sales', roleId: 2, roleCode: 'sales', manageAll: false },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 7, username: 'sales', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 2, role_id: 2, role_code: 'sales', view_all: 0, manage_all: 0 }]]);
      mockConnection.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/v1/purchase/payment/add')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ order_id: 1, amount: 100 });

      expect(res.status).toBe(403);
      expect(mockConnection.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO crm_purchase_payment'))).toBe(false);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/purchase/list')
        .send({ page: 1 });

      expect(res.status).toBe(401);
    });
  });
});

