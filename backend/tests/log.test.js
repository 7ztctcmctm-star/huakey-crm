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
  getUserPermissions: jest.fn().mockResolvedValue(['system:log', 'system:log:delete', 'log:export']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const logRoutes = require('../routes/log');
app.use('/api/v1/log', logRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('操作日志模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/log/list', () => {
    it('应该返回200和分页日志列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 100 }]])  // count query
        .mockResolvedValueOnce([[                     // data query
          { id: 1, module: 'auth', action: '登录', create_time: '2025-01-01' },
          { id: 2, module: 'customer', action: '新增客户', create_time: '2025-01-02' }
        ]]);

      const res = await request(app)
        .post('/api/v1/log/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data.total).toBe(100);
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    it('应该支持按模块筛选', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 5 }]])
        .mockResolvedValueOnce([[{ id: 1, module: 'auth', action: '登录' }]]);

      const res = await request(app)
        .post('/api/v1/log/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20, module: 'auth' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该支持按日期范围筛选', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([[{ id: 1, module: 'customer', action: '新增' }]]);

      const res = await request(app)
        .post('/api/v1/log/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20, startDate: '2025-01-01', endDate: '2025-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/v1/log/detail/:id', () => {
    it('应该返回404当日志不存在', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]]); // log not found

      const res = await request(app)
        .get('/api/v1/log/detail/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });

    it('应该返回200和日志详情', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[
          { id: 1, module: 'auth', action: '登录', method: 'POST', url: '/api/v1/auth/login', user_name: '管理员', ip_address: '127.0.0.1', status: 1, create_time: '2025-01-01 10:00:00' }
        ]]);

      const res = await request(app)
        .get('/api/v1/log/detail/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('module', 'auth');
      expect(res.body.data).toHaveProperty('action', '登录');
    });
  });

  describe('GET /api/v1/log/modules', () => {
    it('应该返回200和模块列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ module: 'auth' }, { module: 'customer' }, { module: 'contract' }]]);

      const res = await request(app)
        .get('/api/v1/log/modules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toContain('auth');
      expect(res.body.data).toContain('customer');
    });
  });
});

