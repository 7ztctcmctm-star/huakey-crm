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

jest.mock('../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const invoiceRoutes = require('../routes/invoice');
app.use('/api/invoice', invoiceRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('发票管理模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/invoice/add', () => {
    it('应该返回400当缺少必填字段', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/invoice/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ invoice_no: 'INV-2026-001' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建发票', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      mockConnection.query
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // count for invoice_no generation
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/invoice/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ contract_id: 1, customer_id: 1, type: 1, amount: 10000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('invoice_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/invoice/list', () => {
    it('应该返回发票列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, invoice_no: 'INV-260623-001', amount: 10000 },
          { id: 2, invoice_no: 'INV-260623-002', amount: 20000 }
        ]]);

      const res = await request(app)
        .post('/api/invoice/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/invoice/update', () => {
    it('应该返回200当正常更新发票', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, invoice_no: 'INV-260623-001', amount: 10000 }]]) // old data
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .post('/api/invoice/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, contract_id: 1, customer_id: 1, type: 1, amount: 15000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/invoice/delete', () => {
    it('应该返回200当正常删除发票', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]) // existence check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .post('/api/invoice/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/invoice/list')
        .send({ page: 1 });

      expect(res.status).toBe(401);
    });
  });
});
