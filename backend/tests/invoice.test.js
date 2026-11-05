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

const mockGetUserPermissions = jest.fn();
const mockGetDataPermissions = jest.fn();
jest.mock('../services/permissionService', () => ({
  getUserPermissions: (...args) => mockGetUserPermissions(...args),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: (...args) => mockGetDataPermissions(...args)
}));

const { installAuthAwareQuery } = require('./helpers/authMock');
const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const invoiceRoutes = require('../routes/invoice');
app.use('/api/v1/invoice', invoiceRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const adminToken = jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const salesToken = jwt.sign(
  { userId: 7, username: 'sales01', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const salesAuthRow = {
  id: 7, username: 'sales01', role_id: 3, status: 1,
  role_code: 'sales', view_all: 0, manage_all: 0, fresh_role_id: 3
};

describe('发票管理模块', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
    mockGetUserPermissions.mockResolvedValue(['invoice', 'invoice:view', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export']);
    // 无 invoice 域配置 → checkDataPermission fail-closed 为 self
    mockGetDataPermissions.mockResolvedValue([]);
  });

  describe('POST /api/v1/invoice/add', () => {
    it('应该返回400当缺少必填字段', async () => {
      installAuthAwareQuery(mockPool);

      const res = await request(app)
        .post('/api/v1/invoice/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ invoice_no: 'INV-2026-001' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建发票（合同与客户一致）', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        if (String(sql).includes('FROM crm_contract c')) return [[{ id: 1, customer_id: 1 }]];
        return [[]];
      });

      mockConnection.query
        .mockResolvedValueOnce([{ insertId: 1 }]) // [P2-06] 序列取号
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/invoice/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contract_id: 1, customer_id: 1, type: 1, amount: 10000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('invoice_no');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('[P0-09] 客户与合同不一致 → 400，不落库', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        if (String(sql).includes('FROM crm_contract c')) return [[{ id: 1, customer_id: 2 }]];
        return [[]];
      });

      const res = await request(app)
        .post('/api/v1/invoice/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contract_id: 1, customer_id: 1, type: 1, amount: 10000 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/客户与合同客户不一致/);
      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('[P0-09] 销售为他人的合同开票 → 404/400 拒绝（合同查询带 create_by 范围）', async () => {
      installAuthAwareQuery(mockPool, async (sql, params) => {
        const s = String(sql);
        if (s.includes('FROM crm_contract c')) {
          expect(s).toContain('c.create_by = ?');
          expect(params).toEqual([1, 7]);
          return [[]]; // 范围外 → 查不到
        }
        return [[]];
      }, salesAuthRow);

      const res = await request(app)
        .post('/api/v1/invoice/add')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ contract_id: 1, customer_id: 1, type: 1, amount: 10000 });

      expect([400, 404]).toContain(res.status);
      expect(mockConnection.query).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/invoice/list', () => {
    it('应该返回发票列表', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        const s = String(sql);
        if (s.includes('COUNT(*)')) return [[{ total: 2 }]];
        if (s.includes('FROM crm_invoice i')) return [[
          { id: 1, invoice_no: 'INV-260623-001', amount: 10000 },
          { id: 2, invoice_no: 'INV-260623-002', amount: 20000 }
        ]];
        return [[]];
      });

      const res = await request(app)
        .post('/api/v1/invoice/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/v1/invoice/update', () => {
    it('应该返回200当正常更新发票', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        const s = String(sql);
        if (s.includes('FROM crm_invoice i')) {
          return [[{ id: 1, invoice_no: 'INV-260623-001', amount: 10000, create_by: 1 }]];
        }
        if (s.includes('FROM crm_contract c')) return [[{ id: 1, customer_id: 1 }]];
        if (s.includes('UPDATE crm_invoice SET')) return [{ affectedRows: 1 }];
        return [[]];
      });

      const res = await request(app)
        .post('/api/v1/invoice/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: 1, contract_id: 1, customer_id: 1, type: 1, amount: 15000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('[P0-09] 销售改他人发票 → 「发票不存在」，UPDATE 不执行', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        const s = String(sql);
        if (s.includes('FROM crm_invoice i')) {
          expect(s).toContain('i.create_by = ?');
          return [[]]; // 范围外
        }
        return [[]];
      }, salesAuthRow);

      const res = await request(app)
        .post('/api/v1/invoice/update')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ id: 99, contract_id: 1, customer_id: 1, type: 1, amount: 1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/发票不存在/);
      expect(mockPool.query.mock.calls.some(
        (c) => String(c[0]).includes('UPDATE crm_invoice SET')
      )).toBe(false);
    });
  });

  describe('POST /api/v1/invoice/delete', () => {
    it('应该返回200当正常删除发票', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        const s = String(sql);
        if (s.includes('FROM crm_invoice i')) return [[{ id: 1 }]];
        if (s.includes('UPDATE crm_invoice SET deleted_at')) return [{ affectedRows: 1 }];
        return [[]];
      });

      const res = await request(app)
        .post('/api/v1/invoice/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('[P0-09] 销售删他人发票 → 拒绝且不软删', async () => {
      installAuthAwareQuery(mockPool, async (sql) => {
        const s = String(sql);
        if (s.includes('FROM crm_invoice i')) {
          expect(s).toContain('i.create_by = ?');
          return [[]];
        }
        return [[]];
      }, salesAuthRow);

      const res = await request(app)
        .post('/api/v1/invoice/delete')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ id: 99 });

      expect(res.status).toBe(400);
      expect(mockPool.query.mock.calls.some(
        (c) => String(c[0]).includes('UPDATE crm_invoice SET deleted_at')
      )).toBe(false);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/invoice/list')
        .send({ page: 1 });

      expect(res.status).toBe(401);
    });
  });
});
