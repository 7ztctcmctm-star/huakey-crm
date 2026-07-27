const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    release: jest.fn(),
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['purchase', 'purchase:request']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

app.use('/api/v1/purchase/request', require('../routes/purchase/request'));
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = (userId = 1, roleCode = 'super_admin', manageAll = true) => {
  return jwt.sign({ userId, username: 'admin', roleId: 1, roleCode, manageAll }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('采购申请模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/purchase/request/create', () => {
    it('应该返回400当缺少title', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role

      const res = await request(app)
        .post('/api/v1/purchase/request/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ dept_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回201当正常创建', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/purchase/request/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '6月办公用品采购', dept_id: 1, expected_amount: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/v1/purchase/request/list', () => {
    it('应该返回采购申请列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, title: '6月办公用品采购', status: 'draft', applicant_name: '管理员' }]]); // list

      const res = await request(app)
        .post('/api/v1/purchase/request/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('POST /api/v1/purchase/request/submit/:id', () => {
    it('应该返回400当非草稿状态提交', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ id: 1, applicant_id: 1, status: 'pending' }]]); // request

      const res = await request(app)
        .post('/api/v1/purchase/request/submit/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('草稿');
    });
  });

  describe('POST /api/v1/purchase/request/approve/:id', () => {
    it('应该返回403当非管理员审批', async () => {
      const salesToken = generateToken(2, 'sales', false);
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]); // role

      const res = await request(app)
        .post('/api/v1/purchase/request/approve/1')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('无权');
    });
  });

  describe('POST /api/v1/purchase/request/reject/:id', () => {
    it('应该返回200当正常驳回', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ status: 'pending' }]]) // request
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/v1/purchase/request/reject/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '预算不足' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/purchase/request/cancel/:id', () => {
    it('应该返回200当正常撤销', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ applicant_id: 1, status: 'draft' }]]) // request
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/v1/purchase/request/cancel/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '暂时不需要' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});
