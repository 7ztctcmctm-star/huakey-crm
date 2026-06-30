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

// Mock auth middleware - 让 mock 队列完全留给业务逻辑
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', viewAll: true, manageAll: true };
    next();
  }
}));

// Mock permission middleware
jest.mock('../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next()
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
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('\u5e93\u5b58\u7ba1\u7406\u6a21\u5757', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/inventory/in \u7f3a\u5c11\u5fc5\u586b\u5b57\u6bb5', () => {
    it('\u5e94\u8be5\u8fd4\u56de400\u5f53\u7f3a\u5c11product_id', async () => {
      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });

  describe('POST /api/inventory/in', () => {
    it('\u5e94\u8be5\u8fd4\u56de200\u5f53\u6b63\u5e38\u5165\u5e93', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, stock: 50 }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE stock
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT movement

      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: 50, remark: '\u624b\u52a8\u5165\u5e93' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.before).toBe(50);
      expect(res.body.data.after).toBe(100);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('GET /api/inventory/list', () => {
    it('\u5e94\u8be5\u8fd4\u56de\u5e93\u5b58\u5217\u8868', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '\u87ba\u4e1d', code: 'P001', stock: 100, stock_status: 'normal' },
          { id: 2, name: '\u87ba\u6bcd', code: 'P002', stock: 5, stock_status: 'low' }
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
    it('\u5e94\u8be5\u8fd4\u56de200\u5f53\u6b63\u5e38\u51fa\u5e93', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, stock: 100 }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE stock
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT movement

      const res = await request(app)
        .post('/api/inventory/out')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: 30, remark: '\u624b\u52a8\u51fa\u5e93' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.before).toBe(100);
      expect(res.body.data.after).toBe(70);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/inventory/in \u4ea7\u54c1\u4e0d\u5b58\u5728', () => {
    it('\u5e94\u8be5\u8fd4\u56de404\u5f53\u4ea7\u54c1\u4e0d\u5b58\u5728', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[undefined]]); // SELECT FOR UPDATE -> product not found

      const res = await request(app)
        .post('/api/inventory/in')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 999, quantity: 10 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });
});
