const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';
process.env.CRON_SECRET = 'test_cron_secret';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../utils/scoring', () => ({
  checkAllSuppliersScores: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../utils/qualification-reminder', () => ({
  checkQualificationExpiry: jest.fn().mockResolvedValue(undefined),
  updateQualificationStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../scripts/generate_reminders', () => ({
  generateReminders: jest.fn().mockResolvedValue(undefined)
}));

const app = express();
app.use(express.json());

const cronRoutes = require('../routes/cronJobs');
app.use('/api/v1/cron', cronRoutes);

const cronAuth = `Bearer ${process.env.CRON_SECRET}`;

describe('定时任务模块', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/cron/daily-scoring', () => {
    it('应该返回200当正常执行每日评分', async () => {
      const res = await request(app)
        .get('/api/v1/cron/daily-scoring')
        .set('Authorization', cronAuth);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/v1/cron/auto-release', () => {
    it('应该返回200当正常执行公海回收', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]); // customers to release (empty)

      const res = await request(app)
        .get('/api/v1/cron/auto-release')
        .set('Authorization', cronAuth);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/v1/cron/generate-reminders', () => {
    it('应该返回200当正常生成提醒', async () => {
      const res = await request(app)
        .get('/api/v1/cron/generate-reminders')
        .set('Authorization', cronAuth);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/cron/daily-scoring');

      expect(res.status).toBe(401);
    });
  });
});

