const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';
process.env.DB_PASSWORD = 'test_db_pass';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('SELECT 1;'),
    createWriteStream: jest.fn().mockReturnValue({ write: jest.fn(), end: jest.fn() }),
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn()
  };
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, callback) => {
    if (callback) callback(null, '', '');
    return { stdin: { end: jest.fn() } };
  })
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['backup:add', 'backup:restore']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const backupRoutes = require('../routes/backup');
app.use('/api/v1/backup', backupRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('数据备份模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('POST /api/v1/backup/list', () => {
    it('应该返回备份列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, file_name: 'huakey_crm_full_2026-06-23.sql', status: 'success' }]]); // list

      const res = await request(app)
        .post('/api/v1/backup/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('POST /api/v1/backup/create', () => {
    it('应该返回200当正常创建备份', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert backup record

      const res = await request(app)
        .post('/api/v1/backup/create')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('file_name');
    });
  });

  describe('POST /api/v1/backup/restore', () => {
    it('应该返回400当确认码不正确', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/backup/restore')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, confirm_code: 'WRONG-CODE' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常恢复备份', async () => {
      const confirmCode = crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update('backup-restore-1').digest('hex').slice(0, 12);
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, status: 'success', file_path: '/tmp/test_backup.sql' }]]); // SELECT backup record

      const res = await request(app)
        .post('/api/v1/backup/restore')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, confirm_code: confirmCode });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/backup/delete', () => {
    it('应该返回200当正常删除备份', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ id: 1, file_path: '/tmp/test_backup.sql' }]]) // SELECT backup record
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE record

      const res = await request(app)
        .post('/api/v1/backup/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/backup/list')
        .send({});

      expect(res.status).toBe(401);
    });
  });
});

