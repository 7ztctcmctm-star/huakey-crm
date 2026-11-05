/**
 * [P1-28] 客户等级 A/B/C/D 前后端枚举一致性（真实路由 + 真实 Joi）
 *
 * 事实依据：
 *   · `crm_customer.level` 列注释为「A/B/C/D」（000_real_baseline.sql:451）；
 *   · 迁移 016 数据质量规则值为 ["A","B","C","D"]；
 *   · 前端客户列表 / 详情 / 潜客池 / 公海池均提供 D 级选项。
 * 因此 D 是合法等级，后端各路由的 A/B/C 白名单才是漂移源。
 *
 * 本测试逐一挂真实 router + 真实 validate，确认所有客户等级入口都接受 D、
 * 仍拒绝未知值 Z，并锁定共享常量的取值。
 */

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

jest.mock('../../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  checkFieldPermission: () => (req, res, next) => next(),
  buildDataPermissionWhere: async () => ({ clause: '1=1', params: [] })
}));

jest.mock('../../middleware/admin', () => ({
  requireAdmin: (req, res, next) => next(),
  requireManager: (req, res, next) => next()
}));

jest.mock('../../controllers/customerController', () => new Proxy({}, {
  get: () => (req, res) => res.json({ code: 200, received: req.body })
}));

jest.mock('../../controllers/transferController', () => new Proxy({}, {
  get: () => (req, res) => res.json({ code: 200, received: req.body })
}));

const express = require('express');
const request = require('supertest');
const customersRouter = require('../../routes/customers');
const poolRouter = require('../../routes/pool');
const { CUSTOMER_LEVEL_CODES } = require('../../constants/customerLevel');

const app = express();
app.use(express.json());
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/pool', poolRouter);

describe('[P1-28] 客户等级枚举', () => {
  it('共享常量与数据库/数据质量规则一致：A/B/C/D', () => {
    expect(CUSTOMER_LEVEL_CODES).toEqual(['A', 'B', 'C', 'D']);
  });

  it.each([
    ['正式客户列表', '/api/v1/customers', { level: 'D' }],
    ['全量客户列表', '/api/v1/customers/list', { level: 'D' }],
    ['新增客户', '/api/v1/customers/add', { company_name: 'D级客户', level: 'D', contacts: [{ name: '张三' }] }],
    ['编辑客户', '/api/v1/customers/update', { id: 1, level: 'D' }],
    ['导出客户', '/api/v1/customers/export', { level: 'D' }],
    ['公海列表', '/api/v1/pool', { level: 'D' }]
  ])('%s 接受 D 级', async (_name, url, body) => {
    const res = await request(app).post(url).send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toHaveProperty('level', 'D');
  });

  it.each([
    ['新增客户', '/api/v1/customers/add', { company_name: 'Z级客户', level: 'Z', contacts: [{ name: '张三' }] }],
    ['客户列表', '/api/v1/customers', { level: 'Z' }],
    ['公海列表', '/api/v1/pool', { level: 'Z' }]
  ])('%s 仍拒绝未知等级 Z', async (_name, url, body) => {
    const res = await request(app).post(url).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
