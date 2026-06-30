const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    release: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    query: jest.fn()
  })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

const app = express();
app.use(express.json());

const quoteRoutes = require('../routes/quote');
app.use('/api/quote', quoteRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('报价模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/quote/add', () => {
    it('应该返回400当缺少customer_id', async () => {
      const res = await request(app)
        .post('/api/quote/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ product_id: 1, quantity: 1, unit_price: 100 }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('客户ID');
    });

    it('应该返回400当缺少报价项', async () => {
      const res = await request(app)
        .post('/api/quote/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, items: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('报价项');
    });
  });
});
