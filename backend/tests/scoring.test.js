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
  getUserPermissions: jest.fn().mockResolvedValue(["scoring"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const scoringRoutes = require('../routes/scoring');
app.use('/api/scoring', scoringRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('评分规则模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/scoring/rules', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/scoring/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ condition_type: 'source', score: 10 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建评分规则', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/scoring/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '官网来源加分', condition_type: 'source', condition_field: 'source', condition_operator: 'eq', condition_value: '官网', score: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/scoring/rules', () => {
    it('应该返回规则列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // rules list
          { id: 1, name: '官网来源加分', condition_type: 'source', score: 10 },
          { id: 2, name: '多次跟进加分', condition_type: 'action', score: 5 }
        ]]);

      const res = await request(app)
        .get('/api/scoring/rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('PUT /api/scoring/rules/:id', () => {
    it('应该返回200当正常更新规则', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]) // existing check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .put('/api/scoring/rules/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '官网来源加分(调整)', score: 15 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('DELETE /api/scoring/rules/:id', () => {
    it('应该返回200当正常删除规则', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/scoring/rules/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/scoring/rules');

      expect(res.status).toBe(401);
    });
  });
});
