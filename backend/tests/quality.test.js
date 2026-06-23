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
  getUserPermissions: jest.fn().mockResolvedValue(['data_quality:check']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const qualityRoutes = require('../routes/customer/quality');
app.use('/api/customer', qualityRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('数据质量检查模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/customer/quality-check', () => {
    it('应该返回质量检查结果', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ total: 100 }]]) // total count
        .mockResolvedValueOnce([[{ dup_count: 5 }]]) // duplicate count
        .mockResolvedValueOnce([[ // duplicate details
          { name: '重复公司', cnt: 3, ids: '1,2,3' }
        ]])
        .mockResolvedValueOnce([[{ missing: 2 }]]) // missing count
        .mockResolvedValueOnce([[{ invalid: 1 }]]) // invalid count
        .mockResolvedValueOnce([{ insertId: 1 }]); // save report

      const res = await request(app)
        .post('/api/customer/quality-check')
        .set('Authorization', `Bearer ${token}`)
        .send({ table: 'crm_customer' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('total_count');
      expect(res.body.data).toHaveProperty('duplicate_count');
      expect(res.body.data).toHaveProperty('quality_score');
      expect(res.body.data.total_count).toBe(100);
    });
  });

  describe('POST /api/customer/quality-report', () => {
    it('应该返回质量报告', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // report
          { id: 1, table_name: 'crm_customer', total_count: 100, duplicate_count: 5, quality_score: 85.5, check_time: '2026-06-23 10:00:00' }
        ]]);

      const res = await request(app)
        .post('/api/customer/quality-report')
        .set('Authorization', `Bearer ${token}`)
        .send({ table: 'crm_customer' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('quality_score');
    });
  });

  describe('POST /api/customer/quality-report?module=xxx', () => {
    it('应该按模块筛选返回质量报告', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // report for supplier
          { id: 2, table_name: 'crm_supplier', total_count: 50, duplicate_count: 2, quality_score: 92.0, check_time: '2026-06-23 11:00:00' }
        ]]);

      const res = await request(app)
        .post('/api/customer/quality-report')
        .set('Authorization', `Bearer ${token}`)
        .send({ table: 'crm_supplier' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.table_name).toBe('crm_supplier');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/customer/quality-check')
        .send({ table: 'crm_customer' });

      expect(res.status).toBe(401);
    });
  });
});
