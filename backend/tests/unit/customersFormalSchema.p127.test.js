/**
 * [P1-27] POST /customers 参数 allowlist 契约（真实路由 + 真实 validate）
 *
 * validate.js 使用 stripUnknown=true：前端 Form 里的字段若未在 formalSchema 声明，
 * 会在进入 service 前被静默删除，表现为“筛选器能点但没效果”。
 * 本测试直接挂真实 router 与真实校验中间件，逐字段确认：
 *   status / business_status / lifecycle_status / overdue / overdue_follow / tag_id
 * 都能到达控制器，未知字段仍被剥离，非法值 400。
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

// 子路由（assign/import/detailExtras）在模块加载时会解构控制器方法，
// 用 Proxy 统一返回 echo，避免为每个方法逐一打桩。
jest.mock('../../controllers/customerController', () => new Proxy({}, {
  get: () => (req, res) => res.json({ code: 200, received: req.body })
}));

const express = require('express');
const request = require('supertest');
const router = require('../../routes/customers');

const app = express();
app.use(express.json());
app.use('/api/v1/customers', router);

const send = (body) => request(app).post('/api/v1/customers').send(body);
const sendList = (body) => request(app).post('/api/v1/customers/list').send(body);

describe('[P1-27] POST /customers 筛选字段 allowlist', () => {
  it.each([
    ['status', 'paused'],
    ['business_status', 'lost'],
    ['lifecycle_status', 'active'],
    ['overdue', true],
    ['overdue_follow', true],
    ['tag_id', 9]
  ])('%s 必须穿过 stripUnknown 到达控制器', async (field, value) => {
    const res = await send({ [field]: value });

    expect(res.status).toBe(200);
    expect(res.body.received).toHaveProperty(field, value);
  });

  it('前端正式页当前下发的筛选字段可同时到达', async () => {
    const res = await send({
      page: 1,
      pageSize: 20,
      company_name: '铧旗',
      contact_name: '张三',
      phone: '13800000000',
      source: '网络',
      level: 'A',
      status: 'paused',
      business_status: 'lost',
      lifecycle_status: 'active',
      owner_id: 7,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      overdue: true,
      overdue_follow: true,
      tag_id: 3,
      sort: 'create_time_desc'
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toMatchObject({
      page: 1,
      pageSize: 20,
      company_name: '铧旗',
      contact_name: '张三',
      phone: '13800000000',
      source: '网络',
      level: 'A',
      status: 'paused',
      business_status: 'lost',
      lifecycle_status: 'active',
      owner_id: 7,
      overdue: true,
      overdue_follow: true,
      tag_id: 3,
      sort: 'create_time_desc'
    });
    // Joi isoDate 在 convert=true 下把日期归一化为 ISO 字符串；
    // service 负责取日期部分（见 customerFormalFilters 单测）。
    expect(res.body.received.start_date).toMatch(/^2026-01-01/);
    expect(res.body.received.end_date).toMatch(/^2026-12-31/);
  });

  it('非法状态 / 非法标签 id 返回 400，而不是静默忽略', async () => {
    const badStatus = await send({ status: 'not-a-status' });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.code).toBe(400);

    const badTag = await send({ tag_id: 0 });
    expect(badTag.status).toBe(400);
    expect(badTag.body.code).toBe(400);
  });

  it('未知字段仍被剥离（接口不能变成任意字段入口）', async () => {
    const res = await send({ hacked: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.received.hacked).toBeUndefined();
  });
});

describe('[V1.1 §11.3] POST /customers/list 筛选字段 allowlist', () => {
  it.each([
    ['keyword', '华科'],
    ['customer_type', 'enterprise'],
    ['lifecycle_status', 'active'],
    ['overdue_follow', true],
    ['tag_id', 3]
  ])('%s 必须穿过 stripUnknown 到达控制器', async (field, value) => {
    const res = await sendList({ [field]: value });

    expect(res.status).toBe(200);
    expect(res.body.received).toHaveProperty(field, value);
  });

  it('未知字段仍被剥离', async () => {
    const res = await sendList({ hacked: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.received.hacked).toBeUndefined();
  });
});
