/**
 * 商机核心服务层
 * 从 routes/opportunity.js 提取的业务逻辑，供路由层复用
 */

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
    owner_id
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

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    ${whereClause}`,
    queryParams
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT
      o.id, o.customer_id, o.name, o.expected_amount, o.expected_date,
      o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
      c.company_name as customer_name,
      u.real_name as owner_name,
      DATEDIFF(NOW(), o.update_time) as stagnant_days
    FROM crm_opportunity o
    LEFT JOIN crm_customer c ON o.customer_id = c.id
    LEFT JOIN sys_user u ON o.owner_id = u.id
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
 * @param {object} [stageProbability] - 可选的阶段概率配置 { 1: 10, 2: 25, ... }
 * @returns {{ oldStage: number, newStage: number, stageName: string }}
 */
async function advanceStage(pool, opportunityId, newStage, changedBy, stageProbability = null) {
  if (!newStage || newStage < 1 || newStage > 6) {
    const err = new Error('阶段值无效(1-6)');
    err.code = 400;
    throw err;
  }

  const [rows] = await pool.query(
    'SELECT id, stage FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [opportunityId]
  );
  if (rows.length === 0) {
    const err = new Error('商机不存在或无权修改');
    err.code = 403;
    throw err;
  }

  const oldStage = rows[0].stage;
  if (oldStage === 5 || oldStage === 6) {
    const err = new Error(`商机已${oldStage === 5 ? '成交' : '失败'}，不可再推进`);
    err.code = 400;
    throw err;
  }

  // 根据配置概率自动设置赢率
  const probMap = stageProbability || DEFAULT_STAGE_PROBABILITY;
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

  // 记录阶段变更日志
  await pool.query(
    'INSERT INTO crm_opportunity_stage_log (opportunity_id, from_stage, to_stage, changed_by) VALUES (?, ?, ?, ?)',
    [opportunityId, oldStage, newStage, changedBy]
  );

  return { oldStage, newStage, stageName: STAGE_MAP[newStage] };
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
  const [customers] = await pool.query('SELECT id, status FROM crm_customer WHERE id = ? AND status != 0', [data.customer_id]);
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }
  if (customers[0].status !== 2) {
    const err = new Error('只能为正式客户创建商机，请先将客户转化为正式客户');
    err.code = 400;
    throw err;
  }

  const finalOwnerId = data.owner_id || userId;
  const [result] = await pool.query(
    `INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.customer_id, data.name, data.expected_amount || 0, data.expected_date || null, data.stage || 1, data.win_rate !== undefined ? data.win_rate : 10, data.remark || null, finalOwnerId]
  );
  return { id: result.insertId };
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
    'SELECT id, customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('商机不存在或无权修改');
    err.code = 403;
    throw err;
  }
  const oldData = rows[0];

  const updates = [];
  const params = [];
  const fields = ['customer_id', 'name', 'expected_amount', 'expected_date', 'stage', 'win_rate', 'remark', 'owner_id'];
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
    `SELECT o.id, o.customer_id, o.name, o.expected_amount, o.expected_date, o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
      c.company_name as customer_name, u.real_name as owner_name
     FROM crm_opportunity o
     LEFT JOIN crm_customer c ON o.customer_id = c.id
     LEFT JOIN sys_user u ON o.owner_id = u.id
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

module.exports = {
  STAGE_MAP,
  DEFAULT_STAGE_PROBABILITY,
  listOpportunities,
  getOpportunity,
  getOpportunityWithPermission,
  getOpportunityForPermission,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  advanceStage,
  getFunnelStats,
  getStageStats,
  getStageLog
};
