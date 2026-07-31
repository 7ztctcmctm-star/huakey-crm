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
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:import']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const importRoutes = require('../routes/customer/import');
app.use('/api/v1/customer', importRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('客户导入模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/customer/template', () => {
    it('应该返回导入模板文件', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .get('/api/v1/customer/template')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  describe('POST /api/v1/customer/import-preview', () => {
    it('应该返回400当缺少file', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customer/import-preview')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400001);
    });

    it('应该返回200当正常预览', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[ // validation rules
          { id: 1, field_name: 'company_name', rule_type: 'required', is_active: 1 }
        ]]);

      // 创建一个简单的 Excel buffer
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([['公司名称', '联系人', '电话'], ['测试公司', '张三', '13800138000']]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/api/v1/customer/import-preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buf, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('preview');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/customer/template');

      expect(res.status).toBe(401);
    });
  });
});

