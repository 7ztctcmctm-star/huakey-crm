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

const customerDetailService = require('../../services/customerDetailService');

function createMockPool() {
  return { query: jest.fn() };
}

const mockUser = { userId: 1, username: 'admin', roleCode: 'super_admin', manageAll: true };

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
