/**
 * @module utils/dateCode
 * @description 业务日期 / 编号日期编码 —— 全站统一 Asia/Shanghai
 *
 * ## 为什么要抽这个模块
 * 各业务的单据编号（CON-/OPP-/PO-/RCV-/SUP-/SRV-/INV-/BJ/PR）原先统一用
 * `new Date().toISOString().slice(...)` 截取日期段，而 `toISOString()` 恒返回 **UTC**：
 *
 *   北京时间 2026-01-15 07:30  ⇒  UTC 2026-01-14 23:30
 *
 * 于是每天 00:00–08:00 生成的编号日期是"昨天"，与同一条记录的 `create_time`
 * （MySQL `NOW()`，会话时区 +08:00）差一整天；同时 `COUNT(*)` 序号被拆到两个日期前缀下
 * 统计，当天序号不连续、跨日还会重复发号。
 *
 * ## 三层统一口径
 * | 层 | 落地位置 |
 * |---|---|
 * | MySQL | `backend/config/database.js` 主池/只读池 `timezone: '+08:00'` |
 * | 容器 | compose + Dockerfile 的 `TZ=Asia/Shanghai`（对齐 docker-compose.synology.yml） |
 * | Node | 本模块按 `APP_TIMEZONE`（默认 Asia/Shanghai）用 `Intl` 取年月日 |
 *
 * 本模块**不依赖宿主机本地时区**：CI runner 通常是 UTC，若用 `getFullYear()` 会随机器漂移；
 * 用 `Intl.DateTimeFormat({ timeZone })` 可保证任何环境下"业务上的今天"都是北京时间。
 */

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

/**
 * 业务时区。生产保持默认；仅排障 / 数据迁移期允许用 APP_TIMEZONE 覆盖。
 * @returns {string} IANA 时区名
 */
function businessTimeZone() {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 归一化输入为 Date
 * @param {Date|string|number} value
 * @returns {Date|null} 非法输入返回 null
 */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 取指定时区下的日历字段（年/月/日/时/分/秒，均补零为 2 位）
 * Intl 不可用时退化为宿主机本地时间，保证模块永不抛错。
 * @param {Date|string|number} value
 * @param {string} timeZone
 * @returns {{y:string,m:string,d:string,hh:string,mm:string,ss:string}}
 */
function zonedParts(value, timeZone) {
  const date = toDate(value) || new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const map = {};
    for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
    return {
      y: map.year,
      m: map.month,
      d: map.day,
      // 个别 ICU 版本在 h23 下仍可能给出 24（午夜），归一为 00
      hh: map.hour === '24' ? '00' : map.hour,
      mm: map.minute,
      ss: map.second
    };
  } catch {
    return {
      y: String(date.getFullYear()),
      m: pad2(date.getMonth() + 1),
      d: pad2(date.getDate()),
      hh: pad2(date.getHours()),
      mm: pad2(date.getMinutes()),
      ss: pad2(date.getSeconds())
    };
  }
}

/**
 * 业务日期键：YYYY-MM-DD（北京时间）
 * @param {Date|string|number} [value] 默认当前时刻
 * @param {string} [timeZone] 默认 businessTimeZone()
 * @returns {string}
 */
function dateKey(value = new Date(), timeZone = businessTimeZone()) {
  const p = zonedParts(value, timeZone);
  return `${p.y}-${p.m}-${p.d}`;
}

/**
 * 编号短日期段：YYMMDD（CON-260115-001 中的 260115）
 * @param {Date|string|number} [value]
 * @param {string} [timeZone]
 * @returns {string}
 */
function shortDateCode(value = new Date(), timeZone = businessTimeZone()) {
  return dateKey(value, timeZone).slice(2).replace(/-/g, '');
}

/**
 * 编号长日期段：YYYYMMDD（BJ20260115001 中的 20260115）
 * @param {Date|string|number} [value]
 * @param {string} [timeZone]
 * @returns {string}
 */
function fullDateCode(value = new Date(), timeZone = businessTimeZone()) {
  return dateKey(value, timeZone).replace(/-/g, '');
}

/**
 * 日期时间串：YYYY-MM-DD HH:mm:ss（北京时间）
 * @param {Date|string|number} [value]
 * @param {string} [timeZone]
 * @returns {string}
 */
function dateTimeKey(value = new Date(), timeZone = businessTimeZone()) {
  const p = zonedParts(value, timeZone);
  return `${p.y}-${p.m}-${p.d} ${p.hh}:${p.mm}:${p.ss}`;
}

/**
 * 相对今天的日期键：addDaysKey(1) = 明天，addDaysKey(-1) = 昨天
 * 用于提醒/到期扫描的边界，避免 toISOString 把 00:00–08:00 算成前一天。
 * @param {number} days 可为负
 * @param {Date|string|number} [value] 基准时刻，默认当前
 * @param {string} [timeZone]
 * @returns {string} YYYY-MM-DD
 */
function addDaysKey(days, value = new Date(), timeZone = businessTimeZone()) {
  const base = toDate(value) || new Date();
  const shifted = new Date(base.getTime() + Number(days) * 86400000);
  return dateKey(shifted, timeZone);
}

module.exports = {
  DEFAULT_TIMEZONE,
  businessTimeZone,
  dateKey,
  shortDateCode,
  fullDateCode,
  dateTimeKey,
  addDaysKey
};
