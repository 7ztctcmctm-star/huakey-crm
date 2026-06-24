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
  getUserPermissions: jest.fn().mockResolvedValue(['system']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const integrationRoutes = require('../routes/integration');
app.use('/api/integration', integrationRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('外部集成模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/integration/list', () => {
    it('应该返回集成列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // integration list
          { id: 1, type: 'email', name: '邮件服务', status: 'active', config: '{"host":"smtp.qq.com","user":"test@qq.com","pass":"oldpassword","from":"test@qq.com"}' },
          { id: 2, type: 'sms', name: '短信服务', status: 'inactive', config: '{}' }
        ]]);

      const res = await request(app)
        .get('/api/integration/list')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
      // 验证脱敏：密码字段应被遮盖
      expect(res.body.data[0].config.pass).toBe('***');
    });
  });

  describe('POST /api/integration/send-email', () => {
    it('应该返回400当缺少to', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/integration/send-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: '测试', body: '内容' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常发送邮件', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ config: '{"host":"smtp.qq.com","port":465,"user":"test@qq.com","pass":"password","from":"test@qq.com"}' }]]) // email config
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert email log

      // 需要 mock nodemailer
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn().mockReturnValue({
          sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
          verify: jest.fn().mockResolvedValue(true),
          close: jest.fn().mockResolvedValue(true)
        })
      }));

      const res = await request(app)
        .post('/api/integration/send-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ to: 'client@example.com', subject: '报价单', body: '请查收报价单' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/integration/email-log', () => {
    it('应该返回邮件日志', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, to_email: 'client@example.com', subject: '报价单', status: 'sent', sender_name: '张三' }
        ]]);

      const res = await request(app)
        .get('/api/integration/email-log')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/integration/list');

      expect(res.status).toBe(401);
    });
  });
});
