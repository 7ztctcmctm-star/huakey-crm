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
  getUserPermissions: jest.fn().mockResolvedValue(["survey"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const surveyRoutes = require('../routes/survey');
app.use('/api/survey', surveyRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('问卷调查模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/survey/templates', () => {
    it('应该返回模板列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, name: 'NPS调查', survey_type: 'nps', is_system: 1 },
          { id: 2, name: '满意度调查', survey_type: 'csat', is_system: 0 }
        ]]);

      const res = await request(app)
        .get('/api/survey/templates')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/survey/templates', () => {
    it('应该返回200当正常创建模板', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 3 }]); // insert

      const res = await request(app)
        .post('/api/survey/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新调查模板', description: '测试模板', survey_type: 'csat', questions: [{ type: 'rating', question: '满意度' }] });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/survey/campaigns', () => {
    it('应该返回活动列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // campaigns list
          { id: 1, name: '6月满意度调查', status: 'active', template_name: 'NPS调查' },
          { id: 2, name: '客户回访', status: 'draft', template_name: '满意度调查' }
        ]]);

      const res = await request(app)
        .get('/api/survey/campaigns')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/survey/campaigns', () => {
    it('应该返回200当正常创建活动', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/survey/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '7月客户满意度调查', template_id: 1, target_type: 'all', send_method: 'email' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/survey/campaigns/:id/start', () => {
    it('应该返回200当启动活动', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ status: 'draft' }]]) // status check
        .mockResolvedValueOnce([[{ target_type: 'all', target_ids: null }]]) // campaign detail
        .mockResolvedValueOnce([[{ cnt: 50 }]]) // customer count
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update status

      const res = await request(app)
        .post('/api/survey/campaigns/1/start')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('total_sent');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/survey/templates');

      expect(res.status).toBe(401);
    });
  });
});
