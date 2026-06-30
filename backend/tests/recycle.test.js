const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['recycle_bin:view', 'data:restore']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/softDelete', () => ({
  restore: jest.fn().mockResolvedValue(true),
  permanentDelete: jest.fn().mockResolvedValue(true),
  getDeletedList: jest.fn().mockResolvedValue({ list: [{ id: 1, company_name: '已删除客户' }], total: 1 }),
  softDelete: jest.fn(),
  softDeleteBatch: jest.fn()
}));

const app = express();
app.use(express.json());

const recycleRoutes = require('../routes/recycle');
app.use('/api/recycle', recycleRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('回收站模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe('POST /api/recycle/list', () => {
    it('应该返回回收站列表', async () => {
      // 8 module stats queries (one per TABLE_CONFIG entry)
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ cnt: 5 }]]) // customer
        .mockResolvedValueOnce([[{ cnt: 2 }]]) // opportunity
        .mockResolvedValueOnce([[{ cnt: 1 }]]) // contract
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // quote
        .mockResolvedValueOnce([[{ cnt: 3 }]]) // supplier
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // purchase
        .mockResolvedValueOnce([[{ cnt: 1 }]]) // service
        .mockResolvedValueOnce([[{ cnt: 2 }]]); // product

      const res = await request(app)
        .post('/api/recycle/list')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.stats).toHaveLength(8);
    });
  });

  describe('POST /api/recycle/restore', () => {
    it('应该返回200当正常恢复记录', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/recycle/restore')
        .set('Authorization', `Bearer ${token}`)
        .send({ module: 'customer', id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/recycle/permanent-delete', () => {
    it('应该返回200当正常永久删除', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/recycle/permanent-delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ module: 'customer', id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/recycle/list')
        .send({});

      expect(res.status).toBe(401);
    });
  });
});
