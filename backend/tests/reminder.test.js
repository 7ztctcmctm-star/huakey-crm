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
app.use('/api/reminder', require('../routes/reminder'));

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true, viewAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('提醒系统模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/reminder/my-reminders', () => {
    it('应该返回200和提醒列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[]]) // all reminders
        .mockResolvedValueOnce([[]]) // pre-warning
        .mockResolvedValueOnce([[]]) // notifications
        .mockResolvedValueOnce([[]]); // overdue services

      const res = await request(app)
        .get('/api/reminder/my-reminders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('unread_count');
      expect(res.body.data).toHaveProperty('pending_approvals');
    });
  });

  describe('POST /api/reminder/overdue-list', () => {
    it('应该返回200和逾期列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 5 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', overdue_days: 10 }]]); // list

      const res = await request(app)
        .post('/api/reminder/overdue-list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('POST /api/reminder/mark-read', () => {
    it('应该返回400当缺少reminder_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/reminder/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常标记已读', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/reminder/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({ reminder_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/reminder/mark-all-read', () => {
    it('应该返回200当全部标记已读', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 3 }]) // reminders
        .mockResolvedValueOnce([{ affectedRows: 5 }]); // notifications

      const res = await request(app)
        .post('/api/reminder/mark-all-read')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/reminder/dismiss', () => {
    it('应该返回200当正常忽略提醒', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/reminder/dismiss')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/reminder/payment-overdue', () => {
    it('应该返回200和回款逾期列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, plan_date: '2025-01-01', plan_amount: 10000, paid_amount: 5000 }]]) // overdue
        .mockResolvedValueOnce([[{ id: 2, plan_date: '2025-06-25', plan_amount: 8000, paid_amount: 0 }]]); // upcoming

      const res = await request(app)
        .get('/api/reminder/payment-overdue')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('upcoming');
    });
  });

  describe('GET /api/reminder/notification-list', () => {
    it('应该返回200和通知列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 10 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, title: '测试通知', is_read: 0 }]]); // list

      const res = await request(app)
        .get('/api/reminder/notification-list')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });
});
