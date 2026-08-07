/**
 * AI助手服务层
 * 从 routes/ai.js 提取的数据库操作
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

async function getAiStatus() {
  const { getProviderStatus } = require('../utils/llmClient');
  return await getProviderStatus();
}

async function getAiSuggestions(pool, params = {}) {
  const { type, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = '1=1';
  const queryParams = [];
  if (type) {
    whereClause += ' AND s.type = ?';
    queryParams.push(type);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_ai_suggestion s WHERE ${whereClause}`, queryParams
  );

  const [list] = await pool.query(
    `SELECT s.id, s.type, s.ref_id, s.suggestion, s.confidence, s.is_accepted, s.feedback, s.create_by, s.create_time, u.real_name as creator_name
     FROM crm_ai_suggestion s
     LEFT JOIN sys_user u ON s.create_by = u.id
     WHERE ${whereClause}
     ORDER BY s.create_time DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  // 批量补充关联数据（避免 N+1）
  const customerIds = [...new Set(list.filter(i => i.type === 'follow_up' || i.type === 'customer').map(i => i.ref_id))];
  const oppIds = [...new Set(list.filter(i => i.type === 'opportunity' || i.type === 'pricing').map(i => i.ref_id))];

  const customerMap = new Map();
  if (customerIds.length > 0) {
    const [customers] = await pool.query(
      `SELECT id, company_name FROM crm_customer WHERE id IN (${customerIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      customerIds
    );
    customers.forEach(c => customerMap.set(c.id, c.company_name));
  }

  const oppMap = new Map();
  if (oppIds.length > 0) {
    const [opps] = await pool.query(
      `SELECT id, name, expected_amount, customer_id FROM crm_opportunity WHERE id IN (${oppIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      oppIds
    );
    opps.forEach(o => oppMap.set(o.id, o));
  }

  for (const item of list) {
    if (item.type === 'follow_up' || item.type === 'customer') {
      item.ref_name = customerMap.get(item.ref_id) || '未知客户';
    } else if (item.type === 'opportunity' || item.type === 'pricing') {
      const opp = oppMap.get(item.ref_id);
      item.ref_name = opp?.name || '未知商机';
      item.expected_amount = opp?.expected_amount;
    }
  }

  return { list, total: countResult[0].total };
}

async function submitFeedback(pool, id, isAccepted, feedback) {
  const fields = [];
  const params = [];
  if (isAccepted !== undefined) { fields.push('is_accepted = ?'); params.push(isAccepted); }
  if (feedback !== undefined) { fields.push('feedback = ?'); params.push(feedback); }
  if (fields.length === 0) return { error: '没有要更新的字段', code: 400 };

  params.push(id);
  await pool.query(`UPDATE crm_ai_suggestion SET ${fields.join(', ')} WHERE id = ?`, params);
  return { success: true };
}

async function generateSuggestions(pool, userId) {
  let created = 0;

  // 1. 客户跟进超期建议
  const [overdueCustomers] = await pool.query(`
    SELECT c.id, c.company_name, c.last_follow_time,
           DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
    FROM crm_customer c
    WHERE c.deleted_at IS NULL AND c.owner_id IS NOT NULL
      AND (c.last_follow_time IS NULL OR c.last_follow_time < NOW() - INTERVAL 30 DAY)
    LIMIT 20
  `);

  // 批量检查 + 批量插入（避免 N+1）
  if (overdueCustomers.length > 0) {
    const ids = overdueCustomers.map(c => c.id);
    const [existRows] = await pool.query(
      `SELECT ref_id FROM crm_ai_suggestion WHERE type = 'follow_up' AND ref_id IN (${ids.map(() => '?').join(',')}) AND create_time >= NOW() - INTERVAL 24 HOUR`,
      ids
    );
    const existingSet = new Set(existRows.map(r => r.ref_id));
    const newItems = overdueCustomers.filter(c => !existingSet.has(c.id));
    if (newItems.length > 0) {
      const values = newItems.map(c =>
        `('follow_up', ${c.id}, '客户"${c.company_name}"已${c.overdue_days}天未跟进，建议立即安排回访或联系沟通。', 0.85, ${userId})`
      ).join(', ');
      await pool.query(`INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by) VALUES ${values}`);
      created += newItems.length;
    }
  }

  // 2. 商机停滞建议
  const [staleOpps] = await pool.query(`
    SELECT o.id, o.name, o.expected_amount, o.stage, o.update_time,
           DATEDIFF(NOW(), o.update_time) as stale_days, c.company_name
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    WHERE o.stage NOT IN (5, 6) AND o.deleted_at IS NULL AND o.update_time < NOW() - INTERVAL 14 DAY
    LIMIT 20
  `);

  if (staleOpps.length > 0) {
    const ids = staleOpps.map(o => o.id);
    const [existRows] = await pool.query(
      `SELECT ref_id FROM crm_ai_suggestion WHERE type = 'opportunity' AND ref_id IN (${ids.map(() => '?').join(',')}) AND create_time >= NOW() - INTERVAL 24 HOUR`,
      ids
    );
    const existingSet = new Set(existRows.map(r => r.ref_id));
    const newItems = staleOpps.filter(o => !existingSet.has(o.id));
    if (newItems.length > 0) {
      const values = newItems.map(o =>
        `('opportunity', ${o.id}, '商机"${o.name}"（${o.company_name}）在当前阶段已停滞${o.stale_days}天，建议推进或重新评估。', 0.75, ${userId})`
      ).join(', ');
      await pool.query(`INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by) VALUES ${values}`);
      created += newItems.length;
    }
  }

  // 3. 高金额低赢率商机建议
  const [lowWinOpps] = await pool.query(`
    SELECT o.id, o.name, o.expected_amount, o.win_rate, c.company_name
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    WHERE o.stage NOT IN (5, 6) AND o.deleted_at IS NULL AND o.expected_amount >= 100000 AND (o.win_rate IS NULL OR o.win_rate < 30)
    LIMIT 10
  `);

  if (lowWinOpps.length > 0) {
    const ids = lowWinOpps.map(o => o.id);
    const [existRows] = await pool.query(
      `SELECT ref_id FROM crm_ai_suggestion WHERE type = 'pricing' AND ref_id IN (${ids.map(() => '?').join(',')}) AND create_time >= NOW() - INTERVAL 24 HOUR`,
      ids
    );
    const existingSet = new Set(existRows.map(r => r.ref_id));
    const newItems = lowWinOpps.filter(o => !existingSet.has(o.id));
    if (newItems.length > 0) {
      const values = newItems.map(o =>
        `('pricing', ${o.id}, '商机"${o.name}"（${o.company_name}）预期金额¥${Number(o.expected_amount).toLocaleString()}但赢率仅${o.win_rate || 0}%，建议重新评估定价策略或加强需求沟通。', 0.70, ${userId})`
      ).join(', ');
      await pool.query(`INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by) VALUES ${values}`);
      created += newItems.length;
    }
  }

  return { created };
}

/**
 * 执行只读查询（Text-to-SQL 专用）
 * @param {object} pool - 数据库连接池（readOnlyPool）
 * @param {string} sql  - 已校验的 SELECT 语句
 * @returns {Promise<Array>} 查询结果行
 */
async function executeReadOnlyQuery(pool, sql) {
  if (!pool) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, '只读数据库连接池未配置');
  }

  // 最终兜底校验：即使路由层校验被绕过，服务层也拒绝任何非 SELECT / 危险 SQL
  const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'AI 查询仅支持 SELECT 语句');
  }

  const dangerous = /\b(UNION|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD\s+DATA|INFORMATION_SCHEMA|SLEEP|BENCHMARK|WAITFOR\s+DELAY)\b/i;
  if (dangerous.test(sql)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'SQL 包含危险关键字，已阻止执行');
  }

  const [rows] = await pool.query(sql);
  return rows;
}

module.exports = { getAiStatus, getAiSuggestions, submitFeedback, generateSuggestions, executeReadOnlyQuery };
