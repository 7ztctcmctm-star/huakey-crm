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
  getUserPermissions: jest.fn().mockResolvedValue(['competitor:view', 'competitor:add', 'competitor:edit', 'competitor:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());
app.use('/api/v1/competitor', require('../routes/competitor'));

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('竞争对手模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/competitor/add', () => {
    it('应该返回400当缺少name', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/competitor/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ industry: 'IT' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('校验失败');
    });

    it('应该返回200当正常创建', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/v1/competitor/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '竞品A', industry: 'IT', scale: 'large' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/v1/competitor/list', () => {
    it('应该返回200和竞争对手列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 2 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, name: '竞品A', encounter_count: 5, win_count: 3 },
          { id: 2, name: '竞品B', encounter_count: 3, win_count: 1 }
        ]]);

      const res = await request(app)
        .get('/api/v1/competitor/list')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/v1/competitor/intel/add', () => {
    it('应该返回400当参数不完整', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/competitor/intel/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ competitor_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常添加情报', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const res = await request(app)
        .post('/api/v1/competitor/intel/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ competitor_id: 1, intel_type: 'product', title: '新产品发布', content: '竞品发布了新产品' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('POST /api/v1/competitor/encounters/add', () => {
    it('应该返回200当正常添加交锋记录', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 20 }]);

      const res = await request(app)
        .post('/api/v1/competitor/encounters/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ competitor_id: 1, encounter_type: 'won', our_price: 10000, their_price: 12000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('DELETE /api/v1/competitor/:id', () => {
    it('应该返回200当正常删除竞争对手', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .delete('/api/v1/competitor/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });
});

