/**
 * customReportService SQL 注入防护回归测试
 *
 * 背景：自定义报表 runReport 曾将 filter_config 中的 f.field 直接拼接进 SQL WHERE 子句，
 *       构成存储型 SQL 注入（持有 report 权限的 boss/manager/finance 角色可触发）。
 * 修复：filter_config 的 field 必须命中 SOURCE_FIELDS 数据源字段白名单，否则跳过。
 */

const customReportService = require('../services/customReportService');

// 构造一个 mock pool，按调用顺序返回：配置 → count → data
function makePool({ filterConfig, columnsConfig = [{ field: 'company_name' }] }) {
  const calls = [];
  return {
    calls,
    query: jest.fn()
      .mockImplementationOnce(async () => [
        [{
          data_source: 'customer',
          columns_config: JSON.stringify(columnsConfig),
          filter_config: JSON.stringify(filterConfig)
        }]
      ])
      .mockImplementationOnce(async (sql, params) => {
        calls.push({ sql, params });
        return [[{ total: 0 }]];
      })
      .mockImplementationOnce(async (sql, params) => {
        calls.push({ sql, params });
        return [[]];
      })
  };
}

describe('customReportService.runReport SQL 注入防护', () => {
  it('应忽略 filter_config 中不在白名单的恶意字段（防止 UNION 注入）', async () => {
    const maliciousField = 'id) UNION SELECT username,password FROM sys_user --';
    const pool = makePool({
      filterConfig: [{ field: maliciousField, type: 'select' }]
    });

    await customReportService.runReport(pool, 1, {
      page: 1,
      pageSize: 20,
      filters: { [maliciousField]: 'x' }
    });

    const countSql = pool.calls[0].sql;
    const dataSql = pool.calls[1].sql;

    expect(countSql).toContain('t.deleted_at IS NULL');
    expect(countSql).not.toContain('UNION');
    expect(countSql).not.toContain('sys_user');
    expect(dataSql).not.toContain('UNION');
  });

  it('应忽略含注释符的字段名（防止 -- 截断注入）', async () => {
    const maliciousField = 'id = 1 --';
    const pool = makePool({
      filterConfig: [{ field: maliciousField, type: 'select' }]
    });

    await customReportService.runReport(pool, 1, {
      page: 1,
      pageSize: 20,
      filters: { [maliciousField]: 'x' }
    });

    expect(pool.calls[0].sql).not.toContain('--');
  });

  it('应放行白名单字段作为过滤条件', async () => {
    const pool = makePool({
      filterConfig: [{ field: 'level', type: 'select' }]
    });

    await customReportService.runReport(pool, 1, {
      page: 1,
      pageSize: 20,
      filters: { level: 'A' }
    });

    expect(pool.calls[0].sql).toContain('t.level = ?');
  });

  it('应容忍 filter_config 非法 JSON 而不抛异常', async () => {
    // 直接注入非法 filter_config 字符串（绕过 makePool 的 JSON.stringify）
    const pool = {
      calls: [],
      query: jest.fn()
        .mockImplementationOnce(async () => [[{
          data_source: 'customer',
          columns_config: JSON.stringify([{ field: 'company_name' }]),
          filter_config: '{invalid json'
        }]])
        .mockImplementationOnce(async (sql) => { pool.calls.push({ sql }); return [[{ total: 0 }]]; })
        .mockImplementationOnce(async (sql) => { pool.calls.push({ sql }); return [[]]; })
    };

    await customReportService.runReport(pool, 1, { page: 1, pageSize: 20, filters: {} });

    expect(pool.calls[0].sql).toContain('t.deleted_at IS NULL');
  });
});
