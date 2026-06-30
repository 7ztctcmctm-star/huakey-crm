const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: () => ({ toString: () => 'abc123' })
}));

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

const app = express();
app.use(express.json());

const apiPlatformRoutes = require('../routes/api-platform');
app.use('/api/platform', apiPlatformRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('API平台模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/platform/keys', () => {
    it('应该返回API Key列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // keys list
          { id: 1, name: '测试密钥', api_key: 'crm_abc123def456', permissions: '["customer:read"]', rate_limit: 100, status: 1 }
        ]]);

      const res = await request(app)
        .get('/api/platform/keys')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].api_key).toMatch(/^\*\*\*\*/);
    });
  });

  describe('POST /api/platform/keys', () => {
    it('应该返回200当正常创建Key', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/platform/keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新密钥' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('api_key');
      expect(res.body.data).toHaveProperty('api_secret');
    });
  });

  describe('POST /api/platform/keys/:id/regenerate', () => {
    it('应该返回200当重新生成密钥', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/platform/keys/1/regenerate')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('api_key');
      expect(res.body.data).toHaveProperty('api_secret');
    });
  });

  describe('DELETE /api/platform/keys/:id', () => {
    it('应该返回200当删除Key', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/platform/keys/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/platform/keys');

      expect(res.status).toBe(401);
    });
  });
});
