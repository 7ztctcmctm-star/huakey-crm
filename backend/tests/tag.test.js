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
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const tagRoutes = require('../routes/tag');
app.use('/api/tag', tagRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('标签管理模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/tag/manage (add)', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/tag/manage')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'add' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建标签', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ insertId: 5 }]); // insert tag

      const res = await request(app)
        .post('/api/tag/manage')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'add', name: 'VIP客户', color: '#ff6600' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/tag/list', () => {
    it('应该返回标签列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // tag list
          { id: 1, name: 'VIP', color: '#ff0000', sort: 1 },
          { id: 2, name: '重点', color: '#00ff00', sort: 2 }
        ]]);

      const res = await request(app)
        .get('/api/tag/list')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/tag/manage (delete)', () => {
    it('应该返回200当正常删除标签', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // delete customer_tag relations
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete tag

      const res = await request(app)
        .post('/api/tag/manage')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'delete', id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/tag/list');

      expect(res.status).toBe(401);
    });
  });
});
