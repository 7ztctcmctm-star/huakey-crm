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
  getUserPermissions: jest.fn().mockResolvedValue(['system:dept', 'system:dept:add', 'system:dept:edit', 'system:dept:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const deptRoutes = require('../routes/dept');
app.use('/api/dept', deptRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('部门管理模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/dept/add', () => {
    it('应该返回400当缺少name字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/dept/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_id: 0 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建部门', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const res = await request(app)
        .post('/api/dept/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新部门', parent_id: 0, sort: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });

    it('应该返回400当name为空字符串', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/dept/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/dept/update', () => {
    it('应该返回400当缺少id字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/dept/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '修改名称' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常更新部门', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/dept/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, name: '修改后的部门' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/dept/delete', () => {
    it('应该返回400当缺少id字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/dept/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回400当有子部门时拒绝删除', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ cnt: 3 }]]); // children check

      const res = await request(app)
        .post('/api/dept/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('子部门');
    });

    it('应该返回400当部门下有用户时拒绝删除', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ cnt: 0 }]])  // no children
        .mockResolvedValueOnce([[{ cnt: 5 }]]); // has users

      const res = await request(app)
        .post('/api/dept/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('用户');
    });

    it('应该返回200当正常删除部门', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ cnt: 0 }]])  // no children
        .mockResolvedValueOnce([[{ cnt: 0 }]])  // no users
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/dept/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});
