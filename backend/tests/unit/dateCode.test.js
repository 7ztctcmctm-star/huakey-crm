/**
 * 步骤 B3 · 时区统一 —— utils/dateCode 单测
 *
 * ## 要守住的回归点
 * 北京时间 00:00–08:00 之间，UTC 日期仍是「昨天」。修复前编号日期段用
 * `new Date().toISOString().slice(2, 10)`，于是这段时间生成的 CON-/OPP-/INV-… 编号
 * 比同一行的 create_time（MySQL NOW()，会话时区 +08:00）**少一天**，
 * 且 COUNT(*) 序号被拆到两个日期前缀下统计。
 *
 * 本文件用假定时器把系统时间冻进该窗口，断言编号日期 = 北京时间当天。
 * dateCode 内部用 Intl 钉死 Asia/Shanghai，所以即便 runner 是 UTC（CI）结论也不变。
 */

const {
  DEFAULT_TIMEZONE,
  businessTimeZone,
  dateKey,
  shortDateCode,
  fullDateCode,
  dateTimeKey,
  addDaysKey
} = require('../../utils/dateCode');

describe('utils/dateCode · 时区口径', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('业务时区默认 Asia/Shanghai', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Shanghai');
    expect(businessTimeZone()).toBe('Asia/Shanghai');
  });

  it('北京时间 07:30（UTC 前一日 23:30）：编号日期必须取北京当天，而不是 UTC 的昨天', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-14T23:30:00Z'));

    // 先自证这个时刻确实处在「UTC 与北京差一天」的窗口内
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-01-14');

    expect(dateKey()).toBe('2026-01-15');
    expect(shortDateCode()).toBe('260115');
    expect(fullDateCode()).toBe('20260115');
    expect(dateTimeKey()).toBe('2026-01-15 07:30:00');
  });

  it('跨年窗口：北京时间 2026-01-01 00:30（UTC 2025-12-31 16:30）不得退回 2025', () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-12-31T16:30:00Z'));

    expect(new Date().toISOString().slice(0, 10)).toBe('2025-12-31');
    expect(shortDateCode()).toBe('260101');
    expect(fullDateCode()).toBe('20260101');
  });

  it('跨月窗口：北京时间 2026-03-01 07:30（UTC 2026-02-28 23:30）不得退回 02 月', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-28T23:30:00Z'));

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(shortDateCode()).toBe('260301');
  });

  it('闰日：2028-02-28T20:00Z 在北京是 02-29', () => {
    expect(dateKey(new Date('2028-02-28T20:00:00Z'))).toBe('2028-02-29');
  });

  it('非敏感窗口（北京正午）结果不变，证明改造没有整体偏移', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T04:00:00Z'));

    expect(dateKey()).toBe('2026-06-15');
    expect(shortDateCode()).toBe('260615');
  });

  it('addDaysKey 跨月/跨年为北京时间口径，且不受宿主机时区影响', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T00:30:00Z')); // 北京 2026-01-31 08:30

    expect(dateKey()).toBe('2026-01-31');
    expect(addDaysKey(1)).toBe('2026-02-01');
    expect(addDaysKey(-1)).toBe('2026-01-30');
    expect(addDaysKey(0)).toBe('2026-01-31');
  });

  it('显式入参（含 mysql2 返回的 Date）按北京时间换算', () => {
    // UTC 23:30 → 北京次日 07:30
    expect(dateKey('2026-06-01T23:30:00Z')).toBe('2026-06-02');
    expect(shortDateCode(new Date('2026-06-01T23:30:00Z'))).toBe('260602');
  });

  it('非法入参不抛错，退化成当前时间（模块永不中断业务写入）', () => {
    expect(dateKey('not-a-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateKey(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateKey(new Date('invalid'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('config/database · 连接池会话时区', () => {
  it('主池与只读池都必须带 timezone=+08:00', () => {
    const db = require('../../config/database');
    const mainTz = db.pool.config.connectionConfig.timezone;
    expect(mainTz).toBe('+08:00');

    // 未配置 DB_RO_HOST 时 readOnlyPool 直接复用主池，此时只需主池断言成立
    if (db.isReadOnlyPoolAvailable) {
      const roTz = db.readOnlyPool.pool.config.connectionConfig.timezone;
      expect(roTz).toBe('+08:00');
    } else {
      expect(db.readOnlyPool).toBe(db);
    }
  });
});
