const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');

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

const app = express();
app.use(express.json());

const authRoutes = require('../routes/auth');

app.use('/api/auth', authRoutes);

describe('认证模块 - 参数验证', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/auth/login', () => {
    it('应该返回400当缺少用户名或密码', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回401当用户名不存在', async () => {
      mockPool.query.mockResolvedValue([[]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('用户名或密码错误');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('应该返回200成功登出', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid_token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('登出成功');
    });
  });
});
