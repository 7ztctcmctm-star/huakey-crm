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

// [P1-23] 通过真实 ModuleRegistry 挂载，而不是手工 app.use('/api/v1/platform')。
// 手工指定前缀会把「注册名 api-platform → 实际 /api-platform」的缺陷掩盖成测试通过。
require('../routes/api-platform');
const registry = require('../core/ModuleRegistry');

const apiRouter = express.Router();
for (const { prefix, router } of registry.getAllRoutes()) {
  apiRouter.use(prefix, router);
}

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

const fs = require('fs');
const path = require('path');

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('API平台模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/platform/keys', () => {
    it('应该返回API Key列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // keys list
          { id: 1, name: '测试密钥', api_key: 'crm_abc123def456', permissions: '["customer:read"]', rate_limit: 100, status: 1 }
        ]]);

      const res = await request(app)
        .get('/api/v1/platform/keys')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].api_key).toMatch(/^\*\*\*\*/);
    });
  });

  describe('POST /api/v1/platform/keys', () => {
    it('应该返回200当正常创建Key', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/platform/keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新密钥' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('api_key');
      expect(res.body.data).toHaveProperty('api_secret');
    });
  });

  describe('POST /api/v1/platform/keys/:id/regenerate', () => {
    it('应该返回200当重新生成密钥', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/v1/platform/keys/1/regenerate')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('api_key');
      expect(res.body.data).toHaveProperty('api_secret');
    });
  });

  describe('DELETE /api/v1/platform/keys/:id', () => {
    it('应该返回200当删除Key', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/v1/platform/keys/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/platform/keys');

      expect(res.status).toBe(401);
    });
  });

  // [P1-23] 前后端路径契约：注册名前缀必须与 api/system.js 的调用一致
  describe('路径契约（P1-23）', () => {
    it('ModuleRegistry 应以 /platform 注册，而非 /api-platform', () => {
      const prefixes = registry.getAllRoutes().map((r) => r.prefix);
      expect(prefixes).toContain('/platform');
      expect(prefixes).not.toContain('/api-platform');
    });

    it('前端 API 平台调用全部使用 /platform/ 前缀', () => {
      const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/api/system.js'), 'utf8');
      expect(source).not.toContain('/api-platform');
      expect((source.match(/\/platform\//g) || []).length).toBeGreaterThanOrEqual(9);
    });
  });
});

