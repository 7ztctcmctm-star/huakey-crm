/**
 * 合同模板服务层
 * 从 routes/contractTemplate.js 提取的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 获取模板列表
 */
async function listTemplates(pool) {
  const [templates] = await pool.query(
    'SELECT * FROM crm_contract_template WHERE deleted_at IS NULL ORDER BY sort'
  );
  return templates;
}

/**
 * 获取模板详情
 */
async function getTemplate(pool, id) {
  const [rows] = await pool.query(
    'SELECT * FROM crm_contract_template WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!rows.length) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '模板不存在');
  }
  return rows[0];
}

/**
 * 管理模板（添加/更新/删除）
 */
async function manageTemplate(pool, { action, id, name, amount, payment_terms, delivery_days, remark }) {
  if (action === 'add') {
    const [result] = await pool.query(
      'INSERT INTO crm_contract_template (name, amount, payment_terms, delivery_days, remark) VALUES (?, ?, ?, ?, ?)',
      [name, amount || 0, payment_terms || '', delivery_days || 30, remark || '']
    );
    return { id: result.insertId };
  } else if (action === 'update') {
    await pool.query(
      'UPDATE crm_contract_template SET name=?, amount=?, payment_terms=?, delivery_days=?, remark=? WHERE id=?',
      [name, amount, payment_terms, delivery_days, remark, id]
    );
    return null;
  } else if (action === 'delete') {
    await pool.query('UPDATE crm_contract_template SET deleted_at = NOW() WHERE id = ?', [id]);
    return null;
  } else {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '无效操作');
  }
}

module.exports = {
  listTemplates,
  getTemplate,
  manageTemplate
};
