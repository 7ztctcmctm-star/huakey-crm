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
  getUserPermissions: jest.fn().mockResolvedValue(["followup_template"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const followupTemplateRoutes = require('../routes/followupTemplate');
app.use('/api/v1/followup-templates', followupTemplateRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('跟进模板模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/followup-templates/', () => {
    it('应该返回400当缺少content', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/followup-templates/')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '首次跟进模板' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建模板', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/followup-templates/')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '首次跟进模板', type: 'first', content: '您好，感谢您的关注，这是我们公司的介绍...' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/v1/followup-templates/', () => {
    it('应该返回模板列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '首次跟进', type: 'first', content: '模板内容1' },
          { id: 2, name: '报价跟进', type: 'quote', content: '模板内容2' }
        ]]);

      const res = await request(app)
        .get('/api/v1/followup-templates/')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('DELETE /api/v1/followup-templates/:id', () => {
    it('应该返回200当正常删除模板', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, create_by: 1 }]]) // existence + ownership check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/v1/followup-templates/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/followup-templates/');

      expect(res.status).toBe(401);
    });
  });
});

