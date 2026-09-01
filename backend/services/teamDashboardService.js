/**
 * 团队看板服务层
 * 从 routes/teamDashboard.js 提取的业务逻辑
 */

const ROLES = require('../config/roles');
const { getOverdueDays, getConfig } = require('../utils/config');

/**
 * 团队总览卡片数据
 */
async function getOverview(pool, { userId, isBoss, startDate, endDate }) {
  const dateFilter = startDate && endDate;
  let userFilter = '';
  const params = [];
  if (!isBoss) {
    userFilter = ' AND c.owner_id = ?';
    params.push(userId);
  }

  const [totalCustomers] = await pool.query(
    `SELECT COUNT(*) as count FROM crm_customer c WHERE c.deleted_at IS NULL ${userFilter}`,
    params
  );

  const [weekNew] = await pool.query(
    `SELECT COUNT(*) as count FROM crm_customer c
     WHERE c.deleted_at IS NULL AND YEAR(c.create_time) = YEAR(NOW()) AND WEEK(c.create_time, 1) = WEEK(NOW(), 1) ${userFilter}`,
    params
  );

  const [activeOpps] = await pool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as total_amount
     FROM crm_opportunity
     WHERE stage NOT IN (5, 6) ${isBoss ? '' : ' AND owner_id = ?'}`,
    isBoss ? [] : [userId]
  );

  const overdueDays = await getOverdueDays();
  const [overdueCount] = await pool.query(
    `SELECT COUNT(*) as count FROM crm_customer c
     WHERE c.status NOT IN (2, 3) AND c.deleted_at IS NULL
       AND (c.last_follow_time IS NULL
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       ${userFilter}`,
    [...params, overdueDays]
  );

  const oppUserFilter = isBoss ? '' : ' AND o.owner_id = ?';
  const oppParams = isBoss ? [] : [userId];
  let contractDateClause, paymentDateClause;
  if (dateFilter) {
    contractDateClause = 'ct.create_time >= ? AND ct.create_time < ?';
    paymentDateClause = 'p.pay_date >= ? AND p.pay_date < ?';
    oppParams.push(startDate, endDate + ' 23:59:59');
  } else {
    contractDateClause = 'YEAR(ct.create_time) = YEAR(NOW()) AND MONTH(ct.create_time) = MONTH(NOW())';
    paymentDateClause = 'YEAR(p.pay_date) = YEAR(NOW()) AND MONTH(p.pay_date) = MONTH(NOW())';
  }

  const [contractAmount] = await pool.query(
    `SELECT COALESCE(SUM(ct.amount), 0) as total
     FROM crm_contract ct
     LEFT JOIN crm_opportunity o ON ct.opportunity_id = o.id
     WHERE ct.deleted_at IS NULL AND ${contractDateClause} ${oppUserFilter}`,
    oppParams
  );

  const [paymentAmount] = await pool.query(
    `SELECT COALESCE(SUM(p.pay_amount), 0) as total
     FROM crm_payment p
     LEFT JOIN crm_contract ct ON p.contract_id = ct.id
     LEFT JOIN crm_opportunity o ON ct.opportunity_id = o.id
     WHERE p.deleted_at IS NULL AND ${paymentDateClause} ${oppUserFilter}`,
    oppParams
  );

  const targetUserFilter = isBoss ? '' : ' AND t.user_id = ?';
  const targetParams = isBoss ? [] : [userId];
  let targetYear, targetMonth;
  if (dateFilter) {
    targetYear = new Date(startDate).getFullYear();
    targetMonth = new Date(startDate).getMonth() + 1;
  } else {
    targetYear = new Date().getFullYear();
    targetMonth = new Date().getMonth() + 1;
  }
  const [targetResult] = await pool.query(
    `SELECT COALESCE(SUM(t.target_amount), 0) as target_total
     FROM crm_sales_target t
     WHERE t.year = ? AND t.month = ? ${targetUserFilter}`,
    [targetYear, targetMonth, ...targetParams]
  );

  const targetTotal = parseFloat(targetResult[0].target_total) || 0;
  const contractTotal = parseFloat(contractAmount[0].total) || 0;
  const targetAchievement = targetTotal > 0
    ? Math.round((contractTotal / targetTotal) * 100)
    : 0;

  return {
    total_customers: totalCustomers[0].count,
    week_new: weekNew[0].count,
    active_opportunities: activeOpps[0].count,
    active_opportunity_amount: activeOpps[0].total_amount?.toString() || '0',
    overdue_count: overdueCount[0].count,
    contract_amount: contractTotal,
    payment_amount: parseFloat(paymentAmount[0].total) || 0,
    target_achievement: targetAchievement
  };
}

/**
 * 每个销售的实况卡片（聚合查询替代N+1）
 */
async function getSalesBreakdown(pool, { userId, isBoss }) {
  const userFilter = isBoss ? '' : 'AND u.id = ?';
  const userParams = isBoss ? [] : [userId];

  const [salesUsers] = await pool.query(
    `SELECT u.id, u.real_name, u.username, d.name as dept_name
     FROM sys_user u
     LEFT JOIN sys_dept d ON u.dept_id = d.id
     LEFT JOIN sys_role r ON u.role_id = r.id
     WHERE u.status = 1 AND r.code IN ('sales') -- 旧码 sales_manager/tech 现库已不存在，实况卡片仅列 sales
     ${userFilter}
     ORDER BY d.name, u.real_name`,
    userParams
  );

  if (salesUsers.length === 0) return [];

  const userIds = salesUsers.map(u => u.id);
  const placeholders = userIds.map(() => '?').join(',');

  const overdueDays = await getOverdueDays();
  const [aggStats] = await pool.query(`
    SELECT
      u.id as user_id,
      COALESCE(cc.cnt, 0) as customer_count,
      COALESCE(oc.cnt, 0) as active_opp_count,
      COALESCE(oc.amount, 0) as active_opp_amount,
      COALESCE(ca.total, 0) as contract_amount,
      COALESCE(pa.total, 0) as payment_amount,
      COALESCE(nf.cnt, 0) as no_follow_count
    FROM sys_user u
    LEFT JOIN (
      SELECT owner_id, COUNT(*) as cnt FROM crm_customer
      WHERE owner_id IN (${placeholders}) AND deleted_at IS NULL
      GROUP BY owner_id
    ) cc ON cc.owner_id = u.id
    LEFT JOIN (
      SELECT owner_id, COUNT(*) as cnt, COALESCE(SUM(expected_amount), 0) as amount
      FROM crm_opportunity
      WHERE owner_id IN (${placeholders}) AND stage NOT IN (5, 6)
      GROUP BY owner_id
    ) oc ON oc.owner_id = u.id
    LEFT JOIN (
      SELECT o.owner_id, COALESCE(SUM(ct.amount), 0) as total
      FROM crm_contract ct
      LEFT JOIN crm_opportunity o ON ct.opportunity_id = o.id
      WHERE ct.deleted_at IS NULL AND o.owner_id IN (${placeholders})
        AND ct.create_time >= DATE_FORMAT(NOW(), '%Y-%m-01')
        AND ct.create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
      GROUP BY o.owner_id
    ) ca ON ca.owner_id = u.id
    LEFT JOIN (
      SELECT o.owner_id, COALESCE(SUM(p.pay_amount), 0) as total
      FROM crm_payment p
      LEFT JOIN crm_contract ct ON p.contract_id = ct.id
      LEFT JOIN crm_opportunity o ON ct.opportunity_id = o.id
      WHERE p.deleted_at IS NULL AND o.owner_id IN (${placeholders})
        AND p.pay_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
        AND p.pay_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
      GROUP BY o.owner_id
    ) pa ON pa.owner_id = u.id
    LEFT JOIN (
      SELECT owner_id, COUNT(*) as cnt FROM crm_customer
      WHERE owner_id IN (${placeholders}) AND status NOT IN (2, 3) AND deleted_at IS NULL
        AND (last_follow_time IS NULL OR last_follow_time < NOW() - INTERVAL ? DAY)
      GROUP BY owner_id
    ) nf ON nf.owner_id = u.id
    WHERE u.id IN (${placeholders})`,
    [...userIds, ...userIds, ...userIds, ...userIds, ...userIds, overdueDays, ...userIds]
  );

  const [taskStats] = await pool.query(`
    SELECT user_id, SUM(cnt) as task_count FROM (
      SELECT create_by as user_id, COUNT(*) as cnt FROM crm_follow_up
      WHERE create_by IN (${placeholders}) AND next_time IS NOT NULL AND DATE(next_time) = CURRENT_DATE
      GROUP BY create_by
      UNION ALL
      SELECT assignee_id as user_id, COUNT(*) as cnt FROM crm_service_order
      WHERE assignee_id IN (${placeholders}) AND status IN (1, 2)
      GROUP BY assignee_id
    ) t GROUP BY user_id`,
    [...userIds, ...userIds]
  );

  const [targetStats] = await pool.query(`
    SELECT user_id, COALESCE(SUM(target_amount), 0) as total
    FROM crm_sales_target
    WHERE user_id IN (${placeholders}) AND year = YEAR(NOW()) AND month = MONTH(NOW())
    GROUP BY user_id`,
    userIds
  );

  const statsMap = new Map(aggStats.map(s => [s.user_id, s]));
  const taskMap = new Map(taskStats.map(t => [t.user_id, t.task_count]));
  const targetMap = new Map(targetStats.map(t => [t.user_id, t.total]));

  return salesUsers.map(user => {
    const stats = statsMap.get(user.id) || {};
    const contractAmount = parseFloat(stats.contract_amount) || 0;
    const targetAmount = parseFloat(targetMap.get(user.id)) || 0;

    return {
      user_id: user.id,
      real_name: user.real_name,
      username: user.username,
      dept_name: user.dept_name,
      customer_count: stats.customer_count || 0,
      active_opp_count: stats.active_opp_count || 0,
      active_opp_amount: (stats.active_opp_amount || 0).toString(),
      today_tasks: taskMap.get(user.id) || 0,
      no_follow_count: stats.no_follow_count || 0,
      contract_amount: contractAmount,
      payment_amount: parseFloat(stats.payment_amount) || 0,
      target_amount: targetAmount,
      target_achievement: targetAmount > 0 ? Math.round((contractAmount / targetAmount) * 100) : 0
    };
  });
}

/**
 * 某个销售的逾期未跟进客户明细
 */
async function getSalesOverdueCustomers(pool, { user_id, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const overdueDays = await getOverdueDays();

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer
     WHERE owner_id = ? AND status NOT IN (2, 3) AND deleted_at IS NULL
       AND (last_follow_time IS NULL
         OR last_follow_time < NOW() - INTERVAL ? DAY)`,
    [user_id, overdueDays]
  );

  const [list] = await pool.query(
    `SELECT id, company_name, contact_name, phone, level, status,
            last_follow_time, create_time,
            DATEDIFF(NOW(), COALESCE(last_follow_time, create_time)) as overdue_days
     FROM crm_customer
     WHERE owner_id = ? AND status NOT IN (2, 3) AND deleted_at IS NULL
       AND (last_follow_time IS NULL
         OR last_follow_time < NOW() - INTERVAL ? DAY)
     ORDER BY overdue_days DESC
     LIMIT ? OFFSET ?`,
    [user_id, overdueDays, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 某个销售的所有客户列表
 */
async function getSalesCustomers(pool, { user_id, page, pageSize }) {
  const offset = (page - 1) * pageSize;

  const [countResult] = await pool.query(
    'SELECT COUNT(*) as total FROM crm_customer WHERE owner_id = ? AND deleted_at IS NULL',
    [user_id]
  );

  const [list] = await pool.query(
    `SELECT id, company_name, contact_name, phone, source, level, status,
            last_follow_time, create_time
     FROM crm_customer
     WHERE owner_id = ? AND deleted_at IS NULL
     ORDER BY last_follow_time IS NULL ASC, last_follow_time DESC, create_time DESC
     LIMIT ? OFFSET ?`,
    [user_id, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 催办：主管对销售员的逾期客户发起跟进催促
 */
async function urgeFollowup(pool, { customer_id, user_id, senderUserId }) {
  // 验证客户存在且属于该销售员
  const [customers] = await pool.query(
    'SELECT id, company_name FROM crm_customer WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
    [customer_id, user_id]
  );
  if (customers.length === 0) return { error: 'not_found' };

  // 防重复：同一天同一客户不重复催办
  const [existing] = await pool.query(
    `SELECT id FROM crm_notification
     WHERE type = 'urge_followup' AND business_type = 'customer' AND business_id = ?
       AND to_user_id = ? AND is_dismissed = 0
       AND DATE(create_time) = CURRENT_DATE`,
    [customer_id, user_id]
  );
  if (existing.length > 0) return { error: 'duplicate' };

  const [senderInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [senderUserId]);
  const senderName = senderInfo.length > 0 ? senderInfo[0].real_name : '主管';
  const companyName = customers[0].company_name;

  await pool.query(
    `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
     VALUES ('urge_followup', '跟进催办', ?, 'customer', ?, ?, ?)`,
    [`${senderName} 催促您跟进客户"${companyName}"，请及时处理`, customer_id, senderUserId, user_id]
  );

  return { success: true };
}

/**
 * 待审批列表（报价+合同）
 */
async function getPendingApprovals(pool, { roleId }) {
  const [notifications] = await pool.query(
    `SELECT n.id, n.type, n.business_type, n.business_id, n.content, n.from_user_id,
            u.real_name as from_user_name, n.create_time
     FROM crm_notification n
     LEFT JOIN sys_user u ON n.from_user_id = u.id
     WHERE n.to_role_id = ? AND n.is_dismissed = 0
       AND n.type IN ('quote_approval', 'contract_approval')
     ORDER BY n.create_time DESC
     LIMIT 20`,
    [roleId]
  );

  for (const item of notifications) {
    if (item.business_type === 'quote') {
      const [rows] = await pool.query(
        'SELECT quote_no, final_amount FROM crm_quote WHERE id = ? AND deleted_at IS NULL',
        [item.business_id]
      );
      if (rows.length > 0) {
        item.biz_no = rows[0].quote_no;
        item.biz_amount = rows[0].final_amount;
      }
    } else if (item.business_type === 'contract') {
      const [rows] = await pool.query(
        'SELECT contract_no, amount FROM crm_contract WHERE id = ? AND deleted_at IS NULL',
        [item.business_id]
      );
      if (rows.length > 0) {
        item.biz_no = rows[0].contract_no;
        item.biz_amount = rows[0].amount;
      }
    }
  }

  return notifications;
}

/**
 * 卡住的商机（阶段停留超过N天未推进）
 */
async function getStuckOpportunities(pool, { userId, viewAll, roleId }) {
  const stuckDays = parseInt(await getConfig('opportunity_stuck_days', '14')) || 14;

  let deptFilter = '';
  const params = [stuckDays];

  if (!viewAll && roleId !== ROLES.ADMIN) {
    const [deptUsers] = await pool.query(
      'SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?)',
      [userId]
    );
    const userIds = deptUsers.map(u => u.id);
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      deptFilter = ` AND o.owner_id IN (${placeholders})`;
      params.push(...userIds);
    } else {
      deptFilter = ' AND o.owner_id = ?';
      params.push(userId);
    }
  }

  const [list] = await pool.query(
    `SELECT o.id, o.name, o.stage, o.expected_amount, o.expected_date,
            o.update_time,
            DATEDIFF(NOW(), o.update_time) as stuck_days,
            cu.company_name as customer_name,
            u.real_name as owner_name
     FROM crm_opportunity o
     LEFT JOIN crm_customer cu ON o.customer_id = cu.id
     LEFT JOIN sys_user u ON o.owner_id = u.id
     WHERE o.deleted_at IS NULL
       AND o.stage NOT IN (5, 6)
       AND DATEDIFF(NOW(), o.update_time) >= ?
       ${deptFilter}
     ORDER BY stuck_days DESC
     LIMIT 50`,
    params
  );

  const STAGE_MAP = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判' };
  const result = list.map(item => ({
    ...item,
    stage_name: STAGE_MAP[item.stage] || '未知'
  }));

  return { list: result, total: result.length, stuck_days: stuckDays };
}

module.exports = {
  getOverview,
  getSalesBreakdown,
  getSalesOverdueCustomers,
  getSalesCustomers,
  urgeFollowup,
  getPendingApprovals,
  getStuckOpportunities
};
