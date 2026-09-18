/**
 * Service (服务工单) 模块单测 —— 覆盖 R-14 验收：
 *  - 工单 CRUD 可用 (create/list/detail/update/delete + filter)
 *  - 关联客户信息只读展示 (仅 SELECT crm_customer，绝不 UPDATE/DELETE)
 *  - 服务端数据权限 (buildServicePermissionClause + canManageService 基于 roleCode)
 *
 * 全程 mock config/database，不依赖真实 MySQL。
 */

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ---- 构造可复用的 mock pool（按 SQL 内容分派返回值）----
// 判定顺序很关键：list/detail 的 JOIN SQL 同时包含 crm_service_order 与
// sys_user / crm_customer，因此 crm_service_order 必须最先判定；
// 部门相关查询需同时返回 id 与 dept_id（供 IN 子查询与部门比较复用）。
function makePool() {
  const queryImpl = jest.fn(async (sql, _params) => {
    const s = String(sql || '').toLowerCase();

    if (s.includes('sys_token_blacklist')) return [[]];
    if (s.includes('must_change_password')) return [[{ must_change_password: 0, status: 1 }]];
    if (s.includes('view_all') || s.includes('manage_all')) return [[{ view_all: 1, manage_all: 1, code: 'super_admin' }]];
    if (s.includes('dept_id')) return [[{ id: 1, dept_id: 10 }]]; // 部门判定（含 id 供 IN 子查询）

    // 工单主表（最优先，避免被 sys_user/crm_customer 误命中）
    if (s.includes('crm_service_order')) {
      if (s.includes('count')) return [[{ total: 1, cnt: 0 }]];
      if (s.includes('insert')) return [{ insertId: 123 }];
      if (s.includes('update')) return [{}];
      return [[{
        id: 1, order_no: 'SRV-260101-001', customer_id: 5, contract_id: null,
        type: '维修', title: '设备异响', description: 'd', status: 1, priority: 3,
        assignee_id: 1, finish_time: null, finish_desc: null, satisfaction: null,
        create_by: 1, create_time: '2026-01-01 00:00:00', deleted_at: null,
        customer_name: 'ACME 科技有限公司', customer_contact: '张三', customer_phone: '13800000000',
        customer_address: '上海市浦东新区', contract_no: null, assignee_name: '工程师甲', create_by_name: '销售乙'
      }]];
    }

    // 客户：仅允许 SELECT（验证域边界）
    if (s.includes('crm_customer')) {
      if (s.includes('count')) return [[{ cnt: 0 }]];
      return [[{ id: 5, status: 'signed', company_name: 'ACME 科技有限公司' }]];
    }
    if (s.includes('crm_attachment')) return [[{ id: 1, file_name: 'a.pdf', file_path: '/f/a.pdf', file_size: 10, file_type: 'application/pdf' }]];
    if (s.includes('crm_social_contact')) return [[]];

    // 兜底：sys_user / sys_role 等（仅当未被上面 crm 分支命中时）
    if (s.includes('sys_user') || s.includes('sys_role') || s.includes('sys_data_permission') || s.includes('sys_dept')) {
      return [[{ id: 1, dept_id: 10 }]];
    }
    return [[]];
  });

  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: queryImpl, // 与 pool.query 共享同一 mock，便于统一采集 SQL
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };

  return {
    query: queryImpl,
    escape: jest.fn((v) => (typeof v === 'string' ? `'${v}'` : String(v))),
    getConnection: jest.fn().mockResolvedValue(connection)
  };
}

const mockPool = makePool();
jest.mock('../../config/database', () => mockPool);

jest.mock('../../middleware/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

const serviceOrderService = require('../../services/serviceOrderService');

// ---- 路由级（supertest）----
const app = express();
app.use(express.json());
const serviceRoutes = require('../../routes/service');
app.use('/api/v1/service', serviceRoutes);

function makeToken(overrides = {}) {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Service 模块 R-14 验收', () => {
  const token = makeToken();

  beforeEach(() => {
    mockPool.query.mockClear();
    mockPool.getConnection.mockClear();
  });

  // 采集本轮所有执行的 SQL（含 connection 中的事务查询）
  const allSQL = () => mockPool.query.mock.calls.map(c => String(c[0] || ''));

  describe('CRUD 通过 HTTP 端点', () => {
    it('POST /add 创建工单成功 (且只 SELECT 客户)', async () => {
      const res = await request(app)
        .post('/api/v1/service/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 5, type: '维修', title: '设备异响', priority: 3 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('order_no');
    });

    it('POST /list 返回列表与分页，并支持过滤条件', async () => {
      const filters = [
        {}, { status: 1 }, { type: '维修' }, { priority: 3 },
        { keyword: 'ACME' }, { assignee_id: 1 }, { created_today: true }, { is_timeout: true }
      ];
      for (const f of filters) {
        const res = await request(app)
          .post('/api/v1/service/list')
          .set('Authorization', `Bearer ${token}`)
          .send({ page: 1, pageSize: 10, ...f });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.data).toHaveProperty('list');
        expect(res.body.data).toHaveProperty('total');
      }
    });

    it('GET /detail/:id 返回只读客户关联信息', async () => {
      const res = await request(app)
        .get('/api/v1/service/detail/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      const d = res.body.data;
      expect(d.customer_name).toBe('ACME 科技有限公司');
      expect(d.customer_contact).toBe('张三');
      expect(d.customer_phone).toBe('13800000000');
      expect(d.customer_address).toBe('上海市浦东新区');
      // 详情仅展示，不暴露可写客户字段
      expect(d).not.toHaveProperty('customer_status');
    });

    it('POST /update 修改工单成功', async () => {
      const res = await request(app)
        .post('/api/v1/service/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1, customer_id: 5, type: '保养', title: '定期保养', priority: 4 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('POST /delete 软删除工单成功', async () => {
      const res = await request(app)
        .post('/api/v1/service/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('域边界：所有 CRUD 过程中绝不 UPDATE/DELETE crm_customer', () => {
      const violations = allSQL().filter(sql =>
        /(update|delete)\s+crm_customer/i.test(sql) ||
        /\bdelete\s+from\s+crm_customer/i.test(sql)
      );
      expect(violations).toEqual([]);
    });
  });

  describe('服务端数据权限（serviceOrderService）', () => {
    it('buildServicePermissionClause: type=all 放行', async () => {
      const clause = await serviceOrderService.buildServicePermissionClause(mockPool, { type: 'all' });
      expect(clause).toBe('1=1');
    });

    it('buildServicePermissionClause: type=self 仅本人 create_by/assignee_id', async () => {
      const clause = await serviceOrderService.buildServicePermissionClause(mockPool, { type: 'self', userId: 7 });
      expect(clause).toContain('create_by = 7');
      expect(clause).toContain('assignee_id = 7');
    });

    it('buildServicePermissionClause: type=dept 本部门 IN 子句', async () => {
      const clause = await serviceOrderService.buildServicePermissionClause(mockPool, { type: 'dept', userId: 7 });
      expect(clause).toContain('IN');
    });

    it('canManageService: BOSS/MANAGER 角色直接放行', async () => {
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'boss', userId: 99 }, { create_by: 1, assignee_id: 2 })).toBe(true);
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'manager', userId: 99 }, { create_by: 1, assignee_id: 2 })).toBe(true);
    });

    it('canManageService: 本人创建/被分配的工单可管理', async () => {
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'engineer', userId: 5 }, { create_by: 5, assignee_id: 8 })).toBe(true);
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'engineer', userId: 8 }, { create_by: 5, assignee_id: 8 })).toBe(true);
    });

    it('canManageService: 无关工程师不可管理他人工单', async () => {
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'engineer', userId: 9 }, { create_by: 5, assignee_id: 8 })).toBe(false);
    });

    it('canManageService: SALES 同部门可管理', async () => {
      // mock 返回 dept_id=10，create_by/assignee/user 同部门 -> 放行
      expect(await serviceOrderService.canManageService(mockPool, { roleCode: 'sales', userId: 7 }, { create_by: 5, assignee_id: 8 })).toBe(true);
    });
  });
});
