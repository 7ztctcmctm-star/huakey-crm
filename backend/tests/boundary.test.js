const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ============ Mock pool ============
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

// ============ Mock services ============
jest.mock('../services/customerDetailService', () => ({
  VALID_SOURCES: ['website', 'referral', 'exhibition', 'cold_call', 'other'],
  SOURCE_PARENT_MAP: { website: '线上', referral: '转介�? },
  addCustomer: jest.fn(),
  getCustomerDetail: jest.fn(),
  getCustomer360: jest.fn(),
  updateCustomer: jest.fn(),
  deleteCustomer: jest.fn(),
  exportCustomers: jest.fn(),
  canManageCustomer: jest.fn()
}));

jest.mock('../services/customerService', () => ({
  listCustomers: jest.fn(),
  convertStatus: jest.fn()
}));

jest.mock('../services/opportunityService', () => ({
  listOpportunities: jest.fn(),
  createOpportunity: jest.fn(),
  getOpportunityWithPermission: jest.fn(),
  getOpportunityForPermission: jest.fn(),
  updateOpportunity: jest.fn(),
  advanceStage: jest.fn(),
  deleteOpportunity: jest.fn(),
  getStageLog: jest.fn(),
  getStageStats: jest.fn(),
  getFunnelStats: jest.fn(),
  STAGE_MAP: { 1: '初步接触', 2: '需求确�?, 3: '方案报价', 4: '商务谈判', 5: '赢单', 6: '输单' }
}));

jest.mock('../services/contractService', () => ({
  createContract: jest.fn()
}));

jest.mock('../services/contractCrudService', () => ({
  listContracts: jest.fn(),
  getContractDetail: jest.fn(),
  updateContract: jest.fn(),
  deleteContract: jest.fn(),
  getOpportunityList: jest.fn(),
  searchContracts: jest.fn(),
  createContractNotification: jest.fn()
}));

jest.mock('../services/productService', () => ({
  listProducts: jest.fn(),
  createProduct: jest.fn(),
  getProduct: jest.fn(),
  getProductFull: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  getCategories: jest.fn(),
  getProductPrices: jest.fn(),
  createPrice: jest.fn(),
  updatePrice: jest.fn(),
  deletePrice: jest.fn(),
  getDefaultPrice: jest.fn()
}));

// Mock permission middleware �?放行所有请�?
jest.mock('../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  checkFieldPermission: () => (req, res, next) => next(),
  stripRestrictedFields: (data) => data,
  buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '', params: [] })
}));

// Mock cache middleware �?透传
jest.mock('../middleware/cache', () => ({
  cache: () => (req, res, next) => next(),
  invalidateCache: jest.fn()
}));

// Mock logger
jest.mock('../middleware/logger', () => ({
  createRouteLogger: () => jest.fn().mockResolvedValue(null)
}));

// Mock fieldLog
jest.mock('../utils/fieldLog', () => ({
  logFieldChanges: jest.fn()
}));

// Mock admin middleware �?兼容默认导出和命名导�?
jest.mock('../middleware/admin', () => {
  const pass = (req, res, next) => next();
  // 兼容 const requireAdmin = require('...')  �?const { requireManager } = require('...')
  pass.requireAdmin = pass;
  pass.requireManager = pass;
  return pass;
});

// ============ Setup app ============
const app = express();
app.use(express.json({ limit: '5mb' }));

const customerRoutes = require('../routes/customer');
const opportunityRoutes = require('../routes/opportunity');
const contractRoutes = require('../routes/contract');
const productRoutes = require('../routes/product');

app.use('/api/v1/customer', customerRoutes);
app.use('/api/v1/opportunity', opportunityRoutes);
app.use('/api/v1/contract', contractRoutes);
app.use('/api/v1/product', productRoutes);

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const token = generateToken();

// ============ Helpers ============
const _LONG_STRING_200 = 'A'.repeat(200);
const LONG_STRING_500 = 'A'.repeat(500);
const LONG_STRING_2000 = 'A'.repeat(2000);
const LONG_STRING_10000 = 'A'.repeat(10000);
const SQL_INJECTION = "' OR 1=1 --";
const XSS_PAYLOAD = '<script>alert(1)</script>';
const EMOJI_STR = '客户🎉💼🚀';
const NEWLINE_STR = "line1\nline2\r\nline3\ttab";
const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER; // 9007199254740991

// ================================================================
//  1. 空数据场�?
// ================================================================
describe('边界测试 - 空数据场�?, () => {
  beforeEach(() => mockPool.query.mockReset());

  describe('客户 list 返回空数�?, () => {
    it('空结果应返回 list=[] total=0', async () => {
      const customerService = require('../services/customerService');
      customerService.listCustomers.mockResolvedValue({ list: [], total: 0 });

      const res = await request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });
  });

  describe('商机 list 返回空数�?, () => {
    it('空结果应返回 list=[] total=0', async () => {
      const svc = require('../services/opportunityService');
      svc.listOpportunities.mockResolvedValue({ list: [], total: 0 });

      const res = await request(app)
        .post('/api/v1/opportunity/list')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
    });
  });

  describe('合同 list 返回空数�?, () => {
    it('空结果应返回 list=[] total=0', async () => {
      const svc = require('../services/contractCrudService');
      svc.listContracts.mockResolvedValue({ list: [], total: 0 });

      const res = await request(app)
        .post('/api/v1/contract/list')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
    });
  });

  describe('产品 list 返回空数�?, () => {
    it('空结果应返回 list=[] total=0', async () => {
      const svc = require('../services/productService');
      svc.listProducts.mockResolvedValue({ list: [], total: 0 });

      const res = await request(app)
        .post('/api/v1/product/list')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
    });
  });

  describe('详情接口 id 不存�?, () => {
    it('客户详情 99999 应返�?404', async () => {
      const svc = require('../services/customerDetailService');
      svc.getCustomerDetail.mockRejectedValue({ code: 404, message: '客户不存�? });

      const res = await request(app)
        .get('/api/v1/customer/detail/99999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('商机详情 99999 应返�?404', async () => {
      const svc = require('../services/opportunityService');
      svc.getOpportunityWithPermission.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/opportunity/detail/99999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('合同详情 99999 应返�?404', async () => {
      const svc = require('../services/contractCrudService');
      svc.getContractDetail.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/contract/detail/99999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('产品详情 99999 应返�?404', async () => {
      const svc = require('../services/productService');
      svc.getProduct.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/product/detail/99999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});

// ================================================================
//  2. 极大值场�?
// ================================================================
describe('边界测试 - 极大值场�?, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pageSize 超大�?, () => {
    it('customer/list pageSize=99999 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ pageSize: 99999 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('校验失败');
    });

    it('opportunity/list pageSize=99999 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ pageSize: 99999 });

      expect(res.status).toBe(400);
    });

    it('contract/list pageSize=99999 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/contract/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ pageSize: 99999 });

      expect(res.status).toBe(400);
    });

    it('product/list pageSize=99999 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/product/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ pageSize: 99999 });

      expect(res.status).toBe(400);
    });
  });

  describe('字符串字段超�?, () => {
    it('customer/add company_name=10000字符 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: LONG_STRING_10000 });

      expect(res.status).toBe(400);
    });

    it('customer/add remark=2000字符 应通过 (max=2000)', async () => {
      const svc = require('../services/customerDetailService');
      svc.addCustomer.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '测试', remark: LONG_STRING_2000 });

      expect(res.status).toBe(200);
    });

    it('customer/add remark=2001字符 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '测试', remark: 'A'.repeat(2001) });

      expect(res.status).toBe(400);
    });

    it('product/add name=10000字符 应被 Joi 拒绝 (max=200)', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: LONG_STRING_10000 });

      expect(res.status).toBe(400);
    });

    it('contract/add payment_terms=500字符 应通过 (max=500)', async () => {
      const svc = require('../services/contractService');
      svc.createContract.mockResolvedValue({ id: 1, contract_no: 'HT-001' });

      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100, payment_terms: LONG_STRING_500 });

      expect(res.status).toBe(200);
    });
  });

  describe('数值字段极大�?, () => {
    it('contract/add amount=MAX_SAFE_INTEGER 应通过 Joi', async () => {
      const svc = require('../services/contractService');
      svc.createContract.mockResolvedValue({ id: 1, contract_no: 'HT-002' });

      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: MAX_SAFE_INT });

      expect(res.status).toBe(200);
    });

    it('opportunity/add expected_amount=MAX_SAFE_INTEGER 应通过 Joi', async () => {
      const svc = require('../services/opportunityService');
      svc.createOpportunity.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试商机', customer_id: 1, expected_amount: MAX_SAFE_INT });

      expect(res.status).toBe(200);
    });

    it('product/add price=MAX_SAFE_INTEGER 应通过 Joi', async () => {
      const svc = require('../services/productService');
      svc.createProduct.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试产品', price: MAX_SAFE_INT });

      expect(res.status).toBe(200);
    });

    it('product/add stock=MAX_SAFE_INTEGER 应通过 Joi', async () => {
      const svc = require('../services/productService');
      svc.createProduct.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '测试产品', stock: MAX_SAFE_INT });

      expect(res.status).toBe(200);
    });
  });
});

// ================================================================
//  3. 特殊字符场景
// ================================================================
describe('边界测试 - 特殊字符场景', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('SQL 注入字符�?, () => {
    it('customer/add company_name �?SQL 注入 应通过 Joi（由数据库层防御�?, async () => {
      const svc = require('../services/customerDetailService');
      svc.addCustomer.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: SQL_INJECTION });

      expect(res.status).toBe(200);
      // 验证传给 service 的参数未被篡�?
      expect(svc.addCustomer).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({ company_name: SQL_INJECTION }),
        1
      );
    });

    it('opportunity/add remark �?SQL 注入 应通过', async () => {
      const svc = require('../services/opportunityService');
      svc.createOpportunity.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, remark: SQL_INJECTION });

      expect(res.status).toBe(200);
    });

    it('contract/add payment_terms �?SQL 注入 应通过', async () => {
      const svc = require('../services/contractService');
      svc.createContract.mockResolvedValue({ id: 1, contract_no: 'HT-003' });

      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100, payment_terms: SQL_INJECTION });

      expect(res.status).toBe(200);
    });

    it('product/add description �?SQL 注入 应通过', async () => {
      const svc = require('../services/productService');
      svc.createProduct.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', description: SQL_INJECTION });

      expect(res.status).toBe(200);
    });
  });

  describe('XSS 字符�?, () => {
    it('customer/add company_name �?XSS 应通过（由前端转义�?, async () => {
      const svc = require('../services/customerDetailService');
      svc.addCustomer.mockResolvedValue({ id: 2 });

      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: XSS_PAYLOAD });

      expect(res.status).toBe(200);
    });

    it('opportunity/add name �?XSS 应通过', async () => {
      const svc = require('../services/opportunityService');
      svc.createOpportunity.mockResolvedValue({ id: 2 });

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: XSS_PAYLOAD, customer_id: 1 });

      expect(res.status).toBe(200);
    });

    it('product/add name �?XSS 应通过', async () => {
      const svc = require('../services/productService');
      svc.createProduct.mockResolvedValue({ id: 2 });

      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: XSS_PAYLOAD });

      expect(res.status).toBe(200);
    });
  });

  describe('Emoji 字符�?, () => {
    it('customer/add company_name �?emoji 应通过', async () => {
      const svc = require('../services/customerDetailService');
      svc.addCustomer.mockResolvedValue({ id: 3 });

      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: EMOJI_STR });

      expect(res.status).toBe(200);
    });

    it('opportunity/add remark �?emoji 应通过', async () => {
      const svc = require('../services/opportunityService');
      svc.createOpportunity.mockResolvedValue({ id: 3 });

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, remark: EMOJI_STR });

      expect(res.status).toBe(200);
    });
  });

  describe('换行符和制表�?, () => {
    it('customer/add address 含换�?制表�?应通过', async () => {
      const svc = require('../services/customerDetailService');
      svc.addCustomer.mockResolvedValue({ id: 4 });

      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '换行测试', address: NEWLINE_STR });

      expect(res.status).toBe(200);
    });

    it('contract/add remark 含换行符 应通过', async () => {
      const svc = require('../services/contractService');
      svc.createContract.mockResolvedValue({ id: 4, contract_no: 'HT-004' });

      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100, remark: NEWLINE_STR });

      expect(res.status).toBe(200);
    });
  });
});

// ================================================================
//  4. 并发模拟
// ================================================================
describe('边界测试 - 并发模拟 (10个同时请�?', () => {
  beforeEach(() => jest.clearAllMocks());

  it('customer/list 10个并发请求不报错', async () => {
    const svc = require('../services/customerService');
    svc.listCustomers.mockResolvedValue({ list: [{ id: 1 }], total: 1 });

    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${token}`)
        .send({})
    );

    const results = await Promise.all(requests);
    results.forEach(res => {
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
    expect(svc.listCustomers).toHaveBeenCalledTimes(10);
  });

  it('opportunity/add 10个并发请求不报错', async () => {
    const svc = require('../services/opportunityService');
    svc.createOpportunity.mockImplementation(async (_pool, _body) => ({ id: Math.floor(Math.random() * 1000) }));

    const requests = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `并发商机${i}`, customer_id: 1 })
    );

    const results = await Promise.all(requests);
    results.forEach(res => {
      expect(res.status).toBe(200);
    });
    expect(svc.createOpportunity).toHaveBeenCalledTimes(10);
  });

  it('contract/add 10个并发请求不报错', async () => {
    const svc = require('../services/contractService');
    svc.createContract.mockImplementation(async () => ({ id: Math.floor(Math.random() * 1000), contract_no: 'HT-X' }));

    const requests = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100 + i })
    );

    const results = await Promise.all(requests);
    results.forEach(res => {
      expect(res.status).toBe(200);
    });
    expect(svc.createContract).toHaveBeenCalledTimes(10);
  });

  it('product/add 10个并发请求不报错', async () => {
    const svc = require('../services/productService');
    svc.createProduct.mockImplementation(async () => ({ id: Math.floor(Math.random() * 1000) }));

    const requests = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `并发产品${i}` })
    );

    const results = await Promise.all(requests);
    results.forEach(res => {
      expect(res.status).toBe(200);
    });
    expect(svc.createProduct).toHaveBeenCalledTimes(10);
  });

  it('混合接口 10个并发请求不报错', async () => {
    const custSvc = require('../services/customerService');
    const oppSvc = require('../services/opportunityService');
    const prodSvc = require('../services/productService');
    custSvc.listCustomers.mockResolvedValue({ list: [], total: 0 });
    oppSvc.listOpportunities.mockResolvedValue({ list: [], total: 0 });
    prodSvc.listProducts.mockResolvedValue({ list: [], total: 0 });

    const requests = [
      request(app).post('/api/v1/customer/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/opportunity/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/product/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/customer/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/opportunity/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/product/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/customer/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/opportunity/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/product/list').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/v1/customer/list').set('Authorization', `Bearer ${token}`).send({})
    ];

    const results = await Promise.all(requests);
    results.forEach(res => {
      expect(res.status).toBe(200);
    });
  });
});

// ================================================================
//  5. 类型错误场景
// ================================================================
describe('边界测试 - 类型错误场景', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('数值字段传字符�?, () => {
    it('customer/add phone 传纯字母 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '测试', phone: 'abcdefgh' });

      expect(res.status).toBe(400);
    });

    it('opportunity/add customer_id 传字符串 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 'not_a_number' });

      expect(res.status).toBe(400);
    });

    it('opportunity/add expected_amount 传字符串 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, expected_amount: 'abc' });

      expect(res.status).toBe(400);
    });

    it('contract/add amount 传字符串 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 'not_money' });

      expect(res.status).toBe(400);
    });

    it('product/add price 传字符串 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', price: 'free' });

      expect(res.status).toBe(400);
    });

    it('product/add stock 传字符串 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', stock: 'many' });

      expect(res.status).toBe(400);
    });
  });

  describe('必填字段�?null / undefined / 空字符串', () => {
    it('customer/add company_name=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: null });

      expect(res.status).toBe(400);
    });

    it('customer/add company_name=空字符串 应被 Joi 拒绝 (不允许空)', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '' });

      // Joi required() + empty string �?400
      expect(res.status).toBe(400);
    });

    it('customer/add 不传 company_name 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ contact_name: '张三' });

      expect(res.status).toBe(400);
    });

    it('opportunity/add name=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: null, customer_id: 1 });

      expect(res.status).toBe(400);
    });

    it('opportunity/add customer_id=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: null });

      expect(res.status).toBe(400);
    });

    it('opportunity/add 不传 name �?customer_id 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('contract/add customer_id=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: null, amount: 100 });

      expect(res.status).toBe(400);
    });

    it('contract/add amount=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: null });

      expect(res.status).toBe(400);
    });

    it('contract/add �?body 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('product/add name=null 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: null });

      expect(res.status).toBe(400);
    });

    it('product/add 不传 name 应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 100 });

      expect(res.status).toBe(400);
    });
  });

  describe('日期字段传非法格�?, () => {
    it('opportunity/add expected_date 传非法日�?应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, expected_date: 'not-a-date' });

      expect(res.status).toBe(400);
    });

    it('opportunity/add expected_date 传中文日�?应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, expected_date: '2026�?�?5�? });

      expect(res.status).toBe(400);
    });

    it('contract/add sign_date 传非法日�?应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100, sign_date: '25/06/2026' });

      expect(res.status).toBe(400);
    });

    it('contract/add delivery_date 传非法日�?应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: 100, delivery_date: 'abc' });

      expect(res.status).toBe(400);
    });

    it('customer/add start_date 传非法日�?应被 Joi 拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/customer/list')
        .set('Authorization', `Bearer ${token}`)
        .send({ start_date: '2026-13-45' });

      expect(res.status).toBe(400);
    });
  });

  describe('enum 字段传无效�?, () => {
    it('customer/add level �?Z 应被 Joi 拒绝 (仅允�?A/B/C)', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: '测试', level: 'Z' });

      expect(res.status).toBe(400);
    });

    it('opportunity/add stage �?99 应被 Joi 拒绝 (仅允�?1-6)', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, stage: 99 });

      expect(res.status).toBe(400);
    });

    it('contract/add status �?99 应被 Joi 拒绝 (仅允�?1-4)', async () => {
      // add 没有 status 字段，但 Joi stripUnknown 会忽�?
      // �?update 来测 enum 更合�?
      const res = await request(app)
        .post('/api/v1/contract/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, customer_id: 1, amount: 100, status: 99 });

      expect(res.status).toBe(400);
    });

    it('product/add category 传超长分类名 应被 Joi 拒绝 (max=100)', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', category: 'A'.repeat(101) });

      expect(res.status).toBe(400);
    });
  });

  describe('负数字段', () => {
    it('contract/add amount 传负�?应被 Joi 拒绝 (min=0)', async () => {
      const res = await request(app)
        .post('/api/v1/contract/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, amount: -100 });

      expect(res.status).toBe(400);
    });

    it('opportunity/add win_rate 传负�?应被 Joi 拒绝 (min=0)', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, win_rate: -10 });

      expect(res.status).toBe(400);
    });

    it('opportunity/add win_rate 传超�?100 应被 Joi 拒绝 (max=100)', async () => {
      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '商机', customer_id: 1, win_rate: 101 });

      expect(res.status).toBe(400);
    });

    it('product/add price 传负�?应被 Joi 拒绝 (min=0)', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', price: -0.01 });

      expect(res.status).toBe(400);
    });

    it('product/add stock 传负�?应被 Joi 拒绝 (min=0)', async () => {
      const res = await request(app)
        .post('/api/v1/product/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '产品', stock: -1 });

      expect(res.status).toBe(400);
    });
  });
});

