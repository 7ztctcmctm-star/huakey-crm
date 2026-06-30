process.env.JWT_SECRET = 'test_secret_key_for_notification_tests';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const mockPool = { query: jest.fn() };
jest.mock('../config/database', () => mockPool);
jest.mock('../utils/sseManager', () => ({ send: jest.fn() }));

const notificationRoutes = require('../routes/notification');

const app = express();
app.use(express.json());

// 绕过 authenticateToken，直接注入用户
app.use('/notification', (req, res, next) => {
  req.user = { userId: 2, roleId: 3, roleCode: 'sales', manageAll: false };
  next();
}, notificationRoutes);

const token = jwt.sign(
  { userId: 2, username: 'test', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('通知 REST API', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  it('GET /notification/unread-count 返回未读数', async () => {
    mockPool.query.mockResolvedValue([[{ count: 3 }]]);

    const res = await request(app)
      .get('/notification/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it('GET /notification/list 返回分页列表与未读数', async () => {
    const row = { id: 1, type: 'system', title: 'T', content: 'C', link_url: null, business_type: 'quote', business_id: null, is_read: 0, created_at: new Date().toISOString() };
    mockPool.query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*) as total')) return [[{ total: 1 }]];
      if (sql.includes('LIMIT ? OFFSET ?')) return [[row]];
      if (sql.includes('COUNT(*) as count')) return [[{ count: 1 }]];
      return [[]];
    });

    const res = await request(app)
      .get('/notification/list?page=1&pageSize=20')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.unread_count).toBe(1);
    // 无 link_url 时根据 business_type 生成
    expect(res.body.data.list[0].link_url).toBe('/quote');
  });

  it('POST /notification/read/:id 标记单条已读', async () => {
    mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/notification/read/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      'UPDATE crm_notification SET is_read = 1 WHERE id = ? AND to_user_id = ?',
      [1, 2]
    );
  });

  it('POST /notification/read-all 全部已读', async () => {
    mockPool.query.mockResolvedValue([{ affectedRows: 5 }]);

    const res = await request(app)
      .post('/notification/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.affectedRows).toBe(5);
  });
});
