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
 * Text-to-SQL 维度白名单
 * PRD R-09：自然语言查询仅限「商机 / 客户（只读）/ 合同」维度可用。
 * 任何触及白名单之外的表（含 crm_supplier / crm_product / crm_follow_up 等）一律拒绝。
 */
const ALLOWED_QUERY_TABLES = ['crm_opportunity', 'crm_customer', 'crm_contract'];

/**
 * 从 SQL 中提取被查询的表名（FROM / JOIN 之后，单个标识符）。
 * 仅用于白名单校验，不追求穷尽所有 SQL 写法（如逗号连接会只拿到第一张表）；
 * 取不到表名时由调用方按「无法识别维度」拒绝，宁严勿松。
 * @param {string} sql
 * @returns {string[]}
 */
function extractTables(sql) {
  const matches = sql.match(/\b(?:FROM|JOIN)\s+`?([a-zA-Z0-9_]+)`?/gi) || [];
  return matches.map(m =>
    m.replace(/\b(?:FROM|JOIN)\s+`?/i, '').replace(/`/g, '').toLowerCase()
  );
}

/**
 * 校验 AI 生成的 SQL 是否仅在允许的维度内（商机/客户/合同）。
 * 即便路由层已挡过系统表，这里再做一次维度收敛，符合 PRD R-09。
 * @param {string} sql
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateQueryDimension(sql) {
  const tables = extractTables(sql);
  if (tables.length === 0) {
    return { ok: false, reason: '无法识别查询维度。AI 查询仅支持「商机 / 客户 / 合同」维度，请换个问法。' };
  }
  const forbidden = [...new Set(tables)].filter(t => !ALLOWED_QUERY_TABLES.includes(t));
  if (forbidden.length > 0) {
    return {
      ok: false,
      reason: `不支持查询「${forbidden.join('、')}」。AI 查询仅限「商机 / 客户（只读）/ 合同」维度。`
    };
  }
  return { ok: true };
}

/** 是否为数值（含 DECIMAL 返回的字符串形态） */
function isNumericCell(v) {
  if (v === null || v === undefined) return true; // NULL 视为可参与数值列
  return /^-?\d+(\.\d+)?$/.test(String(v).trim());
}

/**
 * 根据 SQL 与结果集，给出确定性的图表建议（不依赖 LLM，避免 Ollama 不可用时失效）。
 * @param {string} sql
 * @param {Array<object>} rows
 * @returns {{ type: 'bar'|'pie'|'line'|'table', reason: string }}
 */
function buildChartSuggestion(sql, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { type: 'table', reason: '查询结果为空，建议以表格查看。' };
  }

  const cols = Object.keys(rows[0]);
  const numericCols = cols.filter(c => rows.every(r => isNumericCell(r[c])));
  let dimCols = cols.filter(c => !numericCols.includes(c));
  // 整数维度列（如 owner_id）按 GROUP BY 分组时语义是维度而非度量 → 补回，
  // 否则会被当作度量、dimCols 为空而误判为「结构复杂 → table」（R-09 图表建议）。
  if (dimCols.length === 0) {
    const gm = /group\s+by\s+([`\w.]+)/i.exec(sql || '');
    const g = gm && gm[1].replace(/`/g, '').split('.').pop();
    if (g && cols.includes(g)) dimCols = [g];
  }

  // 单一汇总值（如 COUNT(*)）→ 数字即可，无需图表
  if (rows.length === 1 && numericCols.length >= 1 && dimCols.length === 0) {
    return { type: 'table', reason: '结果为单一汇总数值，直接查看数字即可。' };
  }

  if (numericCols.length === 0) {
    return { type: 'table', reason: '结果无数值列，建议以表格查看。' };
  }

  const measure = numericCols.find(c => !dimCols.includes(c)) || numericCols[0];
  // 含日期/时间维度的趋势 → 折线图
  const timeCol = dimCols.find(c => /date|time|月份|月|year|month|day|日期|周/i.test(c));
  if (timeCol) {
    return { type: 'line', reason: `检测到时间维度「${timeCol}」，建议用折线图观察「${measure}」趋势。` };
  }

  if (dimCols.length >= 1) {
    const dim = dimCols[0];
    const catCount = new Set(rows.map(r => r[dim])).size;
    const type = catCount <= 6 ? 'pie' : 'bar';
    return {
      type,
      reason: `检测到维度「${dim}」与数值「${measure}」，建议用${type === 'pie' ? '饼图对比占比' : '柱状图对比大小'}。`
    };
  }

  return { type: 'table', reason: '字段结构较复杂，建议以表格查看。' };
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

module.exports = {
  getAiStatus,
  getAiSuggestions,
  submitFeedback,
  generateSuggestions,
  executeReadOnlyQuery,
  ALLOWED_QUERY_TABLES,
  extractTables,
  validateQueryDimension,
  buildChartSuggestion
};
