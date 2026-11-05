/**
 * customerDetailService 单元测试
 * 聚焦：updateCustomer 中 status 变更时 business_status 同步
 */

const { CUSTOMER_STATUS } = require('../../constants/customerStatus');
const { BUSINESS_STATUS } = require('../../constants/poolStatus');

jest.mock('../../services/customerService', () => {
  const actual = jest.requireActual('../../services/customerService');
  return {
    canTransition: jest.fn().mockResolvedValue({ valid: true, rule: null }),
    mapStatusToBusinessStatus: actual.mapStatusToBusinessStatus
  };
});
jest.mock('../../services/assignService', () => ({ autoAssignOwner: jest.fn() }));
jest.mock('../../config/redis', () => ({ clearByPrefix: jest.fn() }));

const { autoAssignOwner } = require('../../services/assignService');

const customerDetailService = require('../../services/customerDetailService');

function createMockPool() {
  return { query: jest.fn() };
}

const mockUser = { userId: 1, username: 'admin', roleCode: 'super_admin', manageAll: true };

describe('customerDetailService.addCustomer（P0-12）', () => {
  function makeAddPool() {
    const conn = {
      query: jest.fn().mockResolvedValue([{ insertId: 42 }]),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    const pool = {
      query: jest.fn().mockResolvedValue([[]]), // 重复检测
      getConnection: jest.fn().mockResolvedValue(conn)
    };
    return { pool, conn };
  }

  const insertParams = (conn) => {
    const call = conn.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO crm_customer'));
    return call[1];
  };

  it('自动分配负责人时：status=following 且 business_status=following（不能落在线索池）', async () => {
    autoAssignOwner.mockResolvedValue(9);
    const { pool, conn } = makeAddPool();

    await customerDetailService.addCustomer(pool, { company_name: 'A公司', contacts: [{ name: '张三' }] }, 1);

    const p = insertParams(conn);
    expect(p[5]).toBe(9);                 // owner_id
    expect(p[6]).toBe(CUSTOMER_STATUS.FOLLOWING);
    expect(p[7]).toBe(BUSINESS_STATUS.FOLLOWING);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('未自动分配时：status=lead 且 business_status=lead（进入线索池）', async () => {
    autoAssignOwner.mockResolvedValue(null);
    const { pool, conn } = makeAddPool();

    await customerDetailService.addCustomer(pool, { company_name: 'B公司', contacts: [{ name: '李四' }] }, 1);

    const p = insertParams(conn);
    expect(p[5]).toBeNull();
    expect(p[6]).toBe(CUSTOMER_STATUS.LEAD);
    expect(p[7]).toBe(BUSINESS_STATUS.LEAD);
  });
});

describe('customerDetailService.updateCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('修改普通字段时不应触碰 business_status', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ id: 1, owner_id: 1, company_name: 'A', status: CUSTOMER_STATUS.FOLLOWING }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await customerDetailService.updateCustomer(pool, 1, { company_name: 'B' }, mockUser);

    const updateSql = pool.query.mock.calls[1][0];
    expect(updateSql).not.toContain('business_status');
  });

  it('修改 status 时应同步 business_status', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ id: 1, owner_id: 1, company_name: 'A', status: CUSTOMER_STATUS.FOLLOWING }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await customerDetailService.updateCustomer(pool, 1, { status: CUSTOMER_STATUS.QUOTED }, mockUser);

    const updateSql = pool.query.mock.calls[1][0];
    const updateParams = pool.query.mock.calls[1][1];
    expect(updateSql).toContain('status = ?');
    expect(updateSql).toContain('business_status = ?');
    expect(updateParams).toContain(CUSTOMER_STATUS.QUOTED);
    expect(updateParams).toContain(BUSINESS_STATUS.QUOTED);
  });

  it('status=sea 时 business_status 应映射为 following', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ id: 1, owner_id: 1, company_name: 'A', status: CUSTOMER_STATUS.FOLLOWING }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await customerDetailService.updateCustomer(pool, 1, { status: CUSTOMER_STATUS.SEA }, mockUser);

    const updateParams = pool.query.mock.calls[1][1];
    expect(updateParams).toContain(CUSTOMER_STATUS.SEA);
    expect(updateParams).toContain(BUSINESS_STATUS.FOLLOWING);
  });
});
