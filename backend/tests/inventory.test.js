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
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['purchase:add']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const inventoryRoutes = require('../routes/inventory');
app.use('/api/inventory', inventoryRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('库存管理模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/inventory/in 缺少必填字段', () => {
    it('应该返回400当缺少product_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });

  describe('POST /api/inventory/in', () => {
    it('应该返回200当正常入库', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, stock: 50 }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE stock
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT movement

      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: '50', remark: '手动入库' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.before).toBe(50);
      expect(res.body.data.after).toBe(100);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('GET /api/inventory/list', () => {
    it('应该返回库存列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '螺丝', code: 'P001', stock: 100, stock_status: 'normal' },
          { id: 2, name: '螺母', code: 'P002', stock: 5, stock_status: 'low' }
        ]]);

      const res = await request(app)
        .get('/api/inventory/list')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/inventory/out', () => {
    it('应该返回200当正常出库', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, stock: 100 }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE stock
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT movement

      const res = await request(app)
        .post('/api/inventory/out')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: '30', remark: '手动出库' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.before).toBe(100);
      expect(res.body.data.after).toBe(70);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/inventory/in 产品不存在', () => {
    it('应该返回404当产品不存在', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      mockConnection.query
        .mockResolvedValueOnce([[undefined]]); // SELECT FOR UPDATE → product not found

      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 999, quantity: 10 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/inventory/list');

      expect(res.status).toBe(401);
    });
  });
});
