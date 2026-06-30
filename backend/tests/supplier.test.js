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

const supplierRoutes = require('../routes/supplier');

app.use('/api/supplier', supplierRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('供应商模块 - 参数验证', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/supplier/add', () => {
    it('应该返回400当缺少供应商名称', async () => {
      const res = await request(app)
        .post('/api/supplier/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ contact_person: '张三' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当邮箱格式不正确', async () => {
      const res = await request(app)
        .post('/api/supplier/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试供应商', contact_email: 'invalid-email' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('校验失败');
    });

    it('应该返回400当类型不在允许范围内', async () => {
      const res = await request(app)
        .post('/api/supplier/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试供应商', type: '未知类型' });

      expect(res.status).toBe(400);
    });

    it('应该返回400当等级不在允许范围内', async () => {
      const res = await request(app)
        .post('/api/supplier/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试供应商', level: '超级' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/supplier/contact/add', () => {
    it('应该返回400当缺少联系人姓名', async () => {
      const res = await request(app)
        .post('/api/supplier/contact/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplier_id: 1 });

      expect(res.status).toBe(400);
    });

    it('应该返回400当手机号格式不正确', async () => {
      const res = await request(app)
        .post('/api/supplier/contact/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ supplier_id: 1, name: '张三', mobile: '12345' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/supplier/delete', () => {
    it('应该返回400当缺少ID', async () => {
      const res = await request(app)
        .post('/api/supplier/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
