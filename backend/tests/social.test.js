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
  getUserPermissions: jest.fn().mockResolvedValue(["social"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const socialRoutes = require('../routes/social');
app.use('/api/v1/social', socialRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('社交记录模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/social/records', () => {
    it('应该返回400当缺少platform', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/social/records')
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'outbound', content: '测试消息' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建沟通记录', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/social/records')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, platform: 'wechat', direction: 'outbound', content: '你好，请问报价单收到了吗？' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/v1/social/records', () => {
    it('应该返回沟通记录列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, platform: 'wechat', content: '消息1' },
          { id: 2, platform: 'dingtalk', content: '消息2' }
        ]]);

      const res = await request(app)
        .get('/api/v1/social/records')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('DELETE /api/v1/social/records/:id', () => {
    it('应该返回200当正常删除记录', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ create_by: 1 }]]) // ownership check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/v1/social/records/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/social/records');

      expect(res.status).toBe(401);
    });
  });
});

