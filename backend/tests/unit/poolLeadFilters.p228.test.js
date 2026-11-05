/**
 * [V1.1 §11.3 / 2026-10-26] 公海池与潜客池筛选契约（service 层）
 *
 * 背景：前端公海页下发 contact_name / phone / business_status，潜客页下发
 * level=A/B/C/D，但旧 Joi schema 未声明（stripUnknown 丢弃）、service 也未落到
 * SQL ⇒ 用户点搜索无任何效果。本测试锁定：
 *   · 公海：联系人/电话走主联系人表，业务状态按权威 status 过滤；
 *   · 潜客：level 走 crm_customer.level，legacy lead_level 仍兼容；
 *   · 计数 SQL 与列表 SQL 使用同一 JOIN，避免 count 报 Unknown column。
 */

const customerService = require('../../services/customerService');

function makePool() {
  return {
    query: jest.fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
  };
}

async function run(fn, params) {
  const pool = makePool();
  await fn(pool, params, null);
  const [countSql, countParams] = pool.query.mock.calls[0];
  const [listSql, listParams] = pool.query.mock.calls[1];
  return { countSql, countParams, listSql, listParams };
}

describe('[V1.1 §11.3] listPoolCustomersNew 筛选落库', () => {
  it('contact_name / phone 走主联系人，business_status 按 status 过滤', async () => {
    const { countSql, countParams, listSql, listParams } = await run(
      customerService.listPoolCustomersNew,
      { contact_name: '张三', phone: '1380000', business_status: 'quoted' }
    );

    expect(countSql).toContain('pc.name LIKE ?');
    expect(countSql).toContain('pc.phone LIKE ?');
    expect(countSql).toContain('c.status = ?');
    expect(countParams).toEqual(
      expect.arrayContaining(['%张三%', '%1380000%', 'quoted'])
    );
    // 计数与列表必须带同一个主联系人 JOIN，否则 count 查询会引用不存在的 pc
    expect(countSql).toContain('LEFT JOIN crm_contact pc');
    expect(listSql).toContain('LEFT JOIN crm_contact pc');
    expect(listParams.slice(0, countParams.length)).toEqual(countParams);
  });
});

describe('[V1.1 §11.3] listLeads 等级筛选落库', () => {
  it('level=A/B/C/D 走 crm_customer.level', async () => {
    const { countSql, countParams } = await run(
      customerService.listLeads,
      { level: 'D' }
    );

    expect(countSql).toContain('c.level = ?');
    expect(countParams).toContain('D');
  });

  it('legacy lead_level 仍可用（兼容旧调用方）', async () => {
    const { countSql, countParams } = await run(
      customerService.listLeads,
      { lead_level: '高' }
    );

    expect(countSql).toContain('c.lead_level = ?');
    expect(countParams).toContain('高');
  });

  it('level 与 lead_level 同时存在时两者都生效（交集）', async () => {
    const { countSql, countParams } = await run(
      customerService.listLeads,
      { level: 'A', lead_level: '中' }
    );

    expect((countSql.match(/c\.level = \?/g) || []).length).toBe(1);
    expect((countSql.match(/c\.lead_level = \?/g) || []).length).toBe(1);
    expect(countParams).toEqual(expect.arrayContaining(['A', '中']));
  });
});
