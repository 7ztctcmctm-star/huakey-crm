/**
 * Opportunity Center v1 — 集成业务链 E2E 测试
 *
 * 验证 CRM 核心流程:
 *   Customer Center → Opportunity Center → Quote Center → Contract Center
 *
 * 测试范围:
 *   Case 1: 完整业务流程 (创建客户→商机→推进→报价，验证数据一致性)
 *   Case 2: 数据权限隔离 (销售A的数据销售B不可见)
 *   Case 3: 商机详情页 (基础信息+阶段日志+时间轴)
 *
 * 约束:
 *   - 不修改 Customer Center / 已冻结 API / 已有代码
 *   - 使用 mock pool 模式 (与项目现有测试框架一致)
 *   - 零外部依赖，纯单元化集成测试
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_e2e_opportunity_flow';
process.env.NODE_ENV = 'test';

// ============================================================================
// Mock Pool — 模拟数据库连接池
// ============================================================================
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  })
};

jest.mock('../../config/database', () => mockPool);

// Mock logger (避免 console 噪音)
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock roles config
jest.mock('../../config/roles', () => ({
  ADMIN_ROLE_CODES: new Set(['super_admin'])
}));

// Mock pagination
jest.mock('../../utils/pagination', () => ({
  paginatedQuery: jest.fn().mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 10 })
}));

// Mock fieldLog
jest.mock('../../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

// Mock logger middleware
jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

// ============================================================================
// App Construction — 挂载核心业务链路由
// ============================================================================
const app = express();
app.use(express.json());

// 加载路由
const opportunityRoutes = require('../../routes/opportunity');
const quoteRoutes = require('../../routes/quote');
const contractCrudRoutes = require('../../routes/contract/crud');

app.use('/api/v1/opportunity', opportunityRoutes);
app.use('/api/v1/quote', quoteRoutes);
app.use('/api/v1/contract', contractCrudRoutes);

// 错误处理中间件
app.use((err, req, res, _next) => {
  const httpStatus = err.httpStatus || err.statusCode || 500;
  res.status(httpStatus).json({
    code: err.code || 500,
    message: err.message || '服务器内部错误',
    data: null
  });
});

// ============================================================================
// Token Helpers
// ============================================================================
const generateSuperAdminToken = () => jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true, viewAll: true },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const generateSalesToken = (userId = 10, username = 'sales01') => jwt.sign(
  { userId, username, roleId: 5, roleCode: 'sales', manageAll: false, viewAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

// ============================================================================
// Mock Helpers — 构造标准 mock query 序列
// ============================================================================

/**
 * mockAuthChain: 模拟 authenticateToken 中间件的 3 次查询
 *  1. token 黑名单检查 → []
 *  2. 查 sys_role → [{ view_all, manage_all }]
 *  3. 查 sys_user must_change_password → [{ must_change_password: 0 }]
 */
// ============================================================================
// Test Data Factories
// ============================================================================
const TEST_OPPORTUNITY = {
  id: 200,
  opportunity_no: 'OPP-260804-001',
  customer_id: 100,
  name: '集成测试商机',
  expected_amount: 500000,
  expected_date: '2026-12-31',
  stage: 1,
  win_rate: 10,
  remark: '测试备注',
  owner_id: 10,
  customer_name: '集成测试客户',
  owner_name: '销售张三',
  create_time: '2026-08-04T10:00:00',
  update_time: '2026-08-04T10:00:00'
};
const TEST_STAGE_LOGS = [
  { id: 1, from_stage: 1, to_stage: 2, change_reason: '需求明确', changed_at: '2026-08-04T11:00:00', create_time: '2026-08-04T11:00:00', changed_by_name: '销售张三', hours_in_stage: 24 }
];

// ============================================================================
// Tests
// ============================================================================

describe('Opportunity Center v1 — 业务链集成测试', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  // ==========================================================================
  // Case 1: 完整业务流程
  // ==========================================================================
  describe('Case 1: 完整业务流程 (创建商机 → 推进阶段 → 创建报价)', () => {
    const adminToken = generateSuperAdminToken();

    it('1.1 创建商机：应验证 customer_id 并生成 opportunity_no', async () => {
      // 构造 mock 序列:
      // auth ×3 (super_admin 绕过 checkPermission，中间件不查 DB)
      // → controller: SELECT customer + generateOpportunityNo COUNT + INSERT
      mockPool.query
        .mockResolvedValueOnce([[]])                                  // 1: blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])   // 2: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])       // 3: user
        // super_admin → ADMIN_ROLE_CODES.has → bypass checkPermission (无 DB 查询)
        .mockResolvedValueOnce([[{ id: 100, status: 'following' }]])  // 4: SELECT customer
        .mockResolvedValueOnce([[{ cnt: 0 }]])                        // 5: generateOpportunityNo COUNT
        .mockResolvedValueOnce([{ insertId: 200 }]);                  // 6: INSERT opportunity

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: 100,
          name: '集成测试商机',
          expected_amount: 500000,
          stage: 1,
          win_rate: 10
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id', 200);
      expect(res.body.data).toHaveProperty('opportunity_no');
      expect(res.body.data.opportunity_no).toMatch(/^OPP-\d{6}-001$/);

      // 验证: 不包含 UPDATE crm_customer
      const allSqls = mockPool.query.mock.calls.map(c => c[0]);
      const updateCustomerCall = allSqls.find(sql => /UPDATE\s+crm_customer/i.test(sql));
      expect(updateCustomerCall).toBeUndefined();
    });

    it('1.2 推进商机阶段：应写入 stage_log 含 change_reason', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])                                                 // 1: blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])                 // 2: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])                     // 3: user
        // super_admin → bypass checkPermission (无 DB 查询)
        // checkDataPermission → buildDataPermissionWhere
        // controller: getOpportunityWithPermission
        .mockResolvedValueOnce([[{ id: 200, name: '集成测试商机', stage: 1, owner_id: 1 }]])  // 4: verify ownership
        // advanceStage SELECT
        .mockResolvedValueOnce([[{ id: 200, stage: 1 }]])                           // 5: SELECT opportunity
        // advanceStage UPDATE
        .mockResolvedValueOnce([{ affectedRows: 1 }])                                // 6: UPDATE stage=2, win_rate=25
        // advanceStage INSERT stage_log
        .mockResolvedValueOnce([{ insertId: 1 }]);                                   // 7: INSERT stage_log

      const res = await request(app)
        .post('/api/v1/opportunity/update-stage')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: 200, stage: 2, change_reason: '需求已确认，进入需求确认阶段' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.message).toContain('推进至');

      // 验证 stage_log INSERT 包含 change_reason
      const insertLogCall = mockPool.query.mock.calls.find(
        c => /INSERT\s+INTO\s+crm_opportunity_stage_log/i.test(c[0])
      );
      expect(insertLogCall).toBeDefined();
      expect(insertLogCall[1]).toContain('需求已确认，进入需求确认阶段');
    });

    it('1.3 创建报价（关联商机）：应校验 opportunity_id 和 customer_id 一致性', async () => {
      const conn = await mockPool.getConnection();
      conn.query
        .mockResolvedValueOnce([[{ id: 100 }]])                          // SELECT customer
        .mockResolvedValueOnce([[{ id: 200, customer_id: 100 }]])        // SELECT opportunity (校验存在+一致)
        .mockResolvedValueOnce([[{ id: 1, name: '产品A', code: 'P001', price: 100 }]])  // SELECT product
        .mockResolvedValueOnce([[{ cnt: 0 }]])                            // generateQuoteNo COUNT
        .mockResolvedValueOnce([{ insertId: 300 }])                       // INSERT quote
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                    // INSERT quote_item

      // pool.query for auth + notification (notification 在 try/catch 中，不阻塞)
      mockPool.query
        .mockResolvedValueOnce([[]])                                     // 1: blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])      // 2: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])          // 3: user
        // super_admin → bypass checkPermission
        .mockResolvedValueOnce([[{ company_name: '集成测试客户' }]])      // 4: notification SELECT customer_name
        .mockResolvedValueOnce([[{ real_name: '管理员' }]])              // 5: notification SELECT user
        .mockResolvedValueOnce([{ affectedRows: 0 }]);                   // 6: notification INSERT

      const res = await request(app)
        .post('/api/v1/quote/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: 100,
          opportunity_id: 200,
          items: [{ product_id: 1, quantity: 5, unit_price: 1000 }],
          discount: 0,
          valid_days: 30
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);

      // 验证: 所有 SQL 不含 UPDATE crm_customer
      const connSqls = conn.query.mock.calls.map(c => c[0]);
      const poolSqls = mockPool.query.mock.calls.map(c => c[0]);
      const allSqls = [...connSqls, ...poolSqls];
      const updateCustomerSqls = allSqls.filter(sql => /UPDATE\s+crm_customer/i.test(sql));
      expect(updateCustomerSqls).toHaveLength(0);
    });

    it('1.4 报价关联商机 customer_id 不一致时应拒绝', async () => {
      const conn = await mockPool.getConnection();
      conn.query
        .mockResolvedValueOnce([[{ id: 999 }]])                          // SELECT customer (exists)
        .mockResolvedValueOnce([[{ id: 200, customer_id: 100 }]]);       // SELECT opportunity (belongs to customer 100, not 999)

      mockPool.query
        .mockResolvedValueOnce([[]])                                     // 1: blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])      // 2: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]);         // 3: user
      // super_admin → bypass checkPermission, enter controller
      // → createQuote with opportunity_id=200, customer_id=999
      // → opportunity belongs to customer 100 → 校验失败

      const res = await request(app)
        .post('/api/v1/quote/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: 999,
          opportunity_id: 200,
          items: [{ product_id: 1, quantity: 1, unit_price: 100 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('不匹配');
    });
  });

  // ==========================================================================
  // Case 2: 数据权限隔离
  // ==========================================================================
  describe('Case 2: 数据权限隔离 (sales A vs sales B)', () => {
    const salesAToken = generateSalesToken(10, 'sales_a');
    const salesBToken = generateSalesToken(20, 'sales_b');

    it('2.1 销售A可以查看自己负责的商机', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])                                   // auth: blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])    // auth: role (no manage_all)
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])       // auth: user
        // checkDataPermission: getDataPermissions → type='self'
        // → clause = '(o.owner_id = ? OR ...)' with userId=10
        .mockResolvedValueOnce([[]])                                   // data_permission query
        // getOpportunityWithPermission via detail controller
        .mockResolvedValueOnce([[TEST_OPPORTUNITY]]);                  // detail query (owner_id=10 matches)

      const res = await request(app)
        .get('/api/v1/opportunity/detail/200')
        .set('Authorization', `Bearer ${salesAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.name).toBe('集成测试商机');
    });

    it('2.2 销售B不能查看销售A的商机 (dataScope=self)', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])                                   // auth: blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])    // auth: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])       // auth: user
        .mockResolvedValueOnce([[]])                                   // data_permission → type='self'
        .mockResolvedValueOnce([[]]);                                   // detail query → empty (owner_id=10 ≠ 20)

      const res = await request(app)
        .get('/api/v1/opportunity/detail/200')
        .set('Authorization', `Bearer ${salesBToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });

    it('2.3 销售B不能推进销售A的商机阶段', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])                                   // auth: blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])    // auth: role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])       // auth: user
        .mockResolvedValueOnce([[{ code: 'opportunity:edit' }]])      // checkPermission (has)
        .mockResolvedValueOnce([[]])                                   // data_permission → type='self'
        .mockResolvedValueOnce([[]]);                                   // getOpportunityWithPermission → empty

      const res = await request(app)
        .post('/api/v1/opportunity/update-stage')
        .set('Authorization', `Bearer ${salesBToken}`)
        .send({ id: 200, stage: 2 });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // Case 3: 商机详情页
  // ==========================================================================
  describe('Case 3: 商机详情页数据完整性', () => {
    const adminToken = generateSuperAdminToken();

    it('3.1 详情接口应返回完整基本信息', async () => {
      const mockDetail = {
        ...TEST_OPPORTUNITY,
        lost_reason: null,
        source_id: null,
        source_name: null
      };
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[mockDetail]]);  // getOpportunityWithPermission

      const res = await request(app)
        .get('/api/v1/opportunity/detail/200')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: 200,
        name: '集成测试商机',
        customer_name: '集成测试客户',
        owner_name: '销售张三',
        stage: 1,
        win_rate: 10,
        expected_amount: 500000
      });
    });

    it('3.2 阶段日志接口应返回 from_stage_name / to_stage_name', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[{ id: 200, stage: 2, owner_id: 1 }]])  // getOpportunityWithPermission
        .mockResolvedValueOnce([TEST_STAGE_LOGS]);                       // getStageLog

      const res = await request(app)
        .get('/api/v1/opportunity/stage-log/200')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data[0]).toHaveProperty('from_stage_name');
      expect(res.body.data[0]).toHaveProperty('to_stage_name');
      expect(res.body.data[0].from_stage_name).toBe('询盘');
      expect(res.body.data[0].to_stage_name).toBe('需求确认');
    });

    it('3.3 时间轴接口应聚合 stage_log + quote + contract', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        // getOpportunityWithPermission (controller)
        .mockResolvedValueOnce([[{ id: 200, stage: 2, owner_id: 1 }]])
        // getTimeline: SELECT opportunity
        .mockResolvedValueOnce([[{ id: 200 }]])
        // getTimeline: SELECT stage_logs
        .mockResolvedValueOnce([[
          { type: 'stage_change', id: 1, from_stage: 1, to_stage: 2,
            event_time: '2026-08-04T11:00:00', user_name: '销售张三' }
        ]])
        // getTimeline: SELECT quotes
        .mockResolvedValueOnce([[
          { type: 'quote', id: 300, quote_no: 'QUO-260804-001',
            amount: 500000, final_amount: 500000, status: 1,
            event_time: '2026-08-04T12:00:00', user_name: '销售张三' }
        ]])
        // getTimeline: SELECT contracts
        .mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/v1/opportunity/timeline/200')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2); // 1 stage_change + 1 quote

      // 事件按时间倒序排列
      const stageEvent = res.body.data.find(e => e.type === 'stage_change');
      const quoteEvent = res.body.data.find(e => e.type === 'quote');

      expect(stageEvent).toBeDefined();
      expect(stageEvent).toHaveProperty('stage_name', '需求确认');
      expect(quoteEvent).toBeDefined();
      expect(quoteEvent).toHaveProperty('quote_no', 'QUO-260804-001');
    });

    it('3.4 商机不存在时详情应返回 404', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[]]);  // getOpportunityWithPermission returns empty

      const res = await request(app)
        .get('/api/v1/opportunity/detail/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // 边界场景: 阶段推进约束
  // ==========================================================================
  describe('边界场景: 阶段推进约束', () => {
    const adminToken = generateSuperAdminToken();

    it('已成交商机 (stage=5) 不可再推进', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[{ code: 'opportunity:edit' }]])
        .mockResolvedValueOnce([[{ id: 200, name: '已成交商机', stage: 5, owner_id: 1 }]])
        .mockResolvedValueOnce([[{ id: 200, stage: 5 }]]);  // advanceStage: 已成交

      const res = await request(app)
        .post('/api/v1/opportunity/update-stage')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: 200, stage: 4 }); // 尝试回退（也不允许）

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('成交');
    });
  });

  // ==========================================================================
  // 领域边界: 禁止跨模块写
  // ==========================================================================
  describe('领域边界: 禁止跨模块更新', () => {
    it('opportunityService 模块导出不应包含 UPDATE crm_customer 的 SQL', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/opportunityService.js'),
        'utf-8'
      );
      // 排除注释行后再检查
      const codeLines = source.split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'));
      const code = codeLines.join('\n');
      expect(code).not.toMatch(/UPDATE\s+crm_customer/i);
    });

    it('quoteService 模块导出不应包含 UPDATE crm_customer 的 SQL', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/quoteService.js'),
        'utf-8'
      );
      const codeLines = source.split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'));
      const code = codeLines.join('\n');
      expect(code).not.toMatch(/UPDATE\s+crm_customer/i);
    });
  });
});
