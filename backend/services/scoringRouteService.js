/**
 * 评分规则服务层
 * 从 routes/scoring.js 提取的业务逻辑，供路由层复用
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 辅助函数：获取字段值
 */
function getFieldValue(field, customer, stats) {
  switch (field) {
    case 'source': return customer.source || '';
    case 'followup_count': return stats.followup_count || 0;
    case 'quote_count': return stats.quote_count || 0;
    case 'contract_count': return stats.contract_count || 0;
    case 'last_followup_days': return stats.last_followup_days ?? 999;
    default: return '';
  }
}

/**
 * 辅助函数：根据规则匹配客户
 */
function matchRules(rules, customer, stats) {
  let totalScore = 0;
  const matchedRules = [];

  for (const rule of rules) {
    const fieldValue = getFieldValue(rule.condition_field, customer, stats);
    let matched = false;

    switch (rule.condition_operator) {
      case 'eq':
        matched = String(fieldValue) === String(rule.condition_value);
        break;
      case 'gt':
        matched = parseFloat(fieldValue) > parseFloat(rule.condition_value);
        break;
      case 'lt':
        matched = parseFloat(fieldValue) < parseFloat(rule.condition_value);
        break;
      case 'contains':
        matched = String(fieldValue).includes(String(rule.condition_value));
        break;
      default:
        matched = false;
    }

    if (matched) {
      totalScore += rule.score;
      matchedRules.push(rule);
    }
  }

  return { totalScore, matchedRules };
}

/**
 * 获取所有评分规则
 * @param {object} pool
 */
async function getRules(pool) {
  const [rows] = await pool.query(
    `SELECT id, name, condition_type, condition_field, condition_operator, condition_value, score, status, create_time, update_time, deleted_at
     FROM crm_score_rule WHERE deleted_at IS NULL ORDER BY condition_type, name`
  );
  return rows;
}

/**
 * 创建评分规则
 * @param {object} pool
 * @param {object} data - { name, condition_type, condition_field, condition_operator, condition_value, score }
 * @param {number} userId
 */
// eslint-disable-next-line no-unused-vars
async function createRule(pool, data, userId) {
  const { name, condition_type, condition_field, condition_operator, condition_value, score } = data;

  const validTypes = ['source', 'action', 'interaction'];
  const safeType = validTypes.includes(condition_type) ? condition_type : 'source';

  const [result] = await pool.query(
    `INSERT INTO crm_score_rule (name, condition_type, condition_field, condition_operator, condition_value, score)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), safeType, condition_field || null, condition_operator || null, condition_value || null, parseInt(score)]
  );

  return { id: result.insertId };
}

/**
 * 更新评分规则
 * @param {object} pool
 * @param {number} id
 * @param {object} data - { name, condition_type, condition_field, condition_operator, condition_value, score, status }
 */
async function updateRule(pool, id, data) {
  const { name, condition_type, condition_field, condition_operator, condition_value, score, status } = data;

  const [existing] = await pool.query('SELECT id FROM crm_score_rule WHERE id = ?', [id]);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '规则不存在');
  }

  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (condition_type !== undefined) { fields.push('condition_type = ?'); values.push(condition_type); }
  if (condition_field !== undefined) { fields.push('condition_field = ?'); values.push(condition_field); }
  if (condition_operator !== undefined) { fields.push('condition_operator = ?'); values.push(condition_operator); }
  if (condition_value !== undefined) { fields.push('condition_value = ?'); values.push(condition_value); }
  if (score !== undefined) { fields.push('score = ?'); values.push(parseInt(score)); }
  if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }

  if (fields.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '没有要更新的字段');
  }

  values.push(id);
  await pool.query(`UPDATE crm_score_rule SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * 删除评分规则（软删除）
 * @param {object} pool
 * @param {number} id
 */
async function deleteRule(pool, id) {
  await pool.query('UPDATE crm_score_rule SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * 获取客户统计数据
 * @param {object} pool
 * @param {number} customerId
 */
async function getCustomerStats(pool, customerId) {
  const [[stats]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM crm_follow_up WHERE customer_id = ?) as followup_count,
      (SELECT COUNT(*) FROM crm_quote WHERE customer_id = ? AND deleted_at IS NULL) as quote_count,
      (SELECT COUNT(*) FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL) as contract_count,
      (SELECT DATEDIFF(NOW(), MAX(create_time)) FROM crm_follow_up WHERE customer_id = ?) as last_followup_days
  `, [customerId, customerId, customerId, customerId]);
  return stats;
}

/**
 * 写入评分结果（更新客户分数 + 记录日志）
 * @param {object} pool
 * @param {number} customerId
 * @param {number} totalScore
 * @param {Array} matchedRules
 */
async function saveScoreResult(pool, customerId, totalScore, matchedRules) {
  await pool.query('UPDATE crm_customer SET score = ? WHERE id = ?', [totalScore, customerId]);

  await pool.query('DELETE FROM crm_customer_score_log WHERE customer_id = ?', [customerId]);
  if (matchedRules.length > 0) {
    const logValues = matchedRules.map(r => [customerId, r.id, r.score, totalScore, `规则"${r.name}"命中`]);
    await pool.query(
      'INSERT INTO crm_customer_score_log (customer_id, rule_id, score, total_score, remark) VALUES ?',
      [logValues]
    );
  }
}

/**
 * 计算单个客户评分
 * @param {object} pool
 * @param {number} customerId
 */
async function calculateScore(pool, customerId) {
  const [customers] = await pool.query(
    'SELECT id, source FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在');
  }
  const customer = customers[0];

  const stats = await getCustomerStats(pool, customerId);
  const [rules] = await pool.query(
    `SELECT id, name, condition_type, condition_field, condition_operator, condition_value, score, status
     FROM crm_score_rule WHERE status = 1`
  );

  const { totalScore, matchedRules } = matchRules(rules, customer, stats);
  await saveScoreResult(pool, customerId, totalScore, matchedRules);
  return { customer_id: customerId, score: totalScore, matched_rules: matchedRules.map(r => r.name) };
}

/**
 * 批量计算所有客户评分
 * @param {object} pool
 * @param {Array} customerIds - 可选，不传则计算所有客户
 */
async function batchCalculate(pool, customerIds) {
  let customers;
  if (customerIds && customerIds.length > 0) {
    [customers] = await pool.query(
      `SELECT id FROM crm_customer WHERE deleted_at IS NULL AND id IN (${customerIds.map(() => '?').join(',')})`,
      customerIds
    );
  } else {
    [customers] = await pool.query('SELECT id FROM crm_customer WHERE deleted_at IS NULL');
  }

  const [rules] = await pool.query(
    `SELECT id, name, condition_type, condition_field, condition_operator, condition_value, score, status
     FROM crm_score_rule WHERE status = 1`
  );

  let processed = 0;
  for (const customer of customers) {
    const stats = await getCustomerStats(pool, customer.id);
    const [[custRow]] = await pool.query('SELECT source FROM crm_customer WHERE id = ?', [customer.id]);

    const { totalScore, matchedRules } = matchRules(rules, custRow, stats);
    await saveScoreResult(pool, customer.id, totalScore, matchedRules);
    processed++;
  }

  return { processed };
}

/**
 * 评分排行榜
 * @param {object} pool
 * @param {object} params - { limit }
 */
async function getRanking(pool, params = {}) {
  const { limit = 20 } = params;
  const [rows] = await pool.query(`
    SELECT id, company_name, score, level, owner_id,
           (SELECT real_name FROM sys_user WHERE id = crm_customer.owner_id) as owner_name
    FROM crm_customer
    WHERE deleted_at IS NULL AND score > 0
    ORDER BY score DESC
    LIMIT ?
  `, [parseInt(limit)]);
  return rows;
}

/**
 * 获取客户评分详情（含评分历史）
 * @param {object} pool
 * @param {number} customerId
 */
async function getCustomerScore(pool, customerId) {
  const [[customer]] = await pool.query(
    'SELECT id, company_name, score FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (!customer) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在');
  }

  const [logs] = await pool.query(`
    SELECT l.id, l.customer_id, l.rule_id, l.score, l.total_score, l.remark, l.create_time,
           r.name as rule_name, r.condition_type
    FROM crm_customer_score_log l
    LEFT JOIN crm_score_rule r ON l.rule_id = r.id
    WHERE l.customer_id = ?
    ORDER BY l.create_time DESC
    LIMIT 50
  `, [customerId]);

  return { customer, logs };
}

module.exports = {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  calculateScore,
  batchCalculate,
  getRanking,
  getCustomerScore
};
