const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

const app = express();
app.use(express.json());

const customerRoutes = require('../routes/customer');

app.use('/api/customer', customerRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('客户模块 - 参数验证', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe('POST /api/customer/add', () => {
    it('应该返回400当缺少公司名称', async () => {
      const res = await request(app)
        .post('/api/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ contact_name: '张三' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('校验失败');
    });

    it('应该返回400当手机号格式不正确', async () => {
      const res = await request(app)
        .post('/api/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          company_name: '测试公司',
          phone: '12345'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('校验失败');
    });
  });
});
