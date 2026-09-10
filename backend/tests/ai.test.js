const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

const mockReadOnlyPool = {
  query: jest.fn()
};

jest.mock('../config/database', () => ({
  query: mockPool.query.bind(mockPool),
  getConnection: mockPool.getConnection.bind(mockPool),
  readOnlyPool: mockReadOnlyPool,
  isReadOnlyPoolAvailable: true
}));

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
app.use('/api/v1/ai', aiRoutes);

const { chatCompletion } = require('../utils/llmClient');

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('AI模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    chatCompletion.mockReset();
  });

  describe('POST /api/v1/ai/query', () => {
    it('应该返回400当缺少question', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/ai/query')
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
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '客户总数是多少' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('answer');
      expect(res.body.data).toHaveProperty('sql');
    });

    // 【P1-2】AI 查询必须受数据范围约束
    // 背景：迁移 086 把 `ai` 权限授予了 sales 等非全局角色，
    // 而本路由原先对 AI 生成的 SQL 直接执行、无行级过滤。
    const salesToken = () =>
      jwt.sign(
        { userId: 2, username: 'sales1', roleId: 2, roleCode: 'sales', manageAll: false },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

    it('P1-2：非全局数据范围账号查询客户表应被拒绝', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]); // role query

      chatCompletion.mockResolvedValueOnce('SELECT id, company_name FROM crm_customer');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${salesToken()}`)
        .send({ question: '列出所有客户及其负责人' });

      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(0);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.answer).toContain('数据范围不支持');
    });

    it('P1-2：非全局数据范围账号查询非敏感表应正常执行', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]); // role query

      chatCompletion
        .mockResolvedValueOnce('SELECT COUNT(*) FROM crm_product') // SQL 生成
        .mockResolvedValueOnce('共 50 个产品'); // 结果格式化

      // 注意：AI 生成的 SQL 由只读连接池执行（非主库池）
      mockReadOnlyPool.query.mockResolvedValueOnce([[{ 'COUNT(*)': 50 }]]);

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${salesToken()}`)
        .send({ question: '有多少产品' });

      expect(res.status).toBe(200);
      expect(res.body.data.answer).toBe('共 50 个产品');
    });
  });

  describe('GET /api/v1/ai/suggestions', () => {
    it('应该返回建议列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, type: 'follow_up', ref_id: 1, suggestion: '建议跟进客户', confidence: 0.85 }
        ]])
        .mockResolvedValueOnce([[{ company_name: '测试公司' }]]); // customer ref lookup

      const res = await request(app)
        .get('/api/v1/ai/suggestions')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('GET /api/v1/ai/status', () => {
    it('应该返回AI状态', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/v1/ai/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('online');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/ai/status');

      expect(res.status).toBe(401);
    });
  });
});

