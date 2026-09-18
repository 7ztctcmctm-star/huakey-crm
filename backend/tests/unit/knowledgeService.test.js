/**
 * knowledgeService 单元测试（R-16 销售资料库：上传/分类/检索）
 * 通过 mock pool 验证检索/分类/软删除逻辑，无需真实数据库。
 */

const ks = require('../../services/knowledgeService');

function createMockPool() {
  return { query: jest.fn().mockResolvedValue([[]]) };
}

describe('knowledgeService - 检索与分类', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('listProducts: keyword 命中 name/model/description 三者', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1, name: 'X' }]]);

    const { list, total } = await ks.listProducts(pool, { keyword: 'X', page: 1, pageSize: 10 });
    expect(total).toBe(1);
    expect(list).toHaveLength(1);
    const countSql = pool.query.mock.calls[0][0];
    const selectSql = pool.query.mock.calls[1][0];
    expect(countSql).toMatch(/crm_knowledge_product/);
    expect(selectSql).toMatch(/name LIKE \? OR p\.model LIKE \? OR p\.description LIKE \?/);
    // keyword 在三处位置都拼成 %X%
    const params = pool.query.mock.calls[0][1];
    expect(params.filter(p => p === '%X%').length).toBe(3);
  });

  it('listProducts: 传入 category 时追加等值过滤', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await ks.listProducts(pool, { category: '硬件', page: 1, pageSize: 10 });
    const params = pool.query.mock.calls[0][1];
    expect(params).toContain('硬件');
    expect(pool.query.mock.calls[0][0]).toMatch(/p\.category = \?/);
  });

  it('listDocuments: type 过滤 + 软删除排除', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce([[{ total: 2 }]]).mockResolvedValueOnce([[{ id: 1 }], { id: 2 }]);
    const { total } = await ks.listDocuments(pool, { type: 'contract', page: 1, pageSize: 10 });
    expect(total).toBe(2);
    expect(pool.query.mock.calls[0][0]).toMatch(/d\.type = \?/);
    expect(pool.query.mock.calls[0][0]).toMatch(/d\.deleted_at IS NULL/);
  });

  it('getProductCategories: 返回去重非空分类', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce([[{ category: '硬件' }, { category: '软件' }]]);
    const cats = await ks.getProductCategories(pool);
    expect(cats).toEqual(['硬件', '软件']);
  });
});

describe('knowledgeService - 写入与软删除', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('createProduct: 写入 create_by 并返回 insertId', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce([{ insertId: 42 }]);
    const res = await ks.createProduct(pool, { name: ' 产品A ', category: '硬件' }, 7);
    expect(res).toEqual({ id: 42 });
    // name 被 trim
    expect(pool.query.mock.calls[0][1][0]).toBe('产品A');
    // 最后一列是 create_by
    expect(pool.query.mock.calls[0][1].slice(-1)[0]).toBe(7);
  });

  it('deleteProduct: 软删除（置 deleted_at）而非物理删除', async () => {
    const pool = createMockPool();
    await ks.deleteProduct(pool, 5);
    expect(pool.query.mock.calls[0][0]).toMatch(/UPDATE crm_knowledge_product SET deleted_at = NOW\(\)/);
    expect(pool.query.mock.calls[0][1]).toEqual([5]);
  });

  it('updateProduct: 仅更新传入字段', async () => {
    const pool = createMockPool();
    await ks.updateProduct(pool, 9, { price: 100 });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/price = \?/);
    expect(sql).not.toMatch(/name = \?/);
    expect(pool.query.mock.calls[0][1]).toEqual([100, 9]);
  });
});
