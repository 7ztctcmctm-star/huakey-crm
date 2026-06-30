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
  getUserPermissions: jest.fn().mockResolvedValue(['system:user', 'system:user:add', 'system:user:edit', 'system:user:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const userRoutes = require('../routes/user');
app.use('/api/v1/user', userRoutes);

const generateToken = (userId = 1) => {
  return jwt.sign({ userId, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('用户管理模块', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/user/add', () => {
    it('应该返回400当缺少username字段', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/user/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'Pass123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当缺少password字段', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/user/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'testuser' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当用户名已存在', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 99 }]]); // user exists

      const res = await request(app)
        .post('/api/v1/user/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'existing_user', password: 'Pass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('已存在');
    });

    it('应该返回200当正常创建用户', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]])  // username not exists
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const res = await request(app)
        .post('/api/v1/user/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'newuser', password: 'Pass123', real_name: '新用户' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/v1/user/update', () => {
    it('应该返回400当缺少id字段', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/user/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ real_name: '修改名称' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常更新用户', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 2 }]])  // user exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/user/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 2, real_name: '修改后的名称' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/user/delete', () => {
    it('应该返回400当缺少id字段', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/user/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当尝试删除自己', async () => {
      const token = generateToken(1); // userId = 1
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]); // user exists

      const res = await request(app)
        .post('/api/v1/user/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('当前登录用户');
    });

    it('应该返回200当正常删除用户', async () => {
      const token = generateToken(1); // userId = 1
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 2 }]])  // user exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/user/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 2 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});

