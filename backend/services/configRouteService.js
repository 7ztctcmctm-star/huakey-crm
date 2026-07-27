/**
 * 系统配置服务层
 * 从 routes/config.js 提取的业务逻辑
 */
const { clearConfigCache, getOverdueDays } = require('../utils/config');
const notification = require('../utils/notification');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 获取逾期天数
 */
async function fetchOverdueDays() {
  const days = await getOverdueDays();
  return { overdue_days: days };
}

/**
 * 获取所有配置
 */
async function listConfigs(pool) {
  const [rows] = await pool.query(
    'SELECT config_key, config_value, description FROM sys_config ORDER BY id'
  );
  return rows;
}

/**
 * 更新配置
 */
async function updateConfigs(pool, configs) {
  if (!configs || !Array.isArray(configs) || configs.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '配置数据不能为空');
  }

  for (const item of configs) {
    if (!item.config_key || item.config_value === undefined) continue;
    await pool.query(
      'UPDATE sys_config SET config_value = ? WHERE config_key = ?',
      [String(item.config_value), item.config_key]
    );
  }

  clearConfigCache();
}

/**
 * 测试企业微信通知
 */
async function testNotification() {
  await notification.sendText('🔔 CRM 通知测试\n\n如果您收到这条消息，说明企业微信通知配置成功！');
}

module.exports = {
  fetchOverdueDays,
  listConfigs,
  updateConfigs,
  testNotification
};
