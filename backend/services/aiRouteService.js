/**
 * AI助手服务层
 * 从 routes/ai.js 提取的数据库操作
 */

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
    `SELECT s.*, u.real_name as creator_name
     FROM crm_ai_suggestion s
     LEFT JOIN sys_user u ON s.create_by = u.id
     WHERE ${whereClause}
     ORDER BY s.create_time DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  // 补充关联数据
  for (const item of list) {
    if (item.type === 'follow_up' || item.type === 'customer') {
      const [customer] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ?', [item.ref_id]);
      item.ref_name = customer[0]?.company_name || '未知客户';
    } else if (item.type === 'opportunity' || item.type === 'pricing') {
      const [opp] = await pool.query('SELECT name, expected_amount, customer_id FROM crm_opportunity WHERE id = ?', [item.ref_id]);
      item.ref_name = opp[0]?.name || '未知商机';
      item.expected_amount = opp[0]?.expected_amount;
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

  for (const c of overdueCustomers) {
    const [exists] = await pool.query(
      "SELECT id FROM crm_ai_suggestion WHERE type = 'follow_up' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
      [c.id]
    );
    if (exists.length === 0) {
      await pool.query(
        `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
         VALUES ('follow_up', ?, ?, ?, ?)`,
        [c.id, `客户"${c.company_name}"已${c.overdue_days}天未跟进，建议立即安排回访或联系沟通。`, 0.85, userId]
      );
      created++;
    }
  }

  // 2. 商机停滞建议
  const [staleOpps] = await pool.query(`
    SELECT o.id, o.name, o.expected_amount, o.stage, o.update_time,
           DATEDIFF(NOW(), o.update_time) as stale_days, c.company_name
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    WHERE o.stage NOT IN (5, 6) AND o.update_time < NOW() - INTERVAL 14 DAY
    LIMIT 20
  `);

  for (const o of staleOpps) {
    const [exists] = await pool.query(
      "SELECT id FROM crm_ai_suggestion WHERE type = 'opportunity' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
      [o.id]
    );
    if (exists.length === 0) {
      await pool.query(
        `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
         VALUES ('opportunity', ?, ?, ?, ?)`,
        [o.id, `商机"${o.name}"（${o.company_name}）在当前阶段已停滞${o.stale_days}天，建议推进或重新评估。`, 0.75, userId]
      );
      created++;
    }
  }

  // 3. 高金额低赢率商机建议
  const [lowWinOpps] = await pool.query(`
    SELECT o.id, o.name, o.expected_amount, o.win_rate, c.company_name
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    WHERE o.stage NOT IN (5, 6) AND o.expected_amount >= 100000 AND (o.win_rate IS NULL OR o.win_rate < 30)
    LIMIT 10
  `);

  for (const o of lowWinOpps) {
    const [exists] = await pool.query(
      "SELECT id FROM crm_ai_suggestion WHERE type = 'pricing' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
      [o.id]
    );
    if (exists.length === 0) {
      await pool.query(
        `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
         VALUES ('pricing', ?, ?, ?, ?)`,
        [o.id, `商机"${o.name}"（${o.company_name}）预期金额¥${Number(o.expected_amount).toLocaleString()}但赢率仅${o.win_rate || 0}%，建议重新评估定价策略或加强需求沟通。`, 0.70, userId]
      );
      created++;
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
  const [rows] = await pool.query(sql);
  return rows;
}

module.exports = { getAiStatus, getAiSuggestions, submitFeedback, generateSuggestions, executeReadOnlyQuery };
