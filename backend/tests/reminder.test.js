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
  getUserPermissions: jest.fn().mockResolvedValue(["reminder"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(30),
  clearConfigCache: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/v1/reminder', require('../routes/reminder'));

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true, viewAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('提醒系统模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/reminder/my-reminders', () => {
    it('应该返回200和提醒列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[]]) // all reminders
        .mockResolvedValueOnce([[]]) // pre-warning
        .mockResolvedValueOnce([[]]) // notifications
        .mockResolvedValueOnce([[]]) // 待我处理的客户转移申请
        .mockResolvedValueOnce([[]]); // overdue services

      const res = await request(app)
        .get('/api/v1/reminder/my-reminders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('unread_count');
      expect(res.body.data).toHaveProperty('pending_approvals');
      // 客户转移待办（通知中心「客户转移」页签的数据来源）
      expect(res.body.data).toHaveProperty('transfer_pending');
      expect(res.body.data.transfer_pending).toEqual([]);
      expect(res.body.data.transfer_pending_count).toBe(0);
    });

    it('应返回待处理的客户转移申请', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[]]) // all reminders
        .mockResolvedValueOnce([[]]) // pre-warning
        .mockResolvedValueOnce([[]]) // notifications
        .mockResolvedValueOnce([[{
          id: 88, customer_id: 7, company_name: '深圳华科', from_user_name: '张三',
          reason: '区域调整', expire_at: '2026-09-13 10:00:00', create_time: '2026-09-10 10:00:00'
        }]]) // 转移申请
        .mockResolvedValueOnce([[]]); // overdue services

      const res = await request(app)
        .get('/api/v1/reminder/my-reminders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transfer_pending_count).toBe(1);
      expect(res.body.data.transfer_pending[0]).toMatchObject({
        id: 88, customer_id: 7, company_name: '深圳华科', from_user_name: '张三'
      });

      // 断言 SQL 中带了「仅未过期」条件 —— 过期申请由 acceptTransfer 拒收，
      // 若列表仍展示就会变成点了没反应的死按钮
      const sql = mockPool.query.mock.calls.map(c => c[0]).join('\n');
      expect(sql).toContain('crm_customer_transfer');
      expect(sql).toContain('expire_at > NOW()');
      expect(sql).toContain("status = 'pending'");
    });
  });

  describe('GET /api/v1/reminder/center', () => {
    it('待办中应包含客户转移分组', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[]]) // approvals
        .mockResolvedValueOnce([[]]) // followups
        .mockResolvedValueOnce([[]]) // stock alerts
        .mockResolvedValueOnce([[]]) // payment overdue
        .mockResolvedValueOnce([[{
          id: 5, customer_id: 3, create_time: '2026-09-10 10:00:00',
          title: '客户转移-深圳华科（来自张三）', link: '/customer/detail/3'
        }]]) // 转移待办
        .mockResolvedValueOnce([[]]) // system notifications
        .mockResolvedValueOnce([[{ unread: 0 }]]); // unread count

      const res = await request(app)
        .get('/api/v1/reminder/center')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.todo).toHaveProperty('transfers');
      expect(res.body.data.todo.transfers).toHaveLength(1);
      expect(res.body.data.todo.transfers[0]).toMatchObject({
        id: 5,
        link: '/customer/detail/3'
      });
      // 待办条数应计入角标
      expect(res.body.data.unread_count).toBe(1);
    });
  });

  describe('POST /api/v1/reminder/overdue-list', () => {
    it('应该返回200和逾期列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 5 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', overdue_days: 10 }]]); // list

      const res = await request(app)
        .post('/api/v1/reminder/overdue-list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('POST /api/v1/reminder/mark-read', () => {
    it('应该返回400当缺少reminder_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/reminder/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常标记已读', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/reminder/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({ reminder_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/reminder/mark-all-read', () => {
    it('应该返回200当全部标记已读', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ affectedRows: 3 }]) // reminders
        .mockResolvedValueOnce([{ affectedRows: 5 }]); // notifications

      const res = await request(app)
        .post('/api/v1/reminder/mark-all-read')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/reminder/dismiss', () => {
    it('应该返回200当正常忽略提醒', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/reminder/dismiss')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/v1/reminder/payment-overdue', () => {
    it('应该返回200和回款逾期列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, plan_date: '2025-01-01', plan_amount: 10000, paid_amount: 5000 }]]) // overdue
        .mockResolvedValueOnce([[{ id: 2, plan_date: '2025-06-25', plan_amount: 8000, paid_amount: 0 }]]); // upcoming

      const res = await request(app)
        .get('/api/v1/reminder/payment-overdue')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('upcoming');
    });
  });

  describe('GET /api/v1/reminder/notification-list', () => {
    it('应该返回200和通知列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 10 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, title: '测试通知', is_read: 0 }]]); // list

      const res = await request(app)
        .get('/api/v1/reminder/notification-list')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });
});

