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
  getUserPermissions: jest.fn().mockResolvedValue(['target']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const targetRoutes = require('../routes/target');
app.use('/api/target', targetRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('销售目标模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/target/set', () => {
    it('应该返回400当缺少user_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check

      const res = await request(app)
        .post('/api/target/set')
        .set('Authorization', `Bearer ${token}`)
        .send({ year: 2026, month: 7, target_amount: 100000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常设置销售目标', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 2 }]]) // user exists check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT ON DUPLICATE KEY UPDATE

      const res = await request(app)
        .post('/api/target/set')
        .set('Authorization', `Bearer ${token}`)
        .send({ user_id: 2, year: 2026, month: 7, target_amount: 100000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/target/list', () => {
    it('应该返回目标列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[ // users
          { id: 1, real_name: '张三', dept_name: '销售部' },
          { id: 2, real_name: '李四', dept_name: '销售部' }
        ]])
        .mockResolvedValueOnce([[ // targets
          { user_id: 1, target_amount: 100000 },
          { user_id: 2, target_amount: 80000 }
        ]])
        .mockResolvedValueOnce([[ // actuals
          { user_id: 1, actual_amount: 75000 }
        ]])
        .mockResolvedValueOnce([[ // payments
          { user_id: 1, payment_amount: 50000 }
        ]]);

      const res = await request(app)
        .post('/api/target/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ year: 2026, month: 6 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.year).toBe(2026);
      expect(res.body.data.month).toBe(6);
    });
  });

  describe('POST /api/target/delete', () => {
    it('应该返回200当正常删除目标', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .post('/api/target/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/target/list')
        .send({ year: 2026, month: 6 });

      expect(res.status).toBe(401);
    });
  });
});
