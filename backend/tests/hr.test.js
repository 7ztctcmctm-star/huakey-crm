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
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const hrRoutes = require('../routes/hr');
app.use('/api/hr', hrRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('人力资源模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/hr/employees', () => {
    it('应该返回员工列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // 1. blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 2 }]]) // 2. count
        .mockResolvedValueOnce([[ // 3. employee list
          { id: 1, real_name: '张三', username: 'zhangsan', dept_name: '销售部', role_name: '销售', hire_date: '2024-01-15' },
          { id: 2, real_name: '李四', username: 'lisi', dept_name: '技术部', role_name: '技术', hire_date: '2024-03-01' }
        ]])
        .mockResolvedValueOnce([[{ expiring: 1 }]]); // 4. expiring contracts count

      const res = await request(app)
        .get('/api/hr/employees')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data).toHaveProperty('expiring_contracts');
    });
  });

  describe('GET /api/hr/employees/:id', () => {
    it('应该返回员工详情', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, real_name: '张三', dept_name: '销售部', hire_date: '2024-01-15', position: '销售经理' }]]); // employee detail

      const res = await request(app)
        .get('/api/hr/employees/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.real_name).toBe('张三');
    });
  });

  describe('POST /api/hr/employees/:id/profile', () => {
    it('应该返回400当没有要更新的字段', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]); // user exists check

      const res = await request(app)
        .post('/api/hr/employees/1/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当正常创建员工档案', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1 }]]) // user exists check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert/update profile

      const res = await request(app)
        .post('/api/hr/employees/1/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ hire_date: '2024-01-15', position: '销售经理', employment_type: '全职', salary_base: 8000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/hr/org-tree', () => {
    it('应该返回组织架构树', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // departments
          { id: 1, name: '总公司', parent_id: null, sort: 1, employee_count: 10, manager_name: '张三' },
          { id: 2, name: '销售部', parent_id: 1, sort: 1, employee_count: 5, manager_name: '李四' }
        ]])
        .mockResolvedValueOnce([[{ cnt: 2 }]]) // total depts
        .mockResolvedValueOnce([[{ cnt: 10 }]]); // total employees

      const res = await request(app)
        .get('/api/hr/org-tree')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('tree');
      expect(res.body.data).toHaveProperty('total_depts');
      expect(res.body.data).toHaveProperty('total_employees');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/hr/employees');

      expect(res.status).toBe(401);
    });
  });
});
