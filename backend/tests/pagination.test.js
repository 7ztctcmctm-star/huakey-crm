const { paginatedQuery } = require('../utils/pagination');

describe('pagination 工具', () => {
  it('应该正确执行计数和分页查询', async () => {
    const mockPool = {
      query: jest.fn()
    };

    mockPool.query
      .mockResolvedValueOnce([[{ total: 25 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    const result = await paginatedQuery(mockPool, {
      baseQuery: 'SELECT * FROM crm_product WHERE deleted_at IS NULL',
      countQuery: 'SELECT COUNT(*) as total FROM crm_product WHERE deleted_at IS NULL',
      params: [],
      page: 2,
      pageSize: 10,
      orderBy: 'create_time DESC'
    });

    expect(result).toEqual({
      list: [{ id: 1 }, { id: 2 }],
      total: 25,
      page: 2,
      pageSize: 10
    });

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query.mock.calls[0]).toEqual([
      'SELECT COUNT(*) as total FROM crm_product WHERE deleted_at IS NULL',
      []
    ]);
    expect(mockPool.query.mock.calls[1][0]).toBe(
      'SELECT * FROM crm_product WHERE deleted_at IS NULL ORDER BY create_time DESC LIMIT ? OFFSET ?'
    );
    expect(mockPool.query.mock.calls[1][1]).toEqual([10, 10]);
  });

  it('page 小于 1 时应该按 1 处理', async () => {
    const mockPool = {
      query: jest.fn()
    };

    mockPool.query
      .mockResolvedValueOnce([[{ total: 5 }]])
      .mockResolvedValueOnce([[]]);

    const result = await paginatedQuery(mockPool, {
      baseQuery: 'SELECT * FROM crm_product WHERE deleted_at IS NULL',
      countQuery: 'SELECT COUNT(*) as total FROM crm_product WHERE deleted_at IS NULL',
      page: 0,
      pageSize: 10
    });

    expect(result.page).toBe(1);
    expect(mockPool.query.mock.calls[1][1]).toEqual([10, 0]);
  });

  it('缺少 baseQuery 或 countQuery 时应该抛出错误', async () => {
    await expect(paginatedQuery({}, { baseQuery: 'SELECT 1' }))
      .rejects.toThrow('paginatedQuery requires baseQuery and countQuery');
  });
});
