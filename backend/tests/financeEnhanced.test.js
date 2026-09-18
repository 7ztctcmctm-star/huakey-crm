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
  getUserPermissions: jest.fn().mockResolvedValue(['finance']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const financeRoutes = require('../routes/finance-enhanced');
app.use('/api/v1/finance', financeRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('财务增强模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/finance/reconciliation/customer', () => {
    it('应该返回客户对账数据', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', contact_name: '张三', phone: '13800138000' }]]) // customer
        .mockResolvedValueOnce([[ // contracts
          { id: 1, contract_no: 'C-001', amount: 100000, sign_date: '2026-01-15', status: 2 }
        ]])
        .mockResolvedValueOnce([[ // payments
          { id: 1, pay_amount: 50000, pay_date: '2026-02-01', pay_method: '银行转账', contract_no: 'C-001' }
        ]]);

      const res = await request(app)
        .get('/api/v1/finance/reconciliation/customer')
        .set('Authorization', `Bearer ${token}`)
        .query({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.customer.company_name).toBe('测试公司');
      expect(res.body.data.contracts).toHaveLength(1);
      expect(res.body.data.payments).toHaveLength(1);
      expect(res.body.data.summary.total_amount).toBe(100000);
      expect(res.body.data.summary.paid_amount).toBe(50000);
    });
  });

  describe('GET /api/v1/finance/reconciliation/supplier', () => {
    it('应返回真实已付金额（回归 #17：原实现 payments=[] 且 paid_amount 恒为 0）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 7, name: '测试供应商', contact_person: '李四', phone: '13900139000' }]]) // supplier
        .mockResolvedValueOnce([[ // purchase orders
          { id: 101, order_no: 'PO-260918-001', total_amount: '100000.00', create_time: '2026-09-01', status: '已完成' },
          { id: 102, order_no: 'PO-260918-002', total_amount: '50000.00', create_time: '2026-09-02', status: '已完成' }
        ]])
        .mockResolvedValueOnce([[ // purchase payments (真实付款)
          { id: 1, order_id: 101, order_no: 'PO-260918-001', amount: '60000.00', pay_method: '银行转账', pay_date: '2026-09-10', payer_name: '王五' },
          { id: 2, order_id: 102, order_no: 'PO-260918-002', amount: '50000.00', pay_method: '电汇', pay_date: '2026-09-12', payer_name: '王五' }
        ]]);

      const res = await request(app)
        .get('/api/v1/finance/reconciliation/supplier')
        .set('Authorization', `Bearer ${token}`)
        .query({ supplier_id: 7 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.supplier.name).toBe('测试供应商');
      expect(res.body.data.orders).toHaveLength(2);
      // 关键回归：payments 不再写死为空
      expect(res.body.data.payments).toHaveLength(2);
      expect(res.body.data.summary.total_amount).toBe(150000);
      expect(res.body.data.summary.paid_amount).toBe(110000); // 不再恒为 0
      expect(res.body.data.summary.unpaid_amount).toBe(40000);
    });

    it('供应商无采购单时应返回 0（payments 为空、不发起付款查询）', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 8, name: '空供应商', contact_person: null, phone: null }]]) // supplier
        .mockResolvedValueOnce([[]]); // 无采购单 → 不再查询 crm_purchase_payment

      const res = await request(app)
        .get('/api/v1/finance/reconciliation/supplier')
        .set('Authorization', `Bearer ${token}`)
        .query({ supplier_id: 8 });

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(0);
      expect(res.body.data.payments).toHaveLength(0);
      expect(res.body.data.summary.paid_amount).toBe(0);
      expect(res.body.data.summary.unpaid_amount).toBe(0);
    });
  });

  describe('GET /api/v1/finance/reconciliation/list', () => {
    it('应该返回对账单列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, recon_no: 'RC-20260623-001', recon_type: 'customer', target_name: '测试公司', total_amount: 100000 }
        ]]);

      const res = await request(app)
        .get('/api/v1/finance/reconciliation/list')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('GET /api/v1/finance/analysis', () => {
    it('应该返回财务分析数据', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 500000 }]]) // income
        .mockResolvedValueOnce([[{ total: 300000 }]]) // cost
        .mockResolvedValueOnce([[ // cost structure
          { name: '生产', value: 200000 },
          { name: '贸易', value: 100000 }
        ]])
        .mockResolvedValueOnce([[ // receivables
          { id: 1, amount: 100000, paid: 50000, age_days: 45 }
        ]])
        .mockResolvedValueOnce([[ // cash in
          { month: '2026-06', amount: 200000 }
        ]])
        .mockResolvedValueOnce([[ // cash out
          { month: '2026-06', amount: 150000 }
        ]])
        .mockResolvedValueOnce([[{ avg_days: 30 }]]) // payment cycle
        .mockResolvedValueOnce([[ // collection trend
          { month: '2026-06', contract_amount: 300000, paid_amount: 200000 }
        ]]);

      const res = await request(app)
        .get('/api/v1/finance/analysis')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('profit');
      expect(res.body.data).toHaveProperty('aging');
      expect(res.body.data).toHaveProperty('cashFlow');
    });
  });

  describe('GET /api/v1/finance/reminders/summary', () => {
    it('应该返回回款提醒汇总', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ today_pending: 3 }]]) // today pending
        .mockResolvedValueOnce([[{ upcoming: 5 }]]) // upcoming
        .mockResolvedValueOnce([[{ overdue: 2 }]]) // overdue
        .mockResolvedValueOnce([[{ overdue_amount: 80000 }]]); // overdue amount

      const res = await request(app)
        .get('/api/v1/finance/reminders/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.today_pending).toBe(3);
      expect(res.body.data.overdue).toBe(2);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/finance/analysis');

      expect(res.status).toBe(401);
    });
  });
});

