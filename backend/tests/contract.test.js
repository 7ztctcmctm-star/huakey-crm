const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    query: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
  })
};

jest.mock('../config/database', () => mockPool);

const app = express();
app.use(express.json());

const contractRoutes = require('../routes/contract');

app.use('/api/contract', contractRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('合同模块 - 参数验证', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/contract/add', () => {
    it('应该返回400当缺少合同标题', async () => {
      const res = await request(app)
        .post('/api/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当客户ID不是正整数', async () => {
      const res = await request(app)
        .post('/api/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '测试合同', customer_id: -1 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/contract/update', () => {
    it('应该返回400当缺少ID', async () => {
      const res = await request(app)
        .post('/api/contract/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '更新' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/contract/delete', () => {
    it('应该返回400当ID为0或负数', async () => {
      const res = await request(app)
        .post('/api/contract/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: -5 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/contract/list', () => {
    it('应该验证分页参数范围', async () => {
      const res = await request(app)
        .post('/api/contract/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 0, pageSize: 200 });

      expect(res.status).toBe(400);
    });
  });
});
