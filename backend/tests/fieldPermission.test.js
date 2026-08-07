const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_field_permission_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn(),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

jest.mock('../services/productService', () => ({
  listProducts: jest.fn()
}));

jest.mock('../services/supplierService', () => ({
  getSupplier: jest.fn()
}));

const { stripRestrictedFields, checkFieldPermission } = require('../middleware/permission');
const productRoutes = require('../routes/product');
const supplierRoutes = require('../routes/supplier');

const app = express();
app.use(express.json());
app.use('/api/v1/product', productRoutes);
app.use('/api/v1/supplier', supplierRoutes);

const generateToken = (roleCode, manageAll = false, roleId = 2) => {
  return jwt.sign(
    { userId: 2, username: roleCode, roleId, roleCode, manageAll },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const authMocks = (manageAll = false, roleCode = 'sales') => {
  mockPool.query
    .mockResolvedValueOnce([[]]) // 黑名单检查
    .mockResolvedValueOnce([[{ view_all: manageAll ? 1 : 0, manage_all: manageAll ? 1 : 0, role_code: roleCode }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status; // 角色查询
};

describe('字段级权限', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValue(['product', 'supplier']);
  });

  describe('工具函数', () => {
    it('stripRestrictedFields 删除对象中的指定字段', () => {
      const data = { id: 1, name: 'A', cost_price: 99 };
      stripRestrictedFields(data, ['cost_price']);
      expect(data.cost_price).toBeUndefined();
      expect(data).toEqual({ id: 1, name: 'A' });
    });

    it('stripRestrictedFields 对数组中的每个元素生效', () => {
      const arr = [{ id: 1, cost_price: 10 }, { id: 2, cost_price: 20 }];
      stripRestrictedFields(arr, ['cost_price']);
      expect(arr.every(i => i.cost_price === undefined)).toBe(true);
    });

    it('checkFieldPermission 为管理员返回空限制列表', () => {
      const req = { user: { manageAll: true, roleCode: 'super_admin', roleId: 1 } };
      checkFieldPermission('product')(req, {}, () => {});
      expect(req.restrictedFields).toEqual([]);
    });

    it('checkFieldPermission 为普通用户返回敏感字段列表', () => {
      const req = { user: { manageAll: false, roleCode: 'sales', roleId: 3 } };
      checkFieldPermission('product')(req, {}, () => {});
      expect(req.restrictedFields).toContain('cost_price');
    });
  });

  describe('product/list', () => {
    it('管理员看到 cost_price', async () => {
      const { listProducts } = require('../services/productService');
      listProducts.mockResolvedValue({ list: [{ id: 1, name: '产品A', cost_price: 99 }], total: 1 });
      authMocks(true, 'super_admin');

      const res = await request(app)
        .post('/api/v1/product/list')
        .set('Authorization', `Bearer ${generateToken('super_admin', true, 1)}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list[0].cost_price).toBe(99);
    });

    it('普通销售看不到 cost_price', async () => {
      const { listProducts } = require('../services/productService');
      listProducts.mockResolvedValue({ list: [{ id: 1, name: '产品A', cost_price: 99 }], total: 1 });
      authMocks(false, 'sales');

      const res = await request(app)
        .post('/api/v1/product/list')
        .set('Authorization', `Bearer ${generateToken('sales', false, 3)}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list[0].cost_price).toBeUndefined();
    });
  });

  describe('supplier/detail', () => {
    it('采购员看不到 supplier 银行账号', async () => {
      const { getSupplier } = require('../services/supplierService');
      getSupplier.mockResolvedValue({
        id: 1,
        name: '供应商A',
        bank_account: '622200000000',
        tax_id: '91110000',
        contact_phone: '13800138000',
        contact_email: 'a@example.com'
      });
      authMocks(false, 'purchase');

      const res = await request(app)
        .get('/api/v1/supplier/detail/1')
        .set('Authorization', `Bearer ${generateToken('purchase', false, 5)}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.bank_account).toBeUndefined();
      expect(res.body.data.tax_id).toBeUndefined();
      expect(res.body.data.contact_phone).toBeUndefined();
      expect(res.body.data.contact_email).toBeUndefined();
      expect(res.body.data.name).toBe('供应商A');
    });
  });
});
