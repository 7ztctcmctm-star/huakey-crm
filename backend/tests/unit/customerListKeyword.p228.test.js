/**
 * [V1.1 §11.3 / 2026-10-26] getCustomerList 的 keyword 真正落到 SQL
 *
 * 背景：客户选择器与邮箱收件人搜索下发 keyword，但旧 schema 丢弃、
 * listCustomers 也不读 ⇒ 搜索框返回全量客户。本测试锁定三字段模糊匹配。
 */

const customerService = require('../../services/customerService');

describe('[V1.1 §11.3] listCustomers keyword', () => {
  it('公司名/联系人/电话任一命中', async () => {
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
    };

    await customerService.listCustomers(pool, { keyword: '华科' }, null);
    const [countSql, countParams] = pool.query.mock.calls[0];

    expect(countSql).toContain('c.company_name LIKE ?');
    expect(countSql).toContain('pc.name LIKE ?');
    expect(countSql).toContain('pc.phone LIKE ?');
    expect(countParams).toEqual(['%华科%', '%华科%', '%华科%']);
  });
});
