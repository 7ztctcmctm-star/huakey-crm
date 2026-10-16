/**
 * 工单数据权限（P0-2）专项测试
 *
 * 背景：serviceOrderService 原 buildServicePermissionClause 是自造实现，
 *  dept/dept_and_sub 分支把 `?` 塞进 SQL 却无人回填参数、且不递归子部门。
 *  现统一改用 utils/dataScope.scopeFor（内部即标准 buildDataPermissionWhere）。
 *
 * 覆盖：
 *   1. dept      → 只命中本部门（IN 子查询按 dept_id 等值），参数正确回填
 *   2. dept_and_sub → **递归**子部门（dept 10 → 子 11），参数按列数翻倍
 *   3. 无配置角色 fail-closed 为 self（只看到与自己相关的工单）
 *   4. 参数数组与占位符一一对应（不再错位绑定 status/type/LIMIT）
 *   5. count 查询不受权限子句中的 `FROM sys_user` 影响（原正则贪婪替换会截坏）
 *
 * 全程 mock config/database 与 permissionService，不依赖真实 MySQL。
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_service_datascope';
process.env.NODE_ENV = 'test';

const USER_ID = 7;
const DEPT_ID = 10;
const SUB_DEPT_ID = 11;

const mockPool = { query: jest.fn(), getConnection: jest.fn() };

jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../utils/sseManager', () => ({ send: jest.fn() }));
jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

const mockGetUserPermissions = jest.fn();
const mockGetDataPermissions = jest.fn();
jest.mock('../../services/permissionService', () => ({
  getUserPermissions: (...args) => mockGetUserPermissions(...args),
  getDataPermissions: (...args) => mockGetDataPermissions(...args)
}));

const app = express();
app.use(express.json());
const serviceRoutes = require('../../routes/service');
app.use('/api/v1/service', serviceRoutes);
app.use((err, _req, res, _next) => {
  const httpStatus = err.httpStatus || err.statusCode || 500;
  res.status(httpStatus).json({ code: err.code || 500, message: err.message || '服务器内部错误', data: null });
});

const serviceOrderService = require('../../services/serviceOrderService');

// 当前登录用户的角色行（authenticateToken 每次请求都会查 sys_role，
// manage_all 以**库里**的值为准，不是 token 里的值）
let roleRow = { view_all: 0, manage_all: 0, role_code: 'engineer' };

/**
 * 按 SQL 内容分派的 mock。
 * 判定顺序关键：工单主表必须**先于**部门相关判定 —— 因为权限子句里
 * 带 `FROM sys_user`，会被拼进工单列表 SQL，若顺序反了会导致列表查询
 * 被误判为部门查询而返回错误形状。
 */
function installPool() {
  mockPool.query.mockImplementation(async (sql, params) => {
    const s = String(sql || '').toLowerCase();

    if (s.includes('sys_token_blacklist')) return [[]];

    if (s.includes('crm_service_order')) {
      if (s.includes('count(*)')) return [[{ total: 0 }]];
      return [[]];
    }

    // 递归子部门：10 → 子 11；11 无子部门（终止，防止 mock 恒定返回导致死循环）
    // 注意：必须返回 [rows] 形状，return [] 会让解构出 undefined 而炸「not iterable」
    if (s.includes('from sys_dept')) {
      const parent = Array.isArray(params) ? params[0] : undefined;
      return parent === DEPT_ID ? [[{ id: SUB_DEPT_ID }]] : [[]];
    }
    if (s.includes('dept_id from sys_user')) return [[{ dept_id: DEPT_ID }]];

    if (s.includes('view_all') || s.includes('manage_all')) return [[roleRow]];
    if (s.includes('must_change_password')) return [[{ must_change_password: 0, status: 1 }]];

    return [[]];
  });
}

const makeToken = (overrides = {}) => jwt.sign({
  userId: USER_ID,
  username: 'engineer1',
  roleId: 3,
  roleCode: 'engineer',
  viewAll: false,
  manageAll: false,
  ...overrides
}, process.env.JWT_SECRET, { expiresIn: '1h' });

const callsWith = (needle) =>
  mockPool.query.mock.calls.filter((c) => String(c[0] || '').includes(needle));

const listCall = () =>
  mockPool.query.mock.calls.find(
    (c) => String(c[0] || '').includes('crm_service_order')
      && !String(c[0] || '').toLowerCase().includes('count(*)')
  );

const countCall = () =>
  mockPool.query.mock.calls.find((c) => String(c[0] || '').toLowerCase().includes('count(*)'));

describe('工单数据权限 —— 标准实现（P0-2）', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
    mockGetUserPermissions.mockResolvedValue(['service']);
    mockGetDataPermissions.mockResolvedValue([]);
    roleRow = { view_all: 0, manage_all: 0, role_code: 'engineer' };
    installPool();
  });

  // ---------------------------------------------------------------------------
  it('dept：只命中本部门（IN 子查询按 dept_id 等值），且参数正确回填', async () => {
    mockGetDataPermissions.mockResolvedValue([{ module: 'service', data_scope: 'dept' }]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);

    const sql = String(listCall()[0]);
    // 本部门：dept_id = (SELECT dept_id FROM sys_user WHERE id = ?)
    expect(sql).toContain('so.create_by IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))');
    expect(sql).toContain('so.assignee_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))');
    // 不是 dept_and_sub：不应出现 dept_id IN (?, ?) 这种多部门展开
    expect(sql).not.toContain('dept_id IN (');

    const params = listCall()[1];
    expect(params.slice(0, 2)).toEqual([USER_ID, USER_ID]);   // 权限参数在最前
    expect(params.slice(-2)).toEqual([0, 10]);                // LIMIT 在最后
  });

  // ---------------------------------------------------------------------------
  it('dept_and_sub：递归子部门（dept 10 → 子 11）', async () => {
    mockGetDataPermissions.mockResolvedValue([{ module: 'service', data_scope: 'dept_and_sub' }]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);

    // 递归证据：sys_dept 被按 10（本部门）和 11（子部门）各查过一次
    const deptQueries = callsWith('sys_dept').map((c) => (Array.isArray(c[1]) ? c[1][0] : undefined));
    expect(deptQueries).toContain(DEPT_ID);
    expect(deptQueries).toContain(SUB_DEPT_ID);

    const sql = String(listCall()[0]);
    expect(sql).toContain('dept_id IN (?,?)');                // 本部门 + 子部门（占位符由 map.join(',') 生成，无空格）
    // 双列 OR：create_by 与 assignee_id 各一组参数
    expect(listCall()[1].slice(0, 4)).toEqual([DEPT_ID, SUB_DEPT_ID, DEPT_ID, SUB_DEPT_ID]);
  });

  // ---------------------------------------------------------------------------
  it('无配置角色 fail-closed 为 self（只看到与自己相关的工单）', async () => {
    // sys_data_permission 中完全没有 service 域配置
    mockGetDataPermissions.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);

    const sql = String(listCall()[0]);
    expect(sql).toContain('so.create_by = ?');
    expect(sql).toContain('so.assignee_id = ?');
    expect(sql).not.toContain('IN (SELECT id FROM sys_user');
    expect(listCall()[1].slice(0, 2)).toEqual([USER_ID, USER_ID]);
  });

  it('配置的 module 不匹配时同样 fail-closed（service 域配置缺失）', async () => {
    mockGetDataPermissions.mockResolvedValue([{ module: 'customer', data_scope: 'all' }]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);
    // customer 域的 all 不得外溢到 service 域
    expect(String(listCall()[0])).toContain('so.create_by = ?');
  });

  // ---------------------------------------------------------------------------
  it('参数与占位符一一对应：过滤条件跟在权限参数之后，不再错位', async () => {
    mockGetDataPermissions.mockResolvedValue([{ module: 'service', data_scope: 'self' }]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 2, pageSize: 20, status: 1, type: '维修' });

    expect(res.status).toBe(200);

    const [, params] = listCall();
    // [create_by, assignee_id, status, type, offset, pageSize]
    expect(params).toEqual([USER_ID, USER_ID, 1, '维修', 20, 20]);

    const sql = String(listCall()[0]);
    const placeholders = (sql.match(/\?/g) || []).length;
    expect(placeholders).toBe(params.length);   // 占位符数 === 参数数
  });

  // ---------------------------------------------------------------------------
  it('count 查询不被权限子句里的 FROM sys_user 截坏', async () => {
    mockGetDataPermissions.mockResolvedValue([{ module: 'service', data_scope: 'dept' }]);

    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);

    const sql = String(countCall()[0]);
    expect(sql.trim().toUpperCase().startsWith('SELECT COUNT(*) AS TOTAL')).toBe(true);
    expect(sql).toContain('FROM crm_service_order so');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
    // count 不带 LIMIT 参数，但必须带权限参数
    expect(countCall()[1]).toEqual([USER_ID, USER_ID]);
  });

  // ---------------------------------------------------------------------------
  it('manageAll（boss/超管）注入 type=all，列表不做行级收窄', async () => {
    // manage_all 以库里 sys_role 为准
    roleRow = { view_all: 1, manage_all: 1, role_code: 'boss' };
    const res = await request(app)
      .post('/api/v1/service/list')
      .set('Authorization', `Bearer ${makeToken({ roleCode: 'boss', manageAll: true })}`)
      .send({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);
    const sql = String(listCall()[0]);
    expect(sql).toContain('WHERE 1=1 AND so.deleted_at IS NULL');
    expect(listCall()[1]).toEqual([0, 10]);   // 只剩 LIMIT 参数
  });

  // ---------------------------------------------------------------------------
  describe('batch-assign 逐条行级鉴权', () => {
    it('无权限的 id 被剔除，只分配有权操作的工单', async () => {
      // 工单 1 属于本人（放行），工单 2 属于他人（剔除）
      mockPool.query.mockImplementation(async (sql, _params) => {
        const s = String(sql || '').toLowerCase();
        if (s.includes('sys_token_blacklist')) return [[]];
        if (s.includes('crm_service_order')) {
          if (s.includes('count(*)')) return [[{ total: 0 }]];
          if (s.includes('where id = ?')) {
            const id = Array.isArray(_params) ? _params[0] : undefined;
            return id === 1
              ? [[{ id: 1, create_by: USER_ID, assignee_id: null }]]
              : [[{ id: 2, create_by: 999, assignee_id: 888 }]];
          }
          if (s.includes('insert')) return [{ insertId: 1 }];
          return [[]];
        }
        if (s.includes('dept_id from sys_user')) return [[{ dept_id: DEPT_ID }]];
        if (s.includes('view_all') || s.includes('manage_all')) return [[{ view_all: 0, manage_all: 0, role_code: 'engineer' }]];
        if (s.includes('must_change_password')) return [[{ must_change_password: 0, status: 1 }]];
        return [[]];
      });
      mockGetUserPermissions.mockResolvedValue(['service', 'service:edit']);
      mockGetDataPermissions.mockResolvedValue([{ module: 'service', data_scope: 'self' }]);

      const res = await request(app)
        .post('/api/v1/service/batch-assign')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ ids: [1, 2], assignee_id: 42 });

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(1);

      // UPDATE 语句只带上被放行的 id
      const updateCall = mockPool.query.mock.calls.find(
        (c) => String(c[0] || '').toLowerCase().includes('update crm_service_order')
      );
      expect(updateCall[1]).toEqual([42, 1]);
    });

    it('全部无权时拒绝，不静默放行', async () => {
      mockPool.query.mockImplementation(async (sql, _params) => {
        const s = String(sql || '').toLowerCase();
        if (s.includes('sys_token_blacklist')) return [[]];
        if (s.includes('crm_service_order')) {
          if (s.includes('count(*)')) return [[{ total: 0 }]];
          if (s.includes('where id = ?')) return [[{ id: 2, create_by: 999, assignee_id: 888 }]];
          return [[]];
        }
        if (s.includes('dept_id from sys_user')) return [[{ dept_id: DEPT_ID }]];
        if (s.includes('view_all') || s.includes('manage_all')) return [[{ view_all: 0, manage_all: 0, role_code: 'engineer' }]];
        if (s.includes('must_change_password')) return [[{ must_change_password: 0, status: 1 }]];
        return [[]];
      });
      mockGetUserPermissions.mockResolvedValue(['service', 'service:edit']);

      const res = await request(app)
        .post('/api/v1/service/batch-assign')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ ids: [2, 3], assignee_id: 42 });

      expect(res.status).toBe(403);
      // 拒绝时不得产生任何 UPDATE
      expect(mockPool.query.mock.calls.some(
        (c) => String(c[0] || '').toLowerCase().includes('update crm_service_order')
      )).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  it('服务层 buildServiceScope 直接契约：参数化且无字符串拼接用户ID', async () => {
    const scope = await serviceOrderService.buildServiceScope(
      { type: 'self', userId: 7, module: 'service', ownerColumn: 'create_by' }, 'so'
    );
    expect(scope.clause).toBe('(so.create_by = ? OR so.assignee_id = ?)');
    expect(scope.params).toEqual([7, 7]);
    // 不得把用户 ID 拼进 SQL 字面量
    expect(scope.clause).not.toContain('7');
  });
});
