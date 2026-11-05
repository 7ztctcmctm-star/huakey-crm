/**
 * P1-08：自定义报表执行接口 IDOR 收口。
 *
 * 审计结论：listReports 按 (create_by = ? OR is_public = 1) 过滤，但 runReport 加载配置后
 * 不做任何归属校验 —— 知道 id 即可执行他人的私有报表，绕过列表可见性。
 * 修复：runReport 追加与列表一致的口径（本人 / 公开 / manageAll），否则 403。
 */

const customReportService = require('../../services/customReportService');

function poolWith(config) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce([[config]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
  };
}

const BASE = {
  data_source: 'customer',
  columns_config: JSON.stringify([{ field: 'company_name' }]),
  filter_config: '[]',
  create_by: 5
};

describe('customReportService.runReport 归属校验（P1-08）', () => {
  it('他人私有报表 → 403，且不执行任何查询 SQL', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce([[{ ...BASE, is_public: 0 }]]) };
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 }, { userId: 7 });
    expect(r).toMatchObject({ status: 403 });
    expect(/无权/.test(r.error)).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1); // 只读配置，未跑数据
  });

  it('公开报表 → 非创建人可执行', async () => {
    const pool = poolWith({ ...BASE, is_public: 1 });
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 }, { userId: 7 });
    expect(r.error).toBeUndefined();
    expect(r.list).toBeDefined();
  });

  it('本人私有报表 → 可执行', async () => {
    const pool = poolWith({ ...BASE, is_public: 0 });
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 }, { userId: 5 });
    expect(r.error).toBeUndefined();
  });

  it('manageAll 用户 → 可执行他人私有报表', async () => {
    const pool = poolWith({ ...BASE, is_public: 0 });
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 },
      { userId: 1, manageAll: true });
    expect(r.error).toBeUndefined();
  });

  it('create_by 为字符串（MySQL 驱动差异）时归属判断仍成立', async () => {
    const pool = poolWith({ ...BASE, create_by: '5', is_public: 0 });
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 }, { userId: 5 });
    expect(r.error).toBeUndefined();
  });

  it('不传 user 默认拒绝私有报表（fail-closed）', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce([[{ ...BASE, is_public: 0 }]]) };
    const r = await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });
    expect(r).toMatchObject({ status: 403 });
  });
});
