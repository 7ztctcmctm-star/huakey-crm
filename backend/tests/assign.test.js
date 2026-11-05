const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockConnection = {
  release: jest.fn(),
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined)
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection)
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:assign', 'pool:claim', 'customer:release', 'pool:view']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const { appErrorHandler } = require('../middleware/errorHandler');
// [S1] 挂载统一错误处理器（与生产 app.js 一致），
// 用于断言乐观锁冲突等 AppError 的真实 HTTP 400 + code 400005 响应
const assignRoutes = require('../routes/customer/assign');
app.use('/api/v1/customers', assignRoutes);
app.use(appErrorHandler);

const generateToken = (overrides = {}) => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true, ...overrides }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('客户分配模块', () => {
  const token = generateToken();
  // [S1 分配权收敛 2026-11-03] 经理（持 customer:assign 码）与 boss（lvcongming）两种角色
  const managerToken = generateToken({ userId: 8, username: 'manager1', roleId: 2, roleCode: 'manager', manageAll: false });
  const bossToken = generateToken({ userId: 2, username: 'lvcongming', roleId: 1, roleCode: 'boss', manageAll: true });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.release.mockClear();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
  });

  describe('POST /api/v1/customers/assign', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ to_user_id: 2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });

    it('应该返回200当缺少to_user_id时执行回收', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update owner
        .mockResolvedValueOnce([{ insertId: 1 }]); // assign_log insert

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该返回200当正常分配客户', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        // [H-002] validateTargetUser：目标用户是有效在职业务角色
        .mockResolvedValueOnce([[{ id: 2 }]])
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update owner
        .mockResolvedValueOnce([{ insertId: 1 }]); // assign_log insert

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    // [H-002] 分配给非业务角色（HR/管理员）应被拒绝
    it('应该返回非200当to_user_id为非在职业务角色', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        // [H-002] validateTargetUser 查无此人 → 抛错
        .mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1, to_user_id: 999 });

      expect(res.status).not.toBe(200);
    });
  });

  describe('POST /api/v1/customers/batch-assign', () => {
    it('应该返回400当缺少customer_ids', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customers/batch-assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ to_user_id: 2 });

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常批量分配', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query
      // [H-002] validateTargetUser：to_user_id=5 是有效在职业务角色
      mockPool.query.mockResolvedValueOnce([[{ id: 5 }]]);

      // connection.query: 2 customers × (select + update + insert) = 6 calls
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, company_name: '客户A', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[{ id: 2, company_name: '客户B', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 2 }]);

      const res = await request(app)
        .post('/api/v1/customers/batch-assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_ids: [1, 2], to_user_id: 5 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/customers/assign-log', () => {
    it('应该返回分配历史', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[{ id: 1, customer_id: 1, from_user_id: 3, to_user_id: 2 }]]); // list

      const res = await request(app)
        .post('/api/v1/customers/assign-log')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/customers/assign')
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(401);
    });
  });

  // 从 pool.test.js 迁移：公海认领/释放已合并到 assign.js
  describe('POST /api/v1/customers/claim', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customers/claim')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常领取公海客户', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ id: 1, owner_id: null }]]); // 事务外快判（B2：只查核心判据）

      // P0-1：认领的 UPDATE 与 pool_log INSERT 走事务连接（原子更新 + 同事务写日志）
      // B2：SELECT ... FOR UPDATE 也移入了事务，故连接上共 3 次调用
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, pool_status: 1, pool_type: 'public', protect_until: null, owner_id: null, company_name: '测试公司' }]]) // 加锁复判
        .mockResolvedValue([{ affectedRows: 1, insertId: 1 }]); // UPDATE 认领 + INSERT pool_log

      const res = await request(app)
        .post('/api/v1/customers/claim')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      // 【产品决策 2026-09-10】保护期已下线，认领响应不再包含 protect_until
      expect(res.body.data).not.toHaveProperty('protect_until');
    });
  });

  describe('POST /api/v1/customers/release', () => {
    it('应该返回400当缺少customer_id', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // blacklist check
      mockPool.query.mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]); // role query

      const res = await request(app)
        .post('/api/v1/customers/release')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('应该返回200当正常释放客户到公海', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ id: 1, username: 'test_user', status: 1, must_change_password: 0, password_changed_at: null, fresh_role_id: 1, role_id: 1, role_code: 'super_admin', view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce(undefined); // logAction

      // 【B2】释放原本完全没有事务边界；现整段（SELECT FOR UPDATE → UPDATE → INSERT pool_log）走连接
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 1, company_name: '测试公司' }]]) // 加锁读
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockResolvedValueOnce([{ insertId: 1 }]);    // pool_log insert

      const res = await request(app)
        .post('/api/v1/customers/release')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  // ========== [S1 分配权收敛 2026-11-03] 分配写操作仅限 boss / 超管 ==========
  describe('S1 分配权收敛：经理持码仍被 403', () => {
    // 权限 mock（getUserPermissions）含 customer:assign —— 证明拦截来自 requireAdmin
    // 角色门而非权限码，与生产现状（manager 持码）一致
    const managerRoleRow = [{
      id: 8, username: 'manager1', status: 1, must_change_password: 0, password_changed_at: null,
      fresh_role_id: 2, role_id: 2, role_code: 'manager', view_all: 0, manage_all: 0
    }];

    const mockAuth = () => {
      mockPool.query.mockResolvedValueOnce([[]]);               // blacklist check
      mockPool.query.mockResolvedValueOnce([managerRoleRow]);  // fresh role
    };

    it.each([
      ['POST', '/api/v1/customers/assign', { customer_id: 1, to_user_id: 2 }],
      ['POST', '/api/v1/customers/batch-assign', { customer_ids: [1], to_user_id: 2 }],
      ['POST', '/api/v1/customers/auto-assign', {}],
      ['POST', '/api/v1/customers/assign-rules/add', { rule_name: 'r', assign_type: 'round_robin', user_ids: [3] }],
      ['POST', '/api/v1/customers/assign-rules/update', { id: 1, rule_name: 'r2' }],
      ['POST', '/api/v1/customers/assign-rules/delete', { id: 1 }]
    ])('%s %s → 403「需要管理员权限」', async (method, url, body) => {
      mockAuth();
      const res = await request(app)[method.toLowerCase()](url)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(body);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(403);
      expect(res.body.message).toBe('需要管理员权限');
    });

    it('经理读端点不受影响：GET /assign-rules → 200', async () => {
      mockAuth();
      mockPool.query.mockResolvedValueOnce([[{ id: 1, rule_name: '默认规则' }]]);
      const res = await request(app)
        .get('/api/v1/customers/assign-rules')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('S1 合法路径：boss 分配 + 审计 + 并发冲突', () => {
    const bossRoleRow = [{
      id: 2, username: 'lvcongming', status: 1, must_change_password: 0, password_changed_at: null,
      fresh_role_id: 1, role_id: 1, role_code: 'boss', view_all: 1, manage_all: 1
    }];

    const mockAuth = () => {
      mockPool.query.mockResolvedValueOnce([[]]);            // blacklist check
      mockPool.query.mockResolvedValueOnce([bossRoleRow]);   // fresh role
    };

    it('boss（lvcongming）POST /assign → 200 且写分配审计（from/to/operator）', async () => {
      mockAuth();
      mockPool.query
        .mockResolvedValueOnce([[{ id: 2 }]])  // validateTargetUser
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司', status: 'following', business_status: 'following' }]]) // customer lookup
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // 乐观锁 UPDATE 命中
        .mockResolvedValueOnce([{ insertId: 1 }]);    // assign_log INSERT

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${bossToken}`)
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      // [S1] 审计可追溯：crm_assign_log(customer_id, from_user_id, to_user_id, operator_id, remark)
      const logCall = mockPool.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO crm_assign_log'));
      expect(logCall).toBeTruthy();
      expect(logCall[1]).toEqual([1, 3, 2, 2, null]);
    });

    it('并发冲突：客户归属已被他人改过（乐观锁 0 行）→ 400 + 明确文案', async () => {
      mockAuth();
      mockPool.query
        .mockResolvedValueOnce([[{ id: 2 }]])  // validateTargetUser
        .mockResolvedValueOnce([[{ id: 1, owner_id: 3, company_name: '测试公司', status: 'following', business_status: 'following' }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // 后手 0 行

      const res = await request(app)
        .post('/api/v1/customers/assign')
        .set('Authorization', `Bearer ${bossToken}`)
        .send({ customer_id: 1, to_user_id: 2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400005);
      expect(res.body.message).toBe('客户归属已被其他人修改，请刷新后重试');
    });
  });
});

