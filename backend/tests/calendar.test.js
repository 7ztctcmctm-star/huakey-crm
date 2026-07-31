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
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(["calendar"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const calendarRoutes = require('../routes/calendar');
app.use('/api/v1/calendar', calendarRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('日历模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/calendar/events', () => {
    it('应该返回400当缺少title', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ start_time: '2026-06-23 10:00:00' });

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常创建日程事件', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '客户拜访', start_time: '2026-06-23 10:00:00', event_type: 'meeting' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/v1/calendar/events', () => {
    it('应该返回日程事件列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, title: '客户拜访' }, { id: 2, title: '团队会议' }]]); // list

      const res = await request(app)
        .get('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('PUT /api/v1/calendar/events/:id', () => {
    it('应该返回400当没有要更新的字段', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ create_by: 1 }]]); // ownership check

      const res = await request(app)
        .put('/api/v1/calendar/events/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常更新日程', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ create_by: 1 }]]) // ownership check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const res = await request(app)
        .put('/api/v1/calendar/events/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '更新后的标题' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('DELETE /api/v1/calendar/events/:id', () => {
    it('应该返回200当正常删除日程', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ create_by: 1 }]]) // ownership check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .delete('/api/v1/calendar/events/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/calendar/events');

      expect(res.status).toBe(401);
    });
  });
});

