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

const automationRoutes = require('../routes/automation');
app.use('/api/automation', automationRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('自动化规则模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/automation/assign-rules', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/automation/assign-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ assign_type: 'round_robin' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建分配规则', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/automation/assign-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ rule_name: '按来源分配-官网', assign_type: 'by_source', source_value: '官网', user_ids: [1, 2, 3], priority: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/automation/assign-rules', () => {
    it('应该返回分配规则列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // rules list
          { id: 1, rule_name: '按来源分配-官网', assign_type: 'by_source', priority: 10 },
          { id: 2, rule_name: '轮询分配', assign_type: 'round_robin', priority: 5 }
        ]]);

      const res = await request(app)
        .get('/api/automation/assign-rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/automation/workflows', () => {
    it('应该返回200当正常创建工作流', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/automation/workflows')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新客户自动分配', trigger_event: 'customer_created', conditions: [{ field: 'source', operator: 'equals', value: '官网' }], actions: [{ type: 'assign', params: { user_id: 2 } }] });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/automation/workflows', () => {
    it('应该返回工作流列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // workflows list
          { id: 1, name: '新客户自动分配', trigger_event: 'customer_created', status: 1, today_runs: 3 },
          { id: 2, name: '商机停滞提醒', trigger_event: 'opportunity_stale', status: 1, today_runs: 0 }
        ]]);

      const res = await request(app)
        .get('/api/automation/workflows')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/automation/workflows');

      expect(res.status).toBe(401);
    });
  });
});
