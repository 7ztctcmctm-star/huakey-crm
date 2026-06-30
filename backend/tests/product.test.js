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
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

const app = express();
app.use(express.json());

const productRoutes = require('../routes/product');
app.use('/api/v1/product', productRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('产品模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/product/list', () => {
    it('应该返回200和产品列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, name: '测试产品', code: 'P001', price: 100 }]]);

      const res = await request(app)
        .post('/api/v1/product/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('POST /api/v1/product/add', () => {
    it('应该返回400当缺少必填字段name', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'P001', price: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当创建成功', async () => {
      mockPool.query.mockResolvedValue([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新产品', price: 200 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});

