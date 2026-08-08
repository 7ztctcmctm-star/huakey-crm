/**
 * Sales Analytics 权限集成测试 (Phase 5.5.4)
 * 验证 admin/manager/sales 三角色数据权限
 */
const ROLES = require('../../config/roles');

const mockPool = { query: jest.fn() };
const service = require('../../services/salesAnalyticsService');

// 收集每次查询的 SQL + params
let queries = [];
beforeEach(() => {
  queries = [];
  mockPool.query.mockReset();
  mockPool.query.mockImplementation(async (sql, params) => {
    queries.push({ sql, params });
    // 返回单行 0 数据
    if (sql.includes('FROM crm_opportunity') && sql.includes('GROUP BY')) return [[]];
    if (sql.includes('SUM')) return [[{ amount: '100.00' }]];
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    return [[]];
  });
});

const admin = { userId: 1, roleCode: ROLES.ROLE_CODES.SUPER_ADMIN, manageAll: true };
const manager = { userId: 2, roleCode: ROLES.ROLE_CODES.ADMIN, manageAll: false };
const sales = { userId: 10, roleCode: ROLES.ROLE_CODES.SALES, manageAll: false };

describe('Sales Analytics 数据权限', () => {
  it('1. admin: overview 无 owner 过滤 (全部数据)', async () => {
    await service.getOverview(mockPool, admin);
    // 所有查询不应含 owner_id 过滤
    const oppQ = queries.find(q => q.sql.includes('FROM crm_opportunity'));
    expect(oppQ.sql).not.toContain('owner_id');
    expect(oppQ.sql).not.toContain('create_by');
  });

  it('2. manager: 包含部门+子部门过滤 (RECURSIVE)', async () => {
    await service.getOverview(mockPool, manager);
    const oppQ = queries.find(q => q.sql.includes('FROM crm_opportunity'));
    // 应含部门递归子查询
    expect(oppQ.sql).toContain('dept_id IN');
    expect(oppQ.sql).toContain('RECURSIVE');
    // 参数含 userId
    expect(oppQ.params).toContain(2);
  });

  it('3. sales: 只能看自己 owner_id', async () => {
    await service.getOverview(mockPool, sales);
    const oppQ = queries.find(q => q.sql.includes('FROM crm_opportunity'));
    expect(oppQ.sql).toContain('owner_id = ?');
    expect(oppQ.params).toContain(10);
  });

  it('4. sales: funnel 也应用 owner_id 过滤', async () => {
    await service.getSalesFunnel(mockPool, sales);
    const q = queries.find(q => q.sql.includes('GROUP BY'));
    expect(q.sql).toContain('owner_id = ?');
    expect(q.params).toContain(10);
  });

  it('5. sales: contract revenue 用 create_by 过滤', async () => {
    await service.getContractRevenue(mockPool, sales);
    const q = queries.find(q => q.sql.includes('FROM crm_contract'));
    expect(q.sql).toContain('create_by = ?');
    expect(q.params).toContain(10);
  });
});
