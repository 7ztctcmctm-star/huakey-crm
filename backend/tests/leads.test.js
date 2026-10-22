process.env.JWT_SECRET = 'test_secret_key_for_leads_tests';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// authenticateToken 会查库刷新 manage_all/role_code/status，按 SQL+roleId 分流模拟
const mockPool = {
  query: jest.fn(async (sql, params) => {
    if (sql.includes('sys_token_blacklist')) return [[]];
    if (sql.includes('FROM sys_role')) {
      const isAdmin = params && params[0] === 1;
      return [[{ view_all: 1, manage_all: isAdmin ? 1 : 0, role_code: isAdmin ? 'boss' : 'sales' }]];
    }
    if (sql.includes('FROM sys_user')) return [[{ must_change_password: 0, status: 1 }]];
    return [[]];
  })
};
jest.mock('../config/database', () => mockPool);
jest.mock('../controllers/customerController', () => ({
  listLeadPool: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { echoed: req.body, dataPermission: req.dataPermission } })),
  convertLeadToFormal: jest.fn((req, res) => res.json({ code: 200, message: 'ok', data: { id: req.body.id, userId: req.user.userId } }))
}));
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['leads:view', 'leads:convert']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const leadsRoutes = require('../routes/leads');
const customerController = require('../controllers/customerController');

const app = express();
app.use(express.json());

const token = jwt.sign(
  { userId: 7, username: 'sales01', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

function buildApp(user) {
  const a = express();
  a.use(express.json());
  a.use('/leads', (req, res, next) => { req.user = user; next(); }, leadsRoutes);
  return a;
}

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('线索路由 /api/v1/leads', () => {
  beforeEach(() => {
    customerController.listLeadPool.mockClear();
    customerController.convertLeadToFormal.mockClear();
  });

  it('POST /leads 列表：鉴权通过后转发 controller 并透传 dataPermission', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 1, pageSize: 20, company_name: '华科' });

    expect(res.status).toBe(200);
    expect(res.body.data.echoed).toEqual({ page: 1, pageSize: 20, company_name: '华科' });
    // sales 无数据权限配置 → fail-closed 为 self（MEMORY：中间层注入，不过滤）
    expect(res.body.data.dataPermission).toMatchObject({ type: 'self', userId: 7, ownerColumn: 'owner_id', module: 'customer' });
    expect(customerController.listLeadPool).toHaveBeenCalledTimes(1);
  });

  it('POST /leads 列表：manageAll 用户 dataPermission 为 all', async () => {
    // authenticateToken 会用 token payload 覆盖前置注入的 req.user，故 token 与用户必须一致
    const adminUser = { userId: 1, username: 'admin', roleId: 1, roleCode: 'admin', manageAll: true };
    const res = await request(buildApp(adminUser))
      .post('/leads')
      .set('Authorization', `Bearer ${tokenFor(adminUser)}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.dataPermission.type).toBe('all');
  });

  it('POST /leads 列表：缺 leads:view 权限返回 403', async () => {
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValueOnce(['leads:convert']);

    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('没有操作权限');
    expect(customerController.listLeadPool).not.toHaveBeenCalled();
  });

  it('POST /leads 列表：未登录返回 401', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads')
      .send({});

    expect(res.status).toBe(401);
  });

  it('POST /leads 列表：lead_level 非法值被 Joi 拒绝（400）', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ lead_level: '超高' });

    expect(res.status).toBe(400);
    expect(customerController.listLeadPool).not.toHaveBeenCalled();
  });

  it('POST /leads/convert 转化：转发 id 与 userId', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads/convert')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 42 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 42, userId: 7 });
  });

  it('POST /leads/convert 转化：缺 leads:convert 权限返回 403', async () => {
    const { getUserPermissions } = require('../services/permissionService');
    getUserPermissions.mockResolvedValueOnce(['leads:view']);

    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads/convert')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 42 });

    expect(res.status).toBe(403);
    expect(customerController.convertLeadToFormal).not.toHaveBeenCalled();
  });

  it('POST /leads/convert 转化：id 缺失被 Joi 拒绝（400）', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads/convert')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(customerController.convertLeadToFormal).not.toHaveBeenCalled();
  });

  it('POST /leads/convert 转化：id=0 非正整数被拒绝', async () => {
    const res = await request(buildApp({ userId: 7, roleId: 3, roleCode: 'sales', manageAll: false }))
      .post('/leads/convert')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 0 });

    expect(res.status).toBe(400);
  });
});
