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

const app = express();
app.use(express.json());

const purchaseRoutes = require('../routes/purchase');
app.use('/api/purchase', purchaseRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
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

  describe('POST /api/purchase/add', () => {
    it('应该返回400当缺少supplier_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/purchase/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '采购单', items: [{ product_name: '螺丝', quantity: 100, unit_price: 0.5 }] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建采购单', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      mockConnection.query
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count for order_no generation
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert order
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert items

      const res = await request(app)
        .post('/api/purchase/add')
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

  describe('POST /api/purchase/list', () => {
    it('应该返回采购列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // list
          { id: 1, order_no: 'PO-260623-001', title: '6月采购单', status: '草稿' },
          { id: 2, order_no: 'PO-260623-002', title: '紧急采购', status: '已确认' }
        ]])
        .mockResolvedValueOnce([[{ total: 2 }]]); // count

      const res = await request(app)
        .post('/api/purchase/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/purchase/update-status', () => {
    it('应该返回200当正常更新采购单状态', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update status

      const res = await request(app)
        .post('/api/purchase/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, status: '已确认' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/purchase/receipt/add', () => {
    it('应该返回200当正常到货验收', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      mockConnection.query
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count for receipt_no
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert receipt
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update item received_qty
        .mockResolvedValueOnce([[{ received_qty: 50, quantity: 100 }]]) // check item qty
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update order status

      const res = await request(app)
        .post('/api/purchase/receipt/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: 1, item_id: 1, quantity: 50, quality_result: '合格' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('receipt_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/purchase/receipt/add 缺少必填字段', () => {
    it('应该返回400当缺少order_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/purchase/receipt/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ item_id: 1, quantity: 50 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/purchase/list')
        .send({ page: 1 });

      expect(res.status).toBe(401);
    });
  });
});
