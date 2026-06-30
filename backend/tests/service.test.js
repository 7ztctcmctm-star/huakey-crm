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

const serviceRoutes = require('../routes/service');
app.use('/api/service', serviceRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('售后模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/service/types', () => {
    it('应该返回200和服务类型列表', async () => {
      const res = await request(app)
        .get('/api/service/types')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/service/list', () => {
    it('应该返回200和工单列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, order_no: 'SO-001', title: '测试工单', status: 1 }]]);

      const res = await request(app)
        .post('/api/service/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
    });
  });
});
