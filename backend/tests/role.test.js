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
  getUserPermissions: jest.fn().mockResolvedValue(['system:role', 'system:role:add', 'system:role:edit', 'system:role:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

const app = express();
app.use(express.json());

const roleRoutes = require('../routes/role');
app.use('/api/role', roleRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('角色管理模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/role/add', () => {
    it('应该返回400当缺少name字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/role/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'test_role' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少code字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/role/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试角色' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建角色', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 5 }]);

      const res = await request(app)
        .post('/api/role/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新角色', code: 'new_role', description: '测试角色' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/role/update', () => {
    it('应该返回400当缺少id字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/role/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '修改名称' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常更新角色', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]); // users with this role

      const res = await request(app)
        .post('/api/role/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, name: '修改后的角色' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/role/delete', () => {
    it('应该返回400当缺少id字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/role/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当角色下有用户时拒绝删除', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ cnt: 3 }]]); // users check

      const res = await request(app)
        .post('/api/role/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('用户');
    });

    it('应该返回200当正常删除角色', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ cnt: 0 }]])  // no users
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]]); // users with deleted role (for cache invalidation)

      const res = await request(app)
        .post('/api/role/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});
