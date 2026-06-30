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
  getUserPermissions: jest.fn().mockResolvedValue(["search"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([{ module: 'customer', data_scope: 'all' }])
}));

jest.mock('../middleware/permission', () => {
  const original = jest.requireActual('../middleware/permission');
  return {
    ...original,
    buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '1=1', params: [] })
  };
});

const app = express();
app.use(express.json());
app.use('/api/v1/search', require('../routes/search'));

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('全局搜索模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/search/global', () => {
    it('应该返回400当keyword为空', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/v1/search/global')
        .set('Authorization', `Bearer ${token}`)
        .query({ keyword: '' });

      expect(res.status).toBe(400);
    });

    it('应该返回400当keyword少于2字符', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/v1/search/global')
        .set('Authorization', `Bearer ${token}`)
        .query({ keyword: 'a' });

      expect(res.status).toBe(400);
    });

    it('应该返回400当keyword超过100字符', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/v1/search/global')
        .set('Authorization', `Bearer ${token}`)
        .query({ keyword: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('应该返回200当搜索客户匹配', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', contact_name: '张三', phone: '13800138000', level: 'A' }]]) // customers
        .mockResolvedValueOnce([[]]) // contracts
        .mockResolvedValueOnce([[]]) // opportunities
        .mockResolvedValueOnce([[]]); // quotes

      const res = await request(app)
        .get('/api/v1/search/global')
        .set('Authorization', `Bearer ${token}`)
        .query({ keyword: '测试' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.customers).toHaveLength(1);
      expect(res.body.data.customers[0].company_name).toBe('测试公司');
    });

    it('应该返回200当搜索无匹配返回空结果', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]]) // customers
        .mockResolvedValueOnce([[]]) // contracts
        .mockResolvedValueOnce([[]]) // opportunities
        .mockResolvedValueOnce([[]]); // quotes

      const res = await request(app)
        .get('/api/v1/search/global')
        .set('Authorization', `Bearer ${token}`)
        .query({ keyword: '不存在的关键词' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.customers).toHaveLength(0);
      expect(res.body.data.contracts).toHaveLength(0);
      expect(res.body.data.opportunities).toHaveLength(0);
      expect(res.body.data.quotes).toHaveLength(0);
    });

    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/search/global')
        .query({ keyword: '测试' });

      expect(res.status).toBe(401);
    });
  });
});

