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
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:assign']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const assignRoutes = require('../routes/customer/assign');
app.use('/api/v1/customer', assignRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('客户分配模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/v1/customer/assign', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customer/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ to_user_id: 2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当缺少to_user_id时执行回收', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update owner
        .mockResolvedValueOnce([{ insertId: 1 }]); // assign_log insert

      const res = await request(app)
        .post('/api/v1/customer/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该返回200当正常分配客户', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update owner
        .mockResolvedValueOnce([{ insertId: 1 }]); // assign_log insert

      const res = await request(app)
        .post('/api/v1/customer/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/customer/batch-assign', () => {
    it('应该返回400当缺少customer_ids', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customer/batch-assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ to_user_id: 2 });

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常批量分配', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      // connection.query: 2 customers × (select + update + insert) = 6 calls
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, company_name: '客户A', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[{ id: 2, company_name: '客户B', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 2 }]);

      const res = await request(app)
        .post('/api/v1/customer/batch-assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_ids: [1, 2], to_user_id: 5 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/customer/assign-log', () => {
    it('应该返回分配历史', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, customer_id: 1, from_user_id: 3, to_user_id: 2 }]]); // list

      const res = await request(app)
        .post('/api/v1/customer/assign-log')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/customer/assign')
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(401);
    });
  });
});

