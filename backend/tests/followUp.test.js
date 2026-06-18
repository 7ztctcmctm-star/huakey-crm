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

const followUpRoutes = require('../routes/followUp');
app.use('/api/follow-up', followUpRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('跟进模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/follow-up/add', () => {
    it('应该返回400当缺少customer_id', async () => {
      const res = await request(app)
        .post('/api/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '测试跟进内容' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少content', async () => {
      const res = await request(app)
        .post('/api/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当创建成功', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司' }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, content: '电话跟进客户' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});
