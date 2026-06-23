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
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/response', () => ({
  success: (res, data, message) => res.json({ code: 200, message: message || 'success', data }),
  fail: (res, message) => res.status(400).json({ code: 400, message, data: null }),
  serverError: (res, message) => res.status(500).json({ code: 500, message, data: null }),
  notFound: (res, message) => res.status(404).json({ code: 404, message, data: null })
}));

const app = express();
app.use(express.json());

const contractTemplateRoutes = require('../routes/contractTemplate');
app.use('/api/contract-template', contractTemplateRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('合同模板模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/contract-template/list', () => {
    it('应该返回模板列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '标准合同模板', amount: 0, payment_terms: '月结30天' },
          { id: 2, name: '大客户合同模板', amount: 100000, payment_terms: '预付50%' }
        ]]);

      const res = await request(app)
        .get('/api/contract-template/list')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/contract-template/manage (add)', () => {
    it('应该返回200当正常创建模板', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ insertId: 3 }]); // insert

      const res = await request(app)
        .post('/api/contract-template/manage')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'add', name: '新合同模板', amount: 50000, payment_terms: '验收后付清' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/contract-template/manage (delete)', () => {
    it('应该返回200当正常删除模板', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .post('/api/contract-template/manage')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'delete', id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/contract-template/list');

      expect(res.status).toBe(401);
    });
  });
});
