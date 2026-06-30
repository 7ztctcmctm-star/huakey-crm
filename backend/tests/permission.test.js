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

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['system:permission', 'system:permission:add', 'system:permission:edit', 'system:permission:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

const app = express();
app.use(express.json());

const permissionRoutes = require('../routes/permission');
app.use('/api/permission', permissionRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('权限管理模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/permission/add', () => {
    it('应该返回400当缺少name字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/permission/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'test:perm', type: 'menu' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少code字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/permission/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试权限', type: 'menu' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当权限编码已存在', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]); // code exists

      const res = await request(app)
        .post('/api/permission/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试权限', code: 'existing:code', type: 'menu' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('已存在');
    });

    it('应该返回200当正常新增权限', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]])  // code not exists
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const res = await request(app)
        .post('/api/permission/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新权限', code: 'new:perm', type: 'menu' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/permission/role/:roleId', () => {
    it('应该返回200和角色权限列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ permission_id: 1 }, { permission_id: 2 }, { permission_id: 5 }]]);

      const res = await request(app)
        .get('/api/permission/role/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toEqual([1, 2, 5]);
    });

    it('应该返回空数组当角色无权限', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/permission/role/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/permission/delete-node', () => {
    it('应该返回400当缺少id字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/permission/delete-node')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当存在子权限时拒绝删除', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 2 }, { id: 3 }]]); // has children

      const res = await request(app)
        .post('/api/permission/delete-node')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('子权限');
    });
  });
});
