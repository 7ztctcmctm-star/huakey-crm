/**
 * Opportunity 路由数据权限测试
 * 覆盖 MVP 阶段新加 / 修复的接口：
 * - GET /detail/:id          （数据权限校验）
 * - GET /stage-log/:id       （修复重复注册漏洞 + 数据权限校验）
 * - GET /stage-stats/:id     （新增数据权限校验）
 * - GET /timeline/:id        （数据权限校验）
 *
 * 安全背景：
 * - 旧代码 /stage-log/:id 重复注册，无权限版本覆盖带权限版本 → 已修复
 * - 旧代码 /stage-stats/:id 缺少 checkDataPermission → 已修复
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ---- Mock pool ----
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};
jest.mock('../config/database', () => mockPool);

// ---- Mock logger middleware ----
jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

// ---- Mock config/logger（service 层用） ----
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// ---- 构造 app ----
const app = express();
app.use(express.json());
const opportunityRoutes = require('../routes/opportunity');
app.use('/api/v1/opportunity', opportunityRoutes);

// 错误处理中间件（项目约束：单元测试必须挂载错误处理中间件以捕获 next(error)）
app.use((err, req, res, next) => {
  const httpStatus = err.httpStatus || 500;
  res.status(httpStatus).json({
    code: err.code || 500,
    message: err.message || '服务器内部错误',
    data: null
  });
});

// 生成 token（普通 sales 角色，manageAll=false 触发数据权限路径）
const generateSalesToken = () => jwt.sign(
  { userId: 10, username: 'sales01', roleId: 5, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

// 生成 admin token（manageAll=true，bypass 数据权限）
const generateAdminToken = () => jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('Opportunity 路由 - 数据权限测试', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/opportunity/detail/:id', () => {
    it('商机不存在时返回 404', async () => {
      const token = generateAdminToken();
      // checkDataPermission(admin) → req.dataPermission.type='all'
      // → buildDataPermissionWhere → clause='1=1'
      // → getOpportunityWithPermission 返回 null
      mockPool.query
        .mockResolvedValueOnce([[]])  // blacklist check (auth middleware)
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])     // user
        .mockResolvedValueOnce([[]]);  // detail query returns empty

      const res = await request(app)
        .get('/api/v1/opportunity/detail/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });

    it('admin 用户可获取任意商机详情', async () => {
      const token = generateAdminToken();
      const mockOpp = {
        id: 1, name: '测试商机', customer_name: '客户A', owner_name: '张三',
        stage: 3, expected_amount: 100000
      };
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[mockOpp]]);

      const res = await request(app)
        .get('/api/v1/opportunity/detail/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.name).toBe('测试商机');
    });

    it('sales 用户只能查询自己负责的商机（dataPermission=self）', async () => {
      const token = generateSalesToken();
      // sales 角色路径：
      // 1. blacklist check
      // 2. role query（无 manage_all）
      // 3. user must_change_password
      // 4. getDataPermissions → 返回空配置 → type='self'
      // 5. buildDataPermissionWhere → clause='(o.owner_id = ? OR ...)'
      // 6. getOpportunityWithPermission → 返回 null（非自己负责的）
      mockPool.query
        .mockResolvedValueOnce([[]])                                       // blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])        // role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])           // user
        .mockResolvedValueOnce([[]])                                       // data_permissions query（无配置）
        .mockResolvedValueOnce([[]]);                                      // detail query（owner_id 不匹配，返回空）

      const res = await request(app)
        .get('/api/v1/opportunity/detail/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });
  });

  describe('GET /api/v1/opportunity/stage-log/:id - 修复重复注册漏洞', () => {
    it('应通过 stageLogWithPermission 路径（含数据权限校验）', async () => {
      const token = generateAdminToken();
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[{ id: 1, stage: 3 }]])                  // getOpportunityWithPermission
        .mockResolvedValueOnce([[{                                         // getStageLog
          id: 1, from_stage: 1, to_stage: 3,
          change_reason: '客户确认需求', changed_at: '2026-08-04 10:00:00',
          create_time: '2026-08-04 10:00:00', changed_by_name: '张三',
          hours_in_stage: 48
        }]]);

      const res = await request(app)
        .get('/api/v1/opportunity/stage-log/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      // 验证返回数据含 from_stage_name / to_stage_name（stageLogWithPermission 特有逻辑）
      expect(res.body.data[0].from_stage_name).toBe('询盘');
      expect(res.body.data[0].to_stage_name).toBe('方案报价');
      expect(res.body.data[0].change_reason).toBe('客户确认需求');
    });

    it('商机不存在时返回 404（不应绕过权限检查）', async () => {
      const token = generateAdminToken();
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[]]);  // getOpportunityWithPermission 返回空

      const res = await request(app)
        .get('/api/v1/opportunity/stage-log/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });
  });

  describe('GET /api/v1/opportunity/stage-stats/:id - 修复缺失数据权限', () => {
    it('admin 可获取阶段统计', async () => {
      const token = generateAdminToken();
      // getStageStats 内部 GROUP BY to_stage，返回多行
      const mockStatsRows = [
        { stage: 1, hours: 24 },
        { stage: 3, hours: 72 }
      ];
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[{ id: 1, stage: 3 }]])  // getOpportunityWithPermission
        .mockResolvedValueOnce([mockStatsRows]);           // getStageStats

      const res = await request(app)
        .get('/api/v1/opportunity/stage-stats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      // getStageStats 返回 { stages: [...], total_hours: number }
      expect(res.body.data).toHaveProperty('stages');
      expect(res.body.data).toHaveProperty('total_hours');
      expect(res.body.data.stages).toHaveLength(2);
    });

    it('商机不存在时返回 404（不再绕过权限）', async () => {
      const token = generateAdminToken();
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[]]);  // getOpportunityWithPermission 返回空

      const res = await request(app)
        .get('/api/v1/opportunity/stage-stats/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });
  });

  describe('GET /api/v1/opportunity/timeline/:id', () => {
    it('admin 可获取时间轴', async () => {
      const token = generateAdminToken();
      // getTimeline 内部 4 个 query：
      // 1. SELECT crm_opportunity (校验存在)
      // 2. SELECT stage_logs
      // 3. SELECT quotes
      // 4. SELECT contracts
      mockPool.query
        .mockResolvedValueOnce([[]])                                       // blacklist
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])        // role
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])           // user
        .mockResolvedValueOnce([[{ id: 1, stage: 3 }]])                   // getOpportunityWithPermission (controller 权限校验)
        .mockResolvedValueOnce([[{ id: 1 }]])                              // getTimeline 内部 SELECT opportunity
        .mockResolvedValueOnce([[{                                         // stage_logs
          type: 'stage_change', id: 1, from_stage: 1, to_stage: 3,
          event_time: '2026-08-04 10:00:00', user_name: '张三'
        }]])
        .mockResolvedValueOnce([[]])                                       // quotes (空)
        .mockResolvedValueOnce([[]]);                                      // contracts (空)

      const res = await request(app)
        .get('/api/v1/opportunity/timeline/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('stage_change');
      expect(res.body.data[0]).toHaveProperty('stage_name');
    });

    it('商机不存在时返回 404', async () => {
      const token = generateAdminToken();
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[]]);  // getOpportunityWithPermission 返回空

      const res = await request(app)
        .get('/api/v1/opportunity/timeline/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });
  });
});
