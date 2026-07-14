const pool = require('../config/database');

const cache = {};
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1分钟缓存

async function getConfig(key, defaultValue = null) {
  const now = Date.now();
  if (cache[key] !== undefined && (now - cacheTime) < CACHE_TTL) {
    return cache[key];
  }

  const [rows] = await pool.query(
    'SELECT config_value FROM sys_config WHERE config_key = ?',
    [key]
  );

  const value = rows.length > 0 ? rows[0].config_value : defaultValue;
  cache[key] = value;
  cacheTime = now;
  return value;
}

async function getOverdueDays() {
  const val = await getConfig('overdue_days', '15');
  return parseInt(val) || 15;
}

async function isFollowupReminderEnabled() {
  const val = await getConfig('followup_reminder_enabled', '1');
  return String(val) !== '0';
}

async function getNearRecycleDays() {
  const val = await getConfig('near_recycle_days', '7');
  return parseInt(val) || 7;
}

async function getRecycleDays() {
  const val = await getConfig('recycle_days', '15');
  return parseInt(val) || 15;
}

function clearConfigCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

module.exports = {
  getConfig,
  getOverdueDays,
  isFollowupReminderEnabled,
  getNearRecycleDays,
  getRecycleDays,
  clearConfigCache
};
