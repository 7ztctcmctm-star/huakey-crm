const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockConnection = {
  release: jest.fn(),
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined)
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection)
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['approval']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const approvalRoutes = require('../routes/approval');
app.use('/api/v1/approval', approvalRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('审批流程模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('GET /api/v1/approval/my-pending', () => {
    it('应该返回待审批列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]]); // pending list (empty)

      const res = await request(app)
        .get('/api/v1/approval/my-pending')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/approval/my-submitted', () => {
    it('应该返回已提交列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // quotes
          { business_type: 'quote', business_id: 1, business_title: 'Q-001', approval_status: 1, create_time: '2026-06-23' }
        ]])
        .mockResolvedValueOnce([[]]) // contracts
        .mockResolvedValueOnce([[]]); // purchases

      const res = await request(app)
        .get('/api/v1/approval/my-submitted')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/v1/approval/submit', () => {
    it('应该返回200当正常提交审批', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, approval_status: 0 }]]) // business record check
        .mockResolvedValueOnce([[{ id: 1 }]]) // workflow lookup
        .mockResolvedValueOnce([[{ id: 1, step_order: 1, approver_type: 'manager', approver_id: null }]]) // first step
        .mockResolvedValueOnce([[{ manager_id: 2 }]]); // user's manager

      mockConnection.query
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert approval record
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update business status

      const res = await request(app)
        .post('/api/v1/approval/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ business_type: 'quote', business_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/approval/approve/:id', () => {
    it('应该返回200当正常通过审批', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, workflow_id: 1, business_type: 'quote', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update record status
        .mockResolvedValueOnce([[]]) // no next step (final step)
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update business status

      const res = await request(app)
        .post('/api/v1/approval/approve/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ remark: '同意' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.is_final).toBe(true);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('应该返回404当审批记录已被处理（TOCTOU并发竞态）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[]]); // SELECT FOR UPDATE 返回空（已被其他请求处理）

      const res = await request(app)
        .post('/api/v1/approval/approve/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ remark: '同意' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/approval/reject/:id', () => {
    it('应该返回200当正常驳回审批', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, workflow_id: 1, business_type: 'quote', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update record status
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update business status

      const res = await request(app)
        .post('/api/v1/approval/reject/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ remark: '价格不合理' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/approval/my-pending');

      expect(res.status).toBe(401);
    });
  });
});

