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

function clearConfigCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

module.exports = { getConfig, getOverdueDays, clearConfigCache };
