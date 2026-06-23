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
  getUserPermissions: jest.fn().mockResolvedValue(['purchase:add']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const procurementPlanRoutes = require('../routes/procurement-plan');
app.use('/api/procurement-plan', procurementPlanRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('采购计划模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/procurement-plan/create', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/procurement-plan/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ product_id: 1, quantity: 10, unit_price: 100 }] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建采购计划', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ cnt: 0 }]]); // generatePlanNo count

      mockConnection.query
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert plan
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert item

      const res = await request(app)
        .post('/api/procurement-plan/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '7月采购计划', remark: '补货计划', items: [{ product_id: 1, quantity: 100, unit_price: 5.5 }] });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('plan_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('GET /api/procurement-plan/list', () => {
    it('应该返回计划列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, plan_no: 'PP-20260701-001', name: '7月采购计划', status: 'draft' },
          { id: 2, plan_no: 'PP-20260701-002', name: '紧急补货', status: 'submitted' }
        ]]);

      const res = await request(app)
        .get('/api/procurement-plan/list')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/procurement-plan/:id/submit', () => {
    it('应该返回200当正常提交审批', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ status: 'draft' }]]) // plan check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update status

      const res = await request(app)
        .post('/api/procurement-plan/1/submit')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('DELETE /api/procurement-plan/:id', () => {
    it('应该返回200当正常删除计划', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ status: 'draft' }]]) // plan check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/procurement-plan/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/procurement-plan/list');

      expect(res.status).toBe(401);
    });
  });
});
