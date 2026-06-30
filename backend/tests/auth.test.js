const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
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
  getUserPermissions: jest.fn().mockResolvedValue(['customer:view', 'product:view']),
  getMenuPermissions: jest.fn().mockResolvedValue([{ code: 'dashboard', name: '首页' }]),
  getDataPermissions: jest.fn().mockResolvedValue([{ module: 'customer', data_scope: 'all' }])
}));

const app = express();
app.use(express.json());

const authRoutes = require('../routes/auth');
app.use('/api/auth', authRoutes);

const generateToken = (user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('认证模块', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/auth/login', () => {
    it('应该返回400当缺少必填字段', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当验证码过期', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'Pass123', captcha: 'abcd', captchaKey: 'expired_key' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('验证码');
    });
  });

  describe('GET /api/auth/me', () => {
    it('应该返回200和用户信息当token有效', async () => {
      const token = generateToken();
      mockPool.query.mockResolvedValue([[
        { id: 1, username: 'admin', real_name: '管理员', phone: '13800138000', email: 'admin@test.com', dept_id: 1, role_id: 1, status: 1, view_all: 1, manage_all: 1 }
      ]]);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('username', 'admin');
      expect(res.body.data).toHaveProperty('realName', '管理员');
    });

    it('应该返回401当无token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('应该返回400当旧密码错误', async () => {
      const token = generateToken();
      const hashedPassword = await bcrypt.hash('CorrectOldPass1', 10);
      mockPool.query.mockResolvedValue([[{ password: hashedPassword }]]);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'WrongOldPass1', new_password: 'NewSecurePass1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('旧密码错误');
    });

    it('应该返回400当缺少旧密码或新密码', async () => {
      const token = generateToken();

      const res = await request(app)
        .post('/api/auth/change-password')
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
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'CorrectOldPass1', new_password: 'NewSecurePass1' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('应该返回200成功登出', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid_token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('登出成功');
    });
  });
});
