/**
 * slowQuery 无参查询回归测试
 *
 * 背景（2026-10-14 上线前审计实测发现）：
 * slowQuery.js 的慢查询日志用 `JSON.stringify(x).slice(0, 200)` 截断，
 * 而 JSON.stringify(undefined) 返回 undefined（不是字符串）⇒ .slice 抛 TypeError。
 * 无参查询（如 pool.query('SELECT 1')）一旦超过慢查询阈值：
 *   - 成功路径：日志代码抛错，顶替正常查询结果（调用方收到 TypeError 而非数据）
 *   - 失败路径：日志代码抛错，顶替原始 DB 错误（排障被误导）
 * 本测试锁定修复：两条路径都必须安全返回/抛原始错误。
 *
 * 注意：阈值设为 1ms 而非 0 —— 模块加载时 `parseInt(...) || 1000`，0 会回退成 1000。
 */

process.env.SLOW_QUERY_THRESHOLD_MS = '1'; // 必须在 require slowQuery 之前设置

const mockQuery = jest.fn();
const mockWarn = jest.fn();

jest.mock('../config/database', () => {
  const pool = { query: mockQuery };
  return pool;
});

jest.mock('../config/logger', () => ({
  warn: mockWarn,
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const pool = require('../config/database');
require('../config/slowQuery');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 10ms 延迟 > 1ms 阈值，确保慢查询日志路径必然执行（否则测试会空转通过）
const slowImpl = (impl) => jest.fn(async (...args) => { await delay(10); return impl(...args); });

describe('slowQuery 无参慢查询不崩溃（2026-10-14 审计修复回归）', () => {
  beforeEach(() => {
    mockWarn.mockClear();
    mockQuery.mockReset();
  });

  it('成功路径：无参慢查询应返回原结果，而非 TypeError', async () => {
    mockQuery.mockImplementation(slowImpl(() => [[{ id: 1 }]]));

    const result = await pool.query('SELECT 1');

    expect(result).toEqual([[{ id: 1 }]]);
    // 关键：证明慢查询日志路径真的执行了 —— 否则本测试会在「阈值未触发」下空转通过
    expect(mockWarn).toHaveBeenCalled();
  });

  it('失败路径：无参慢查询失败应抛原始 DB 错误，而非 TypeError', async () => {
    const dbError = new Error('ER_NO_SUCH_TABLE: t');
    mockQuery.mockImplementation(slowImpl(() => { throw dbError; }));

    await expect(pool.query('SELECT 1')).rejects.toBe(dbError);
    expect(mockWarn).toHaveBeenCalled();
  });

  it('带参查询：params 仍应被脱敏并记录为字符串', async () => {
    mockQuery.mockImplementation(slowImpl(() => [[{ id: 1 }]]));

    const result = await pool.query('SELECT * FROM sys_user WHERE phone = ?', ['13800138000']);

    expect(result).toEqual([[{ id: 1 }]]);
    expect(mockWarn).toHaveBeenCalled();
    const logged = mockWarn.mock.calls[mockWarn.mock.calls.length - 1][1];
    expect(typeof logged.params).toBe('string');
    expect(logged.params).toContain('13800138000');
  });

  it('sql 为对象形态（mysql2 options object）时也不应崩溃', async () => {
    mockQuery.mockImplementation(slowImpl(() => [[{ id: 1 }]]));

    const result = await pool.query({ sql: 'SELECT 1', timeout: 100 });

    expect(result).toEqual([[{ id: 1 }]]);
    expect(mockWarn).toHaveBeenCalled();
  });
});
