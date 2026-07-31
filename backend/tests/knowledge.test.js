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
  getUserPermissions: jest.fn().mockResolvedValue(['knowledge']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn()
  };
});

const app = express();
app.use(express.json());

const knowledgeRoutes = require('../routes/knowledge');
app.use('/api/v1/knowledge', knowledgeRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('知识库模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/knowledge/products', () => {
    it('应该返回产品知识列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '产品A', category: '电子', model: 'A-001', create_by_name: '张三' },
          { id: 2, name: '产品B', category: '机械', model: 'B-001', create_by_name: '李四' }
        ]]);

      const res = await request(app)
        .get('/api/v1/knowledge/products')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/v1/knowledge/products', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/knowledge/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ category: '电子' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建产品', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/knowledge/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新产品', category: '电子', model: 'X-001', description: '产品描述' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/v1/knowledge/faqs', () => {
    it('应该返回FAQ列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, question: '如何报价？', answer: '进入报价模块...', category: '操作指南' }
        ]]);

      const res = await request(app)
        .get('/api/v1/knowledge/faqs')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('GET /api/v1/knowledge/products-meta/categories', () => {
    it('应该返回产品分类列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // categories
          { category: '电子' },
          { category: '机械' },
          { category: '化工' }
        ]]);

      const res = await request(app)
        .get('/api/v1/knowledge/products-meta/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data).toContain('电子');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/products');

      expect(res.status).toBe(401);
    });
  });
});

