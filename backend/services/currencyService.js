/**
 * 货币管理服务层
 * 从 routes/currency.js 提取的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 获取货币列表
 */
async function listCurrencies(pool) {
  const [rows] = await pool.query(
    'SELECT * FROM crm_currency WHERE deleted_at IS NULL ORDER BY is_default DESC, code ASC'
  );
  return rows;
}

/**
 * 获取汇率map（前端用）
 */
async function getRates(pool) {
  const [rows] = await pool.query(
    'SELECT code, name, symbol, exchange_rate, is_default FROM crm_currency WHERE deleted_at IS NULL'
  );
  const rates = {};
  rows.forEach(r => {
    rates[r.code] = {
      name: r.name,
      symbol: r.symbol,
      rate: parseFloat(r.exchange_rate),
      is_default: !!r.is_default
    };
  });
  return rates;
}

/**
 * 更新汇率
 */
async function updateCurrency(pool, id, { exchange_rate, is_default, status }) {
  const fields = [];
  const values = [];

  if (exchange_rate !== undefined) {
    fields.push('exchange_rate = ?');
    values.push(parseFloat(exchange_rate));
  }
  if (is_default !== undefined) {
    if (is_default) {
      await pool.query('UPDATE crm_currency SET is_default = 0');
    }
    fields.push('is_default = ?');
    values.push(is_default ? 1 : 0);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(parseInt(status));
  }

  if (fields.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '没有要更新的字段');
  }

  values.push(id);
  await pool.query(`UPDATE crm_currency SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * 删除货币（软删除）
 */
async function deleteCurrency(pool, id) {
  await pool.query('UPDATE crm_currency SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  listCurrencies,
  getRates,
  updateCurrency,
  deleteCurrency
};
