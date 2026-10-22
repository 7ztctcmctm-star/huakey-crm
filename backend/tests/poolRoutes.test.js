process.env.JWT_SECRET = 'test_secret_key_for_pool_routes_tests';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// authenticateToken 会查库刷新 manage_all/role_code/status，按 SQL+roleId 分流模拟
const mockPool = {
  query: jest.fn(async (sql, _params) => {
    if (sql.includes('sys_token_blacklist')) return [[]];
    if (sql.includes('FROM sys_role')) return [[{ view_all: 0, manage_all: 0, role_code: 'sales' }]];
    if (sql.includes('FROM sys_user')) return [[{ must_change_password: 0, status: 1 }]];
    return [[]];
  })
};
jest.mock('../config/database', () => mockPool);
jest.mock('../controllers/customerController', () => ({
  listPoolNew: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { echoed: req.body } })),
  claimPool: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { id: req.body.id, idempotency_key: req.body.idempotency_key } })),
  releaseToPool: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { id: req.body.id, reason: req.body.reason } }))
}));
jest.mock('../controllers/transferController', () => ({
  create: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { m: 'create' } })),
  accept: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { m: 'accept' } })),
  reject: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { m: 'reject' } })),
  myPending: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { m: 'my-pending' } })),
  byCustomer: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { dataPermission: req.dataPermission } })),
  candidates: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { m: 'candidates' } }))
}));
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([
    'pool:view', 'pool:claim', 'customer:release', 'customer:transfer'
  ]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const poolRoutes = require('../routes/pool');
const customerController = require('../controllers/customerController');
const transferController = require('../controllers/transferController');

const app = express();
app.use(express.json());
app.use('/pool', poolRoutes);

const token = jwt.sign(
  { userId: 7, username: 'sales01', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('公海池路由 /api/v1/pool', () => {
  beforeEach(() => {
    customerController.listPoolNew.mockClear();
    customerController.claimPool.mockClear();
    customerController.releaseToPool.mockClear();
    transferController.create.mockClear();
    transferController.byCustomer.mockClear();
  });

  // ---------- 列表：分页与过滤参数 ----------
  it('POST /pool 列表：分页参数透传', async () => {
    const res = await request(app)
      .post('/pool')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 2, pageSize: 50, level: 'A', sort: 'create_time_desc' });

    expect(res.status).toBe(200);
    expect(res.body.data.echoed).toEqual({ page: 2, pageSize: 50, level: 'A', sort: 'create_time_desc' });
    expect(customerController.listPoolNew).toHaveBeenCalledTimes(1);
  });

  it('POST /pool 列表：level 非法值被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/pool')
      .set('Authorization', `Bearer ${token}`)
      .send({ level: 'S' });

    expect(res.status).toBe(400);
    expect(customerController.listPoolNew).not.toHaveBeenCalled();
  });

  it('POST /pool 列表：pageSize 超 200 被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/pool')
      .set('Authorization', `Bearer ${token}`)
      .send({ pageSize: 500 });

    expect(res.status).toBe(400);
  });

  it('POST /pool 列表：缺 pool:view 权限返回 403', async () => {
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValueOnce(['pool:claim']);

    const res = await request(app)
      .post('/pool')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(customerController.listPoolNew).not.toHaveBeenCalled();
  });

  it('POST /pool 列表：未登录返回 401', async () => {
    const res = await request(app).post('/pool').send({});
    expect(res.status).toBe(401);
  });

  // ---------- 认领：权限 + 幂等键 ----------
  it('POST /pool/claim 认领：id 与幂等键透传', async () => {
    const res = await request(app)
      .post('/pool/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 99, idempotency_key: 'key-abc' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 99, idempotency_key: 'key-abc' });
  });

  it('POST /pool/claim 认领：缺 pool:claim 权限返回 403', async () => {
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValueOnce(['pool:view']);

    const res = await request(app)
      .post('/pool/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 99 });

    expect(res.status).toBe(403);
    expect(customerController.claimPool).not.toHaveBeenCalled();
  });

  it('POST /pool/claim 认领：id 缺失被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/pool/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotency_key: 'k' });

    expect(res.status).toBe(400);
    expect(customerController.claimPool).not.toHaveBeenCalled();
  });

  // ---------- 释放：独立权限码 customer:release ----------
  it('POST /pool/release 释放：缺 customer:release 权限返回 403（即使持有 pool:*）', async () => {
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValueOnce(['pool:view', 'pool:claim']);

    const res = await request(app)
      .post('/pool/release')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 5, reason: '长期未跟进' });

    expect(res.status).toBe(403);
    expect(customerController.releaseToPool).not.toHaveBeenCalled();
  });

  it('POST /pool/release 释放：成功透传 reason', async () => {
    const res = await request(app)
      .post('/pool/release')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 5, reason: '长期未跟进' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 5, reason: '长期未跟进' });
  });

  // ---------- 转移：双方同意制 ----------
  it('POST /pool/transfer 发起：透传候选接收人', async () => {
    const res = await request(app)
      .post('/pool/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 3, to_user_id: 8, reason: '交接' });

    expect(res.status).toBe(200);
    expect(res.body.data.m).toBe('create');
  });

  it('POST /pool/transfer/by-customer：dataPermission fail-closed 为 self 并透传', async () => {
    const res = await request(app)
      .post('/pool/transfer/by-customer')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.dataPermission).toMatchObject({ type: 'self', userId: 7 });
  });

  it('POST /pool/transfer/candidates：空 body 通过校验', async () => {
    const res = await request(app)
      .post('/pool/transfer/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.m).toBe('candidates');
  });

  it('POST /pool/transfer/my-pending：分页参数上限 100', async () => {
    const ok = await request(app)
      .post('/pool/transfer/my-pending')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 1, pageSize: 100 });
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post('/pool/transfer/my-pending')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 1, pageSize: 200 });
    expect(bad.status).toBe(400);
  });
});
