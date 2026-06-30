const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn(), query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:pool']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const poolRoutes = require('../routes/customer/pool');
app.use('/api/v1/customer', poolRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('客户池模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/customer/pool', () => {
    it('应该返回公海客户列表（分页）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, company_name: '公海客户A' }, { id: 2, company_name: '公海客户B' }]]); // list

      const res = await request(app)
        .post('/api/v1/customer/pool')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/v1/customer/pool 无token', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/customer/pool')
        .send({ page: 1 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/customer/claim', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customer/claim')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常领取公海客户', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, pool_status: 1, pool_type: 'public', protect_until: null, owner_id: null }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockResolvedValueOnce([{ insertId: 1 }]); // pool_log insert

      const res = await request(app)
        .post('/api/v1/customer/claim')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('protect_until');
    });
  });

  describe('POST /api/v1/customer/release', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customer/release')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常释放客户到公海', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 1, company_name: '测试公司' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockResolvedValueOnce([{ insertId: 1 }]) // pool_log insert
        .mockResolvedValueOnce(undefined); // logAction

      const res = await request(app)
        .post('/api/v1/customer/release')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});

