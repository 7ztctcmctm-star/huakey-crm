/**
 * 商机核心服务层
 * 从 routes/opportunity.js 提取的业务逻辑，供路由层复用
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const quoteService = require('./quoteService');
const contractService = require('./contractService');

const STAGE_MAP = {
  1: '询盘',
  2: '需求确认',
  3: '方案报价',
  4: '谈判',
  5: '成交',
  6: '失败'
};

// 默认阶段概率（可通过配置覆盖）
const DEFAULT_STAGE_PROBABILITY = {
  1: 10,
  2: 25,
  3: 50,
  4: 75,
  5: 100,
  6: 0
};

// 阶段回退规则矩阵：定义每个阶段允许回退到的目标阶段
// 规则：只能回退到比当前阶段小的阶段，且不能从成交/失败回退
const BACKWARD_RULES = {
  2: [1],           // 需求确认 → 询盘
  3: [1, 2],        // 方案报价 → 询盘/需求确认
  4: [1, 2, 3],     // 谈判 → 询盘/需求确认/方案报价
  // 5(成交) 和 6(失败) 不允许回退
};

/**
 * 生成商机编号（OPP-YYMMDD-NNN）
 * 参考 quoteService.generateQuoteNo 的模式
 * @param {object} connection - 数据库连接（支持 pool 或 transaction connection）
 * @returns {Promise<string>}
 */
async function generateOpportunityNo(connection) {
  const now = new Date();
  const dateStr = now.getFullYear().toString().slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const [count] = await connection.query(
    "SELECT COUNT(*) as cnt FROM crm_opportunity WHERE opportunity_no LIKE ? FOR UPDATE",
    [`OPP-${dateStr}-%`]
  );
  const seq = String(count[0].cnt + 1).padStart(3, '0');
  return `OPP-${dateStr}-${seq}`;
}

/**
 * 获取商机来源字典列表
 * @param {object} pool
 * @param {boolean} onlyActive - 是否只返回启用的来源
 * @returns {Promise<Array>}
 */
async function getSourceList(pool, onlyActive = true) {
  const where = onlyActive ? 'WHERE is_active = 1' : '';
  const [rows] = await pool.query(
    `SELECT id, name, code, sort_order, is_active, create_time, update_time
     FROM crm_opportunity_source ${where} ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

/**
 * 校验 source_id 是否有效
 * @param {object} pool
 * @param {number|null} sourceId
 * @returns {Promise<void>} 无效时抛出 AppError
 */
async function validateSourceId(pool, sourceId) {
  if (!sourceId) return; // source_id 可空
  const [rows] = await pool.query(
    'SELECT id FROM crm_opportunity_source WHERE id = ? AND is_active = 1',
    [sourceId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机来源不存在或已禁用');
  }
}

/**
 * 查询商机列表（分页、筛选）
 * @param {object} pool
 * @param {object} params - { page, pageSize, name, customer_name, customer_id, stage, owner_id }
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number }}
 */
async function listOpportunities(pool, params = {}, permission = null) {
  const {
    page = 1,
    pageSize = 10,
    name,
    customer_name,
    customer_id,
    stage,
    owner_id,
    source_id,
    opportunity_no
  } = params;

  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  let whereClause = `WHERE ${permissionWhere} AND o.deleted_at IS NULL`;

  if (name) {
    whereClause += ' AND o.name LIKE ?';
    queryParams.push(`%${name}%`);
  }
  if (customer_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${customer_name}%`);
  }
  if (stage !== undefined && stage !== null && stage !== '') {
    whereClause += ' AND o.stage = ?';
    queryParams.push(parseInt(stage));
  }
  if (owner_id) {
    whereClause += ' AND o.owner_id = ?';
    queryParams.push(parseInt(owner_id));
  }
  if (customer_id) {
    whereClause += ' AND o.customer_id = ?';
    queryParams.push(parseInt(customer_id));
  }
  if (source_id) {
    whereClause += ' AND o.source_id = ?';
    queryParams.push(parseInt(source_id));
  }
  if (opportunity_no) {
    whereClause += ' AND o.opportunity_no LIKE ?';
    queryParams.push(`%${opportunity_no}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    ${whereClause}`,
    queryParams
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT
      o.id, o.opportunity_no, o.customer_id, o.name, o.expected_amount, o.expected_date,
      o.stage, o.win_rate, o.remark, o.owner_id, o.source_id, o.create_time, o.update_time,
      c.company_name as customer_name,
      u.real_name as owner_name,
      s.name as source_name,
      DATEDIFF(NOW(), o.update_time) as stagnant_days
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    LEFT JOIN sys_user u ON o.owner_id = u.id
    LEFT JOIN crm_opportunity_source s ON o.source_id = s.id
    ${whereClause}
    ORDER BY o.create_time DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total };
}

/**
 * 获取商机详情
 * @param {object} pool
 * @param {number} opportunityId
 * @returns {object|null}
 */
async function getOpportunity(pool, opportunityId) {
  const [rows] = await pool.query(
    `SELECT
      o.id, o.customer_id, o.name, o.expected_amount, o.expected_date,
      o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
      c.company_name as customer_name,
      u.real_name as owner_name
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    LEFT JOIN sys_user u ON o.owner_id = u.id
    WHERE o.id = ? AND o.deleted_at IS NULL`,
    [opportunityId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * 推进商机阶段（可配置概率）
 * @param {object} pool
 * @param {number} opportunityId
 * @param {number} newStage - 1-6
 * @param {number} changedBy
 * @param {object} [options] - { changeReason?: string, stageProbability?: object }
 * @returns {{ oldStage: number, newStage: number, stageName: string }}
 */
async function advanceStage(pool, opportunityId, newStage, changedBy, options = {}) {
  if (!newStage || newStage < 1 || newStage > 6) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '阶段值无效(1-6)');
  }

  const [rows] = await pool.query(
    'SELECT id, stage FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '商机不存在或无权修改');
  }

  const oldStage = rows[0].stage;
  if (oldStage === 5 || oldStage === 6) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `商机已${oldStage === 5 ? '成交' : '失败'}，不可再推进`);
  }

  // 根据配置概率自动设置赢率
  const probMap = options.stageProbability || DEFAULT_STAGE_PROBABILITY;
  const autoWinRate = probMap[newStage] !== undefined ? probMap[newStage] : null;

  if (autoWinRate !== null) {
    await pool.query(
      'UPDATE crm_opportunity SET stage = ?, win_rate = ?, update_time = NOW() WHERE id = ?',
      [newStage, autoWinRate, opportunityId]
    );
  } else {
    await pool.query(
      'UPDATE crm_opportunity SET stage = ?, update_time = NOW() WHERE id = ?',
      [newStage, opportunityId]
    );
  }

  // 记录阶段变更日志（含 change_reason，migration 103 新增字段）
  const changeReason = options.changeReason || null;
  await pool.query(
    'INSERT INTO crm_opportunity_stage_log (opportunity_id, from_stage, to_stage, change_reason, changed_by) VALUES (?, ?, ?, ?, ?)',
    [opportunityId, oldStage, newStage, changeReason, changedBy]
  );

  return { oldStage, newStage, stageName: STAGE_MAP[newStage] };
}

/**
 * v1.1: 阶段回退（backward）
 * 按 BACKWARD_RULES 矩阵校验允许回退的目标阶段，回退后写 stage_log
 * @param {object} pool
 * @param {number} opportunityId
 * @param {number} targetStage - 回退目标阶段
 * @param {number} changedBy
 * @param {object} [options] - { changeReason?: string }
 * @returns {{ oldStage: number, newStage: number, stageName: string }}
 */
async function backwardStage(pool, opportunityId, targetStage, changedBy, options = {}) {
  if (!targetStage || targetStage < 1 || targetStage > 6) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '阶段值无效(1-6)');
  }

  const [rows] = await pool.query(
    'SELECT id, stage FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '商机不存在或无权修改');
  }

  const oldStage = rows[0].stage;

  // 成交/失败不允许回退
  if (oldStage === 5 || oldStage === 6) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `商机已${oldStage === 5 ? '成交' : '失败'}，不可回退`);
  }

  // 检查回退规则矩阵
  const allowedTargets = BACKWARD_RULES[oldStage] || [];
  if (!allowedTargets.includes(targetStage)) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `阶段 ${STAGE_MAP[oldStage]} 不允许回退到 ${STAGE_MAP[targetStage]}`);
  }

  // 目标阶段必须小于当前阶段（回退方向校验）
  if (targetStage >= oldStage) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回退目标阶段必须小于当前阶段');
  }

  // 更新阶段（回退时重置赢率为目标阶段概率）
  const targetWinRate = DEFAULT_STAGE_PROBABILITY[targetStage];
  await pool.query(
    'UPDATE crm_opportunity SET stage = ?, win_rate = ?, update_time = NOW() WHERE id = ?',
    [targetStage, targetWinRate, opportunityId]
  );

  // 记录阶段变更日志（含 change_reason）
  const changeReason = options.changeReason || null;
  await pool.query(
    'INSERT INTO crm_opportunity_stage_log (opportunity_id, from_stage, to_stage, change_reason, changed_by) VALUES (?, ?, ?, ?, ?)',
    [opportunityId, oldStage, targetStage, changeReason, changedBy]
  );

  return { oldStage, newStage: targetStage, stageName: STAGE_MAP[targetStage] };
}

/**
 * 赢率/金额统计：销售漏斗
 * @param {object} pool
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ total_count: number, total_amount: number, funnel: Array, failed: { count: number, amount: number } }}
 */
async function getFunnelStats(pool, permission = null) {
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }

  const [stageStats] = await pool.query(
    `SELECT
      stage,
      COUNT(*) as count,
      COALESCE(SUM(expected_amount), 0) as total_amount
    FROM crm_opportunity o
    WHERE o.deleted_at IS NULL AND ${permissionWhere}
    GROUP BY stage
    ORDER BY stage`,
    [...permParams]
  );

  const [totalResult] = await pool.query(
    `SELECT
      COUNT(*) as total_count,
      COALESCE(SUM(expected_amount), 0) as total_amount
    FROM crm_opportunity o
    WHERE o.deleted_at IS NULL AND ${permissionWhere}`,
    [...permParams]
  );

  const funnel = [];
  let cumulativeCount = 0;

  for (let s = 1; s <= 5; s++) {
    const stat = stageStats.find(item => item.stage === s) || { count: 0, total_amount: 0 };
    cumulativeCount += stat.count;
    funnel.push({
      stage: s,
      stage_name: STAGE_MAP[s],
      count: stat.count,
      amount: parseFloat(stat.total_amount),
      cumulative_count: cumulativeCount,
      win_rate: DEFAULT_STAGE_PROBABILITY[s] || 0
    });
  }

  const failed = stageStats.find(item => item.stage === 6);

  return {
    total_count: totalResult[0].total_count,
    total_amount: parseFloat(totalResult[0].total_amount),
    funnel,
    failed: {
      count: failed ? failed.count : 0,
      amount: failed ? parseFloat(failed.total_amount) : 0
    }
  };
}

/**
 * 获取商机阶段停留时间统计
 * @param {object} pool
 * @param {number} opportunityId
 * @returns {{ stages: Array, total_hours: number }}
 */
async function getStageStats(pool, opportunityId) {
  const [stats] = await pool.query(
    `SELECT
      to_stage as stage,
      SUM(
        TIMESTAMPDIFF(HOUR, changed_at,
          COALESCE(
            (SELECT MIN(changed_at) FROM crm_opportunity_stage_log
             WHERE opportunity_id = ? AND changed_at > l.changed_at),
            NOW()
          )
        )
      ) as hours
    FROM crm_opportunity_stage_log l
    WHERE opportunity_id = ?
    GROUP BY to_stage
    ORDER BY stage`,
    [opportunityId, opportunityId]
  );

  const stages = stats.map(s => ({
    stage: s.stage,
    name: STAGE_MAP[s.stage] || '未知',
    hours: s.hours || 0
  }));

  const totalHours = stages.reduce((sum, s) => sum + s.hours, 0);

  return { stages, total_hours: totalHours };
}

/**
 * 创建商机
 * @param {object} pool
 * @param {object} data - { customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id }
 * @param {number} userId
 * @returns {{ id: number }}
 */
async function createOpportunity(pool, data, userId) {
  const [customers] = await pool.query('SELECT id, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [data.customer_id]);
  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }
  // FIX-1: 放宽商机创建条件 - 允许 following/quoted/negotiating/signed 状态的客户创建商机
  // 原规则要求 status='signed' 违背销售漏斗（商机应在签约前就存在）
  // 注意：此处仅读取 customer.status，不修改客户数据（遵守领域边界约束）
  const allowedStatuses = ['following', 'quoted', 'negotiating', 'signed'];
  if (!allowedStatuses.includes(customers[0].status)) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '只能为跟进中/已报价/谈判中/已签约的客户创建商机');
  }

  // v1.1: 校验 source_id 有效性
  await validateSourceId(pool, data.source_id);

  // v1.1: 生成商机编号
  const opportunityNo = await generateOpportunityNo(pool);

  const finalOwnerId = data.owner_id || userId;
  const [result] = await pool.query(
    `INSERT INTO crm_opportunity (customer_id, name, opportunity_no, source_id, expected_amount, expected_date, stage, win_rate, remark, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.customer_id, data.name, opportunityNo, data.source_id || null, data.expected_amount || 0, data.expected_date || null, data.stage || 1, data.win_rate !== undefined ? data.win_rate : 10, data.remark || null, finalOwnerId]
  );
  return { id: result.insertId, opportunity_no: opportunityNo };
}

/**
 * 更新商机
 * @param {object} pool
 * @param {number} id
 * @param {object} data - 可更新字段
 * @returns {object} 旧数据（用于日志）
 */
async function updateOpportunity(pool, id, data) {
  const [rows] = await pool.query(
    'SELECT id, customer_id, name, opportunity_no, source_id, expected_amount, expected_date, stage, win_rate, remark, owner_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '商机不存在或无权修改');
  }
  const oldData = rows[0];

  // v1.1: 如需更新 source_id，先校验有效性
  if (data.source_id !== undefined && data.source_id !== null) {
    await validateSourceId(pool, data.source_id);
  }

  const updates = [];
  const params = [];
  // v1.1: 新增 source_id 可更新字段（opportunity_no 不允许更新）
  const fields = ['customer_id', 'name', 'expected_amount', 'expected_date', 'stage', 'win_rate', 'remark', 'owner_id', 'source_id'];
  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(data[field]);
    }
  }
  if (updates.length === 0) return oldData;
  params.push(id);
  await pool.query(`UPDATE crm_opportunity SET ${updates.join(', ')} WHERE id = ?`, params);
  return oldData;
}

/**
 * 删除商机（软删除）
 * @param {object} pool
 * @param {number} id
 */
async function deleteOpportunity(pool, id) {
  await pool.query('UPDATE crm_opportunity SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * 获取商机（用于权限校验，返回 owner_id）
 * @param {object} pool
 * @param {number} id
 * @returns {object|null}
 */
async function getOpportunityForPermission(pool, id) {
  const [rows] = await pool.query('SELECT id, owner_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL', [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 获取商机详情（带数据权限校验）
 * @param {object} pool
 * @param {number} id
 * @param {object} [permission] - { clause, params }
 * @returns {object|null}
 */
async function getOpportunityWithPermission(pool, id, permission = null) {
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }

  const [rows] = await pool.query(
    `SELECT o.id, o.opportunity_no, o.customer_id, o.name, o.source_id, o.expected_amount, o.expected_date, o.stage, o.win_rate, o.remark, o.lost_reason, o.owner_id, o.create_time, o.update_time,
      c.company_name as customer_name, u.real_name as owner_name, s.name as source_name
     FROM crm_opportunity o
     LEFT JOIN crm_customer c ON o.customer_id = c.id
     LEFT JOIN sys_user u ON o.owner_id = u.id
     LEFT JOIN crm_opportunity_source s ON o.source_id = s.id
     WHERE o.id = ? AND o.deleted_at IS NULL AND ${permissionWhere}`,
    [id, ...permParams]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 获取阶段日志
 * @param {object} pool
 * @param {number} opportunityId
 * @returns {Array}
 */
async function getStageLog(pool, opportunityId) {
  const [logs] = await pool.query(
    `SELECT l.id, l.from_stage, l.to_stage, l.change_reason, l.changed_at, l.create_time,
      u.real_name as changed_by_name,
      TIMESTAMPDIFF(HOUR, l.changed_at,
        COALESCE(
          (SELECT MIN(changed_at) FROM crm_opportunity_stage_log WHERE opportunity_id = l.opportunity_id AND changed_at > l.changed_at),
          NOW()
        )
      ) as hours_in_stage
     FROM crm_opportunity_stage_log l LEFT JOIN sys_user u ON l.changed_by = u.id
     WHERE l.opportunity_id = ? ORDER BY l.changed_at DESC`, [opportunityId]);
  return logs;
}

/**
 * 从商机创建报价单（Prompt 4-3-3）
 * 创建后推进商机到 stage 3（方案报价）
 * @param {object} pool
 * @param {number} opportunityId
 * @param {object} quoteData - 报价单数据（不含 customer_id / opportunity_id，由本方法注入）
 * @param {number} userId
 * @returns {object} - { id, quote_no }
 */
async function createQuoteFromOpportunity(pool, opportunityId, quoteData, userId) {
  const [rows] = await pool.query(
    'SELECT id, customer_id, name FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机不存在');
  }

  const opp = rows[0];
  const data = {
    ...quoteData,
    customer_id: opp.customer_id,
    opportunity_id: opp.id,
    advance_status: false // 不让 createQuote 自动推进客户状态，这里单独推进商机
  };

  const result = await quoteService.createQuote(pool, data, userId);

  // 推进商机到 stage 3（方案报价），不阻塞主流程
  try {
    await advanceStage(pool, opportunityId, 3, userId, { changeReason: '创建报价单自动推进' });
  } catch (e) {
    // 商机已在 stage 3+ 时不推进，不报错
  }

  return result;
}

/**
 * 从商机创建合同（Prompt 4-3-3）
 * 创建后推进商机到 stage 5（成交）
 * @param {object} pool
 * @param {number} opportunityId
 * @param {object} contractData - 合同数据（不含 customer_id / opportunity_id，由本方法注入）
 * @param {number} userId
 * @returns {object} - { id, contract_no }
 */
async function createContractFromOpportunity(pool, opportunityId, contractData, userId) {
  const [rows] = await pool.query(
    'SELECT id, customer_id, name FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机不存在');
  }

  const opp = rows[0];
  const data = {
    ...contractData,
    customer_id: opp.customer_id,
    opportunity_id: opp.id
  };

  const result = await contractService.createContract(pool, data, userId);

  // 推进商机到 stage 5（成交），不阻塞主流程
  try {
    await advanceStage(pool, opportunityId, 5, userId, { changeReason: '创建合同自动推进' });
  } catch (e) {
    // 商机已在 stage 5+ 时不推进，不报错
  }

  return result;
}

/**
 * 获取商机销售时间轴（Prompt 4-3-7）
 * 聚合商机阶段日志 + 报价单 + 合同，按时间排序
 * @param {object} pool
 * @param {number} opportunityId
 * @returns {Array} 时间轴事件列表
 */
async function getTimeline(pool, opportunityId) {
  const [opp] = await pool.query(
    'SELECT id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (!opp.length) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机不存在');
  }

  const [stageLogs] = await pool.query(
    `SELECT 'stage_change' as type, l.id, l.from_stage, l.to_stage, l.changed_at as event_time,
       u.real_name as user_name
     FROM crm_opportunity_stage_log l
     LEFT JOIN sys_user u ON l.changed_by = u.id
     WHERE l.opportunity_id = ?`,
    [opportunityId]
  );

  const [quotes] = await pool.query(
    `SELECT 'quote' as type, q.id, q.quote_no, q.amount, q.final_amount, q.status, q.create_time as event_time,
       u.real_name as user_name
     FROM crm_quote q
     LEFT JOIN sys_user u ON q.create_by = u.id
     WHERE q.opportunity_id = ? AND q.deleted_at IS NULL`,
    [opportunityId]
  );

  const [contracts] = await pool.query(
    `SELECT 'contract' as type, c.id, c.contract_no, c.amount, c.status, c.sign_date, c.create_time as event_time,
       u.real_name as user_name
     FROM crm_contract c
     LEFT JOIN sys_user u ON c.create_by = u.id
     WHERE c.opportunity_id = ? AND c.deleted_at IS NULL`,
    [opportunityId]
  );

  const events = [
    ...stageLogs.map(e => ({ ...e, stage_name: STAGE_MAP[e.to_stage] })),
    ...quotes,
    ...contracts
  ].sort((a, b) => new Date(b.event_time) - new Date(a.event_time));

  return events;
}

module.exports = {
  STAGE_MAP,
  DEFAULT_STAGE_PROBABILITY,
  BACKWARD_RULES,
  listOpportunities,
  getOpportunity,
  getOpportunityWithPermission,
  getOpportunityForPermission,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  advanceStage,
  backwardStage,
  getFunnelStats,
  getStageStats,
  getStageLog,
  getSourceList,
  createQuoteFromOpportunity,
  createContractFromOpportunity,
  getTimeline
};
