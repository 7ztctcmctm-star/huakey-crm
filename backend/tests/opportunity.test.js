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

const opportunityRoutes = require('../routes/opportunity');
app.use('/api/opportunity', opportunityRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('商机模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/opportunity/list', () => {
    it('应该返回200和商机列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, name: '测试商机', stage: 1 }]]);

      const res = await request(app)
        .post('/api/opportunity/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
    });
  });

  describe('POST /api/opportunity/add', () => {
    it('应该返回400当缺少name', async () => {
      const res = await request(app)
        .post('/api/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少customer_id', async () => {
      const res = await request(app)
        .post('/api/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新商机' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });
});
