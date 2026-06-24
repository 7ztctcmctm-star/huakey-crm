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

jest.mock('../utils/llmClient', () => ({
  chatCompletion: jest.fn().mockResolvedValue('AI回复内容'),
  getProviderStatus: jest.fn().mockResolvedValue({ online: true, provider: 'openai', model: 'gpt-4', models: ['gpt-4', 'gpt-3.5-turbo'] })
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(["ai"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const aiRoutes = require('../routes/ai');
app.use('/api/ai', aiRoutes);

const { chatCompletion } = require('../utils/llmClient');

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('AI模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    chatCompletion.mockReset();
  });

  describe('POST /api/ai/query', () => {
    it('应该返回400当缺少question', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常查询', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      chatCompletion
        .mockResolvedValueOnce('SELECT COUNT(*) FROM crm_customer WHERE status != 0') // SQL generation
        .mockResolvedValueOnce('共有100个活跃客户'); // result formatting

      mockPool.query
        .mockResolvedValueOnce([[{ 'COUNT(*)': 100 }]]); // SQL execution

      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '客户总数是多少' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('answer');
      expect(res.body.data).toHaveProperty('sql');
    });
  });

  describe('GET /api/ai/suggestions', () => {
    it('应该返回建议列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, type: 'follow_up', ref_id: 1, suggestion: '建议跟进客户', confidence: 0.85 }
        ]])
        .mockResolvedValueOnce([[{ company_name: '测试公司' }]]); // customer ref lookup

      const res = await request(app)
        .get('/api/ai/suggestions')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('GET /api/ai/status', () => {
    it('应该返回AI状态', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/ai/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('online');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/ai/status');

      expect(res.status).toBe(401);
    });
  });
});
