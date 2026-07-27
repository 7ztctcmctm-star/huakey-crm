/**
 * softDelete 工具单元测试
 */
const mockPool = { query: jest.fn() };

jest.mock('../../config/database', () => mockPool);

const {
  softDelete,
  softDeleteBatch,
  restore,
  permanentDelete,
  getDeletedList
} = require('../../utils/softDelete');

describe('softDelete', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  it('非法表名应抛错', async () => {
    await expect(softDelete('bad_table', 1)).rejects.toThrow('Invalid table');
  });

  it('softDelete 应返回影响行数', async () => {
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await softDelete('crm_customer', 5);
    expect(result).toBe(true);
    expect(mockPool.query.mock.calls[0][0]).toContain('SET deleted_at = NOW()');
    expect(mockPool.query.mock.calls[0][1]).toEqual([5]);
  });

  it('softDeleteBatch 空数组应返回 0', async () => {
    const result = await softDeleteBatch('crm_customer', []);
    expect(result).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('softDeleteBatch 应拼接占位符', async () => {
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 2 }]);
    const result = await softDeleteBatch('crm_customer', [1, 2, 3]);
    expect(result).toBe(2);
    expect(mockPool.query.mock.calls[0][0]).toContain('id IN (?,?,?)');
    expect(mockPool.query.mock.calls[0][1]).toEqual([1, 2, 3]);
  });

  it('restore 应清除 deleted_at', async () => {
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await restore('crm_customer', 5);
    expect(result).toBe(true);
    expect(mockPool.query.mock.calls[0][0]).toContain('SET deleted_at = NULL');
  });

  it('permanentDelete 应物理删除', async () => {
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await permanentDelete('crm_customer', 5);
    expect(result).toBe(true);
    expect(mockPool.query.mock.calls[0][0]).toContain('DELETE FROM crm_customer');
  });

  it('getDeletedList 应支持 keyword 分页', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1, name: 'A' }]]);

    const result = await getDeletedList('crm_customer', {
      page: 2,
      pageSize: 5,
      keyword: 'A',
      nameColumn: 'name'
    });
    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    expect(mockPool.query.mock.calls[1][0]).toContain('LIMIT ? OFFSET ?');
    expect(mockPool.query.mock.calls[1][1]).toEqual(['%A%', 5, 5]);
  });
});
