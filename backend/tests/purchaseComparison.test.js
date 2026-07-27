const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    release: jest.fn(),
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['purchase', 'purchase:comparison']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

app.use('/api/v1/purchase/comparison', require('../routes/purchase/comparison'));
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = (userId = 1, roleCode = 'super_admin', manageAll = true) => {
  return jwt.sign({ userId, username: 'admin', roleId: 1, roleCode, manageAll }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('采购比价模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/purchase/comparison/create', () => {
    it('应该返回400当缺少title', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role

      const res = await request(app)
        .post('/api/v1/purchase/comparison/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ request_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回201当正常创建', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/purchase/comparison/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '螺丝比价', product_name: '螺丝', quantity: 100 });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/v1/purchase/comparison/list', () => {
    it('应该返回比价单列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, title: '螺丝比价', status: 'draft', supplier_count: 0 }]]); // list

      const res = await request(app)
        .post('/api/v1/purchase/comparison/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('GET /api/v1/purchase/comparison/detail/:id', () => {
    it('应该返回404当比价单不存在', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[undefined]]); // comparison not found

      const res = await request(app)
        .get('/api/v1/purchase/comparison/detail/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });
  });

  describe('POST /api/v1/purchase/comparison/:id/add-quote', () => {
    it('应该返回200当正常添加报价', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ id: 1 }]]) // comparison exists
        .mockResolvedValueOnce([[undefined]]) // no duplicate
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert quote

      const res = await request(app)
        .post('/api/v1/purchase/comparison/1/add-quote')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplier_id: 1, unit_price: 0.5, total_price: 50 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/purchase/comparison/:id/select-supplier', () => {
    it('应该返回200当选择供应商', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ status: 'draft' }]]) // comparison
        .mockResolvedValueOnce([[{ id: 1 }]]) // valid supplier
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/v1/purchase/comparison/1/select-supplier')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplier_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/purchase/comparison/:id/cancel', () => {
    it('应该返回200当取消比价单', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ status: 'draft' }]]) // comparison
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/v1/purchase/comparison/1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});
