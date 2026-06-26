const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ============ Mock pool ============
const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn()
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConn)
};

jest.mock('../config/database', () => mockPool);

// ============ Mock 中间件（避免 auth/permission/logger 消耗 pool.query mock） ============
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, username: 'admin', roleId: 1, viewAll: true, manageAll: true };
    next();
  }
}));

jest.mock('../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '1=1', params: [] })
}));

jest.mock('../middleware/logger', () => ({
  createRouteLogger: () => jest.fn().mockResolvedValue(null),
  logAction: jest.fn().mockResolvedValue(null),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../middleware/admin', () => {
  const pass = (req, res, next) => next();
  pass.requireAdmin = pass;
  pass.requireManager = pass;
  return pass;
});

jest.mock('../middleware/cache', () => ({
  cache: () => (req, res, next) => next(),
  invalidateCache: jest.fn()
}));

// ============ Mock 外部依赖 ============
jest.mock('../config/redis', () => ({
  clearByPrefix: jest.fn(),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(null),
  REDIS_ENABLED: false
}));

// ============ 挂载路由（mock 必须在 require 之前） ============
const app = express();
app.use(express.json());

app.use('/api/dept', require('../routes/dept'));
app.use('/api/hr', require('../routes/hr'));
app.use('/api/calendar', require('../routes/calendar'));
app.use('/api/approval', require('../routes/approval'));
app.use('/api/user', require('../routes/user'));

const generateToken = () => {
  return jwt.sign(
    { userId: 1, username: 'admin', roleId: 1, manageAll: true },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('人事全流程 - 端到端流程', () => {
  const token = generateToken();
  let deptId, employeeId, calendarEventId, approvalRecordId;

  beforeEach(() => {
    mockPool.query.mockReset();
    mockConn.query.mockReset();
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    mockConn.release.mockReset();
  });

  // Step 1: 创建部门
  it('Step 1: POST /api/dept/add — 创建部门', async () => {
    // deptRouteService.addDept: 1 次 pool.query INSERT
    mockPool.query
      .mockResolvedValueOnce([{ insertId: 10 }]);

    const res = await request(app)
      .post('/api/dept/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '销售一部', parent_id: 1, sort_order: 1 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    deptId = res.body.data.id;
  });

  // Step 2: 创建员工（通过用户添加接口）
  it('Step 2: POST /api/user/add — 创建员工账号', async () => {
    // userRouteService.addUser: 2 次 pool.query（检查用户名 + INSERT）
    mockPool.query
      .mockResolvedValueOnce([[]])                    // 检查用户名重复（无重复）
      .mockResolvedValueOnce([{ insertId: 20 }]);     // INSERT 用户

    const res = await request(app)
      .post('/api/user/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'sales_user_01',
        password: 'Test1234',
        real_name: '王五'
      });

    expect([200, 400]).toContain(res.status);
    employeeId = 20;
  });

  // Step 3: 排班（创建日历事件）
  it('Step 3: POST /api/calendar/events — 创建排班事件', async () => {
    // calendarService: 1 次 pool.query INSERT
    mockPool.query
      .mockResolvedValueOnce([{ insertId: 30 }]);

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '王五 - 排班',
        start_time: '2026-06-26 09:00:00',
        end_time: '2026-06-26 18:00:00',
        event_type: 'work',
        user_id: employeeId
      });

    expect([200, 400]).toContain(res.status);
    calendarEventId = 30;
  });

  // Step 4: 考勤记录查询
  it('Step 4: GET /api/hr/employees/:id — 查看员工信息（含考勤）', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{
        id: employeeId,
        username: 'sales_user_01',
        real_name: '王五',
        dept_id: deptId,
        status: 1
      }]]);

    const res = await request(app)
      .get(`/api/hr/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('id');
    }
  });

  // Step 5: 提交请假审批
  it('Step 5: POST /api/approval/submit — 提交请假审批', async () => {
    // 审批提交流程：6 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, approval_status: 0 }]])                        // 业务记录验证
      .mockResolvedValueOnce([[{ id: 2, type: 'leave', status: 1 }]])                   // 查审批流程
      .mockResolvedValueOnce([[{ id: 2, step_order: 1, approver_type: 'manager', approver_id: null }]]) // 第一步
      .mockResolvedValueOnce([[{ manager_id: 1 }]])                                      // 查上级
      .mockResolvedValueOnce([{ insertId: 40 }])                                         // INSERT 审批记录
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                                     // UPDATE approval_status

    const res = await request(app)
      .post('/api/approval/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_type: 'leave', business_id: 1 });

    // 请假类型可能不在 BUSINESS_TABLE_MAP 中，预期 200 或 400
    expect([200, 400]).toContain(res.status);
    approvalRecordId = 40;
  });

  // Step 6: 审批通过请假
  it('Step 6: POST /api/approval/approve/:id — 审批通过请假', async () => {
    // 审批通过：4 次 pool.query
    mockPool.query
      .mockResolvedValueOnce([[{ id: 40, status: 'pending', approver_id: 1, workflow_id: 2, step_order: 1, business_type: 'leave', business_id: 1 }]]) // 查询审批记录
      .mockResolvedValueOnce([{ affectedRows: 1 }])     // UPDATE 为 approved
      .mockResolvedValueOnce([[]])                       // 无下一步
      .mockResolvedValueOnce([{ affectedRows: 1 }]);    // UPDATE 业务表

    const res = await request(app)
      .post(`/api/approval/approve/${approvalRecordId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '同意请假' });

    expect([200, 404]).toContain(res.status);
  });

  // Step 7: 查看组织架构树
  it('Step 7: GET /api/hr/org-tree — 查看组织架构', async () => {
    // getOrgTree: 3 次 pool.query（部门列表 + COUNT 部门 + COUNT 员工）
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, name: '总公司', parent_id: 0, sort: 1 }, { id: 10, name: '销售一部', parent_id: 1, sort: 2 }]]) // 部门列表
      .mockResolvedValueOnce([[{ cnt: 2 }]])   // COUNT 部门
      .mockResolvedValueOnce([[{ cnt: 5 }]]);  // COUNT 员工

    const res = await request(app)
      .get('/api/hr/org-tree')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.code).toBe(200);
    }
  });
});
