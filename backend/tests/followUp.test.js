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
app.use('/api/v1/follow-up', followUpRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('跟进模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/follow-up/add', () => {
    it('应该返回400当缺少customer_id', async () => {
      const res = await request(app)
        .post('/api/v1/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '测试跟进内容' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少content', async () => {
      const res = await request(app)
        .post('/api/v1/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当创建成功', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司' }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);
      // 兜底：addFollowUp 在 INSERT 之后还会执行 UPDATE last_follow_time / UPDATE reminder / SELECT status 等查询
      mockPool.query.mockResolvedValue([[]]);

      const res = await request(app)
        .post('/api/v1/follow-up/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, content: '电话跟进客户' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});

