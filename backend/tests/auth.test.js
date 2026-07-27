const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const createMockConnection = () => ({
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
});

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(createMockConnection())
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:view', 'product:view']),
  getMenuPermissions: jest.fn().mockResolvedValue([{ code: 'dashboard', name: '首页' }]),
  getDataPermissions: jest.fn().mockResolvedValue([{ module: 'customer', data_scope: 'all' }])
}));

const app = express();
app.use(express.json());

const authRoutes = require('../routes/auth');
app.use('/api/v1/auth', authRoutes);

const generateToken = (user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('认证模块', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/auth/login', () => {
    it('应该返回400当缺少必填字段', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当验证码过期', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'Pass123', captcha: 'abcd', captchaKey: 'expired_key' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('验证码');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('应该返回200和用户信息当token有效', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValue([[
        { id: 1, username: 'admin', real_name: '管理员', phone: '13800138000', email: 'admin@test.com', dept_id: 1, role_id: 1, status: 1, view_all: 1, manage_all: 1 }
      ]]);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('username', 'admin');
      expect(res.body.data).toHaveProperty('realName', '管理员');
    });

    it('应该返回401当无token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('应该返回400当旧密码错误', async () => {
      const token = generateToken();
      const hashedPassword = await bcrypt.hash('CorrectOldPass1', 10);
      mockPool.query.mockResolvedValue([[{ password: hashedPassword }]]);

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'WrongOldPass1', new_password: 'NewSecurePass1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('旧密码错误');
    });

    it('应该返回400当缺少旧密码或新密码', async () => {
      const token = generateToken();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'test' });

      expect(res.status).toBe(400);
    });

    it('应该返回200当密码修改成功', async () => {
      const token = generateToken();
      const hashedPassword = await bcrypt.hash('CorrectOldPass1', 10);
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check (empty = not blacklisted)
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ password: hashedPassword }]])  // get user password
        .mockResolvedValueOnce([{ affectedRows: 1 }]);  // update password

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'CorrectOldPass1', new_password: 'NewSecurePass1' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/auth/force-change-password', () => {
    it('应该返回401当未认证', async () => {
      const res = await request(app)
        .post('/api/v1/auth/force-change-password')
        .send({ new_password: 'NewSecurePass1' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
    });

    it('应该返回400当账号无需强制改密', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: 'super_admin' }]]); // role query
      mockPool.getConnection.mockResolvedValueOnce({
        ...createMockConnection(),
        query: jest.fn().mockResolvedValueOnce([[{ must_change_password: 0 }]])
      });

      const res = await request(app)
        .post('/api/v1/auth/force-change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ new_password: 'NewSecurePass1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('当前账号无需强制修改密码');
    });

    it('应该返回400当新密码不符合强度要求', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: 'super_admin' }]]); // role query

      const res = await request(app)
        .post('/api/v1/auth/force-change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ new_password: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当强制改密成功并清除token cookie', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: 'super_admin' }]]); // role query
      mockPool.getConnection.mockResolvedValueOnce({
        ...createMockConnection(),
        query: jest.fn()
          .mockResolvedValueOnce([[{ must_change_password: 1 }]]) // get user
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // update password
      });

      const res = await request(app)
        .post('/api/v1/auth/force-change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ new_password: 'NewSecurePass1' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.message).toContain('密码修改成功');
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('token=;')])
      );
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('应该返回200成功登出', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer valid_token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('登出成功');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('应该返回200并签发新token当旧token有效', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'admin', role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // user query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert blacklist

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.message).toBe('Token 已刷新');
      // token 不再在响应体中返回，应通过 httpOnly Cookie 设置
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('token=')])
      );
    });

    it('应该返回200并签发新token当旧token已过期但签名有效', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', viewAll: true, manageAll: true },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'admin', role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // user query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert blacklist

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      // token 不再在响应体中返回，应通过 httpOnly Cookie 设置
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('token=')])
      );
    });

    it('应该返回401当旧token已在黑名单', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValueOnce([[{ blacklisted: 1 }]]); // blacklist check

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
    });

    it('应该返回401当token签名无效', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
      expect(res.body.message).toBe('无效的访问令牌');
    });

    it('应该返回401当未提供token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
      expect(res.body.message).toBe('未提供访问令牌');
    });

    it('应该返回401当用户已禁用', async () => {
      const token = generateToken();
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[]]); // user query (empty)

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
      expect(res.body.message).toBe('用户不存在或已禁用');
    });
  });
});

