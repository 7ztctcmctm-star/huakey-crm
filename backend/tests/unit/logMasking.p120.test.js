/**
 * P1-20：日志脱敏
 *
 * 审计证据：slowQuery.js:58/71 直接写 SQL 参数；middleware/logger.js:114/246/268
 * 持久化原始 URL 查询串，密码/手机号/邮箱会进入慢查询日志与 sys_log。
 *
 * 本测试覆盖三条落盘路径：
 *   1. utils/mask 的文本/URL/SQL 参数脱敏（含幂等性）；
 *   2. logAction 写 sys_log 前对 url/params/description/errorMsg/变更字段脱敏；
 *   3. 慢查询成功与失败两条 warn 路径均脱敏 params、SQL 与 MySQL 错误文本。
 */

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  readOnlyPool: null
}));
jest.mock('../../config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn()
}));

const db = require('../../config/database');
const logger = require('../../config/logger');
const rawQuery = db.query;

// slowQuery 在模块加载时会把 pool.query 替换成计时包装；先取原始 mock 再恢复，
// 避免 logAction 的调用被计时器吞掉。
const { interceptSlowQuery } = require('../../config/slowQuery');
db.query = rawQuery;

const { logAction } = require('../../middleware/logger');
const {
  maskPIIString,
  maskUrlQuery,
  maskSqlParams,
  maskSqlText
} = require('../../utils/mask');

describe('P1-20 · 文本/URL/SQL 参数脱敏', () => {
  it('maskPIIString 脱敏邮箱/手机/证件/银行卡/JWT/bcrypt/长 hex', () => {
    const bcrypt = '$2b$10$' + 'a'.repeat(53);
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
    const text = `a@b.com 13800138000 110101199001011234 6222021234567890123 ${jwt} ${bcrypt} ${'f'.repeat(64)}`;
    const masked = maskPIIString(text);

    expect(masked).not.toContain('a@b.com');
    expect(masked).not.toContain('13800138000');
    expect(masked).not.toContain('110101199001011234');
    expect(masked).not.toContain('6222021234567890123');
    expect(masked).not.toContain(jwt);
    expect(masked).not.toContain(bcrypt);
    expect(masked).not.toContain('f'.repeat(64));
    expect(masked).toContain('138****8000');
    expect(masked).toContain('1101**********1234');
    expect(masked).toContain('[JWT]');
    expect(masked).toContain('[bcrypt]');
    expect(masked).toContain('[redacted]');
  });

  it('maskPIIString 对已脱敏邮箱幂等', () => {
    const once = maskPIIString('alice@example.com');
    expect(once).toBe('a***e@example.com');
    expect(maskPIIString(once)).toBe(once);
  });

  it('maskUrlQuery 按字段名 + PII 模式脱敏查询串', () => {
    const masked = decodeURIComponent(maskUrlQuery(
      '/api/v1/customer/list?phone=13800138000&email=alice%40example.com' +
      '&password=Secret123&keyword=contact%20bob%40example.com%2013900139000'
    ));

    expect(masked).toContain('phone=138****8000');
    expect(masked).toContain('email=a***e@example.com');
    expect(masked).toContain('password=******');
    expect(masked).toContain('b***b@example.com');
    expect(masked).toContain('139****9000');
    expect(masked).not.toContain('13800138000');
    expect(masked).not.toContain('alice@example.com');
    expect(masked).not.toContain('bob@example.com');
    expect(masked).not.toContain('Secret123');
  });

  it('maskUrlQuery 兼容 phone[]= 数组参数与无查询串 URL', () => {
    expect(decodeURIComponent(maskUrlQuery('/x?phone[]=13800138000')))
      .toContain('phone[]=138****8000');
    expect(maskUrlQuery('/api/v1/health')).toBe('/api/v1/health');
    expect(maskUrlQuery(undefined)).toBe(undefined);
  });

  it('maskSqlParams 处理位置参数、数字手机号与对象参数', () => {
    const masked = maskSqlParams([
      '13800138000',
      'alice@example.com',
      13900139000,
      { password: 'Secret123', email: 'bob@example.com' }
    ]);

    expect(masked).toEqual([
      '138****8000',
      'a***e@example.com',
      '139****9000',
      { password: '******', email: 'b***b@example.com' }
    ]);
  });

  it('maskSqlText 兼容 mysql2 的 { sql, values } 入参', () => {
    const masked = maskSqlText({
      sql: 'SELECT * FROM crm_customer WHERE phone = ?',
      values: ['13800138000']
    });

    expect(masked).not.toContain('13800138000');
    expect(masked).toContain('138****8000');
  });
});

describe('P1-20 · sys_log 写入脱敏', () => {
  beforeEach(() => {
    rawQuery.mockReset();
    rawQuery.mockResolvedValue([{ affectedRows: 1 }]);
    logger.error.mockReset();
  });

  it('url/params/description/errorMsg/变更值落库前全部脱敏', async () => {
    await logAction({
      module: '客户管理',
      action: '查询列表',
      method: 'GET',
      url: '/api/v1/customer/list?phone=13800138000&email=alice%40example.com&password=Secret123',
      params: {
        phone: '13800138000',
        email: 'alice@example.com',
        note: '请联系 13900139000 或 bob@example.com',
        password: 'Secret123'
      },
      ipAddress: '127.0.0.1',
      userId: 1,
      userName: '测试用户',
      description: '客户管理 - GET /api/v1/customer/list?phone=13800138000',
      status: 1,
      errorMsg: '用户 alice@example.com 不存在',
      changedFields: [{ field: 'email', old: 'alice@example.com', new: 'bob@example.com' }],
      oldValue: { phone: '13800138000' },
      newValue: { phone: '13900139000' }
    });

    expect(logger.error).not.toHaveBeenCalled();
    expect(rawQuery).toHaveBeenCalledTimes(1);

    const args = rawQuery.mock.calls[0][1];
    const stored = JSON.stringify(args);

    expect(stored).not.toContain('13800138000');
    expect(stored).not.toContain('13900139000');
    expect(stored).not.toContain('alice@example.com');
    expect(stored).not.toContain('bob@example.com');
    expect(stored).not.toContain('Secret123');

    const storedParams = JSON.parse(args[4]);
    expect(storedParams.phone).toBe('138****8000');
    expect(storedParams.email).toBe('a***e@example.com');
    expect(storedParams.password).toBe('******');
    expect(storedParams.note).toContain('139****9000');
    expect(storedParams.note).toContain('b***b@example.com');

    expect(args[3]).toContain('phone=138****8000');
    expect(args[3]).toContain('email=a***e%40example.com');
    expect(args[3]).toContain('password=******');
    expect(args[8]).toContain('phone=138****8000');
    expect(args[10]).toContain('a***e@example.com');
  });
});

describe('P1-20 · 慢查询日志脱敏', () => {
  beforeEach(() => {
    logger.warn.mockReset();
  });

  function fakeTarget(result) {
    return { query: jest.fn().mockReturnValue(result) };
  }

  it('成功慢查询：SQL 内联值、位置参数均脱敏', async () => {
    const target = fakeTarget(Promise.resolve([{ ok: 1 }]));
    interceptSlowQuery(target, 'unitPool');
    const nowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(3000);

    try {
      await target.query(
        "SELECT * FROM crm_customer WHERE phone = '13800138000'",
        ['13800138000', 'alice@example.com']
      );
    } finally {
      nowSpy.mockRestore();
    }

    expect(logger.warn).toHaveBeenCalledWith('Slow query detected', expect.objectContaining({
      pool: 'unitPool',
      params: '["138****8000","a***e@example.com"]',
      durationMs: 2000,
      thresholdMs: expect.any(Number)
    }));

    const meta = logger.warn.mock.calls[0][1];
    expect(meta.sql).not.toContain('13800138000');
    expect(meta.sql).toContain('138****8000');
  });

  it('失败慢查询：params、SQL 与 MySQL 错误文本均脱敏', async () => {
    const target = fakeTarget(Promise.reject(
      new Error("Duplicate entry 'alice@example.com' for key 'uk_email'")
    ));
    interceptSlowQuery(target, 'unitPool');
    const nowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(3000);

    try {
      await expect(target.query('INSERT INTO t (phone) VALUES (?)', ['13900139000']))
        .rejects.toThrow('Duplicate entry');
    } finally {
      nowSpy.mockRestore();
    }

    expect(logger.warn).toHaveBeenCalledWith('Slow query failed', expect.objectContaining({
      pool: 'unitPool',
      params: '["139****9000"]',
      durationMs: 2000
    }));

    const meta = logger.warn.mock.calls[0][1];
    expect(meta.error).not.toContain('alice@example.com');
    expect(meta.error).toContain('a***e@example.com');
  });
});
