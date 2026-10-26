/**
 * [X-01] createRouteLogger 必须兼容服务层伪 req
 *
 * invoiceService / importService 调用 `logAction({ user, ip }, action, desc)`，
 * 该对象没有 method / originalUrl；而 sys_log.url、sys_log.method 均 NOT NULL。
 * 旧实现写入 null → INSERT 失败 → catch 吞掉 → 明细审计日志静默丢失。
 */
jest.mock('../../config/database', () => ({
  query: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
}));
jest.mock('../../config/logger', () => ({
  error: jest.fn(),
  http: jest.fn()
}));

const pool = require('../../config/database');
const { createRouteLogger } = require('../../middleware/logger');

describe('[X-01] createRouteLogger', () => {
  beforeEach(() => pool.query.mockClear());

  it('伪 req（无 method/originalUrl）应写入空 URL 与默认 POST，而不是落 null 失败', async () => {
    const logAction = createRouteLogger('发票管理');

    await logAction({ user: { userId: 7 }, ip: '' }, 'add', '新增发票: INV-261026-001');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO `sys_log`');
    expect(params[0]).toBe('发票管理');
    expect(params[1]).toBe('add');
    expect(params[2]).toBe('POST');
    expect(params[3]).toBe('');
    expect(params[6]).toBe(7);
    expect(params[8]).toBe('新增发票: INV-261026-001');
    expect(params[9]).toBe(1); // status 未传 → logAction 默认成功
  });

  it('完整 Express req 保持原有语义（GET 记录 query）', async () => {
    const logAction = createRouteLogger('系统管理');

    await logAction({
      method: 'GET',
      originalUrl: '/api/v1/invoice/list?page=1',
      query: { page: '1' },
      ip: '10.0.0.8',
      user: { userId: 2, username: 'admin' }
    }, '查询列表', '发票列表');

    const [, params] = pool.query.mock.calls[0];
    expect(params[2]).toBe('GET');
    expect(params[3]).toBe('/api/v1/invoice/list?page=1');
    expect(params[4]).toBe(JSON.stringify({ page: '1' }));
    expect(params[5]).toBe('10.0.0.8');
    expect(params[6]).toBe(2);
    expect(params[7]).toBe('admin');
  });
});
