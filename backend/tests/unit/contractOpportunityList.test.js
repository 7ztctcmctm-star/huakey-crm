/**
 * 合同创建页「可关联商机」列表：customer_id 过滤回归
 * 旧实现忽略前端传入的 customer_id（控制器不读取、服务不拼接），
 * 切换客户后下拉仍混入其他客户的商机。
 */
const contractCrudService = require('../../services/contractCrudService');

function makePool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [[]];
    }
  };
}

describe('contractCrudService.getOpportunityList customer_id 过滤', () => {
  it('未传 customerId 时不追加条件，数据权限参数原样保留', async () => {
    const pool = makePool();
    await contractCrudService.getOpportunityList(pool, { clause: 'o.owner_id = ?', params: [7] });
    expect(pool.calls[0].sql).not.toContain('o.customer_id = ?');
    expect(pool.calls[0].params).toEqual([7]);
  });

  it('传 customerId 时追加 customer_id 条件且参数顺序为 [权限, customerId]', async () => {
    const pool = makePool();
    await contractCrudService.getOpportunityList(pool, { clause: 'o.owner_id = ?', params: [7] }, 42);
    expect(pool.calls[0].sql).toContain('o.customer_id = ?');
    expect(pool.calls[0].params).toEqual([7, 42]);
  });

  it('customerId 为 null 时不追加条件', async () => {
    const pool = makePool();
    await contractCrudService.getOpportunityList(pool, null, null);
    expect(pool.calls[0].sql).not.toContain('o.customer_id = ?');
    expect(pool.calls[0].params).toEqual([]);
  });
});
