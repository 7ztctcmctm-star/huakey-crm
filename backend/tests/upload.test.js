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
  getUserPermissions: jest.fn().mockResolvedValue(['file']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/supabaseStorage', () => ({
  getSupabaseStorage: jest.fn().mockResolvedValue(null)
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const uploadRoutes = require('../routes/upload');
app.use('/api/v1/upload', uploadRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('文件上传模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/upload/list', () => {
    it('应该返回文件列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[ // list
          { id: 1, file_name: '合同扫描件.pdf', file_path: '/uploads/attachments/abc123.pdf', file_size: 102400 },
          { id: 2, file_name: '报价单.xlsx', file_path: '/uploads/attachments/def456.xlsx', file_size: 51200 }
        ]]);

      const res = await request(app)
        .get('/api/v1/upload/list')
        .set('Authorization', `Bearer ${token}`)
        .query({ business_type: 'contract', business_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/v1/upload/delete', () => {
    it('应该返回200当正常删除附件', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ id: 1, file_name: '合同扫描件.pdf', file_path: '/uploads/attachments/abc123.pdf' }]]) // existence check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft delete

      const res = await request(app)
        .post('/api/v1/upload/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('POST /api/v1/upload/file', () => {
    it('应该返回400当没有选择文件', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/upload/file')
        .set('Authorization', `Bearer ${token}`)
        .field('business_type', 'contract')
        .field('business_id', '1');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400005);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/upload/list')
        .query({ business_type: 'contract', business_id: 1 });

      expect(res.status).toBe(401);
    });
  });
});

