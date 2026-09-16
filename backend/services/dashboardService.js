/**
 * 仪表盘服务层
 * 从 routes/report/dashboard.js 提取的业务逻辑
 *
 * [数据范围修复 2026-09-16]
 * 原实现用 `roleId === ROLES.ADMIN || roleId === ROLES.MANAGER` 判断「可见全部」，
 * 与全系统的数据权限机制（sys_role.view_all/manage_all + sys_data_permission）**完全脱节**：
 *   · config/roles.js 的 ROLES 数字常量已标注「逐步弃用」，且与现库错位
 *     （现库 id1=boss / id2=finance / id3=super_admin / id4=manager / id5=sales）；
 *   · 结果：super_admin、以及任何 view_all=1 的自定义角色都被误判为「只看自己」，
 *     而 id2（现库为财务）被当成超管。
 * 现改为**统一走 checkDataPermission + buildDataPermissionWhere**（与另外 8 个模块一致）。
 * 语义：boss/super_admin(view_all=1) → all；其余按 sys_data_permission 配置，缺省 self。
 * ⚠️ 本文件只读（SELECT），符合 PRD R-05「不触及冻结」约束。
 */

const { buildDataPermissionWhere } = require('../middleware/permission');
const { getOverdueDays } = require('../utils/config');
const { POOL_STATUS } = require('../constants/poolStatus');

/**
 * 按表构造数据范围子句。
 * buildDataPermissionWhere 依赖 dataPermission.ownerColumn，故此处按各表真实归属列覆写：
 *   crm_customer → owner_id ｜ crm_contract → create_by ｜ crm_opportunity → owner_id
 *   crm_follow_up → create_by ｜ crm_service_order → assignee_id ｜ crm_payment_plan → 经合同 create_by
 */
async function scopeFor(dataPermission, ownerColumn, alias) {
  // 与项目共用助手 buildDataPermissionWhere 的语义保持一致：无数据范围对象 → 不过滤。
  // （路由侧始终经 checkDataPermission 注入，理论上不会走到这里；保留防御分支避免静默拼出 `= undefined`）
  if (!dataPermission) return { clause: '1=1', params: [] };
  return buildDataPermissionWhere({ ...dataPermission, ownerColumn }, alias);
}

/** 概览数据（首页仪表盘） */
async function getOverview(pool, dataPermission) {
  const [customerScope, contractScope, opportunityScope] = await Promise.all([
    scopeFor(dataPermission, 'owner_id', 'cu'),
    scopeFor(dataPermission, 'create_by', 'c'),
    scopeFor(dataPermission, 'owner_id', 'o')
  ]);

  const [
    [monthSales],
    [monthCustomers],
    [monthContracts],
    [monthPayments],
    [opportunityAmount],
    [monthLeads],
    [monthConverted]
  ] = await Promise.all([
    pool.query(`
      SELECT COALESCE(SUM(c.amount), 0) as amount
      FROM crm_contract c
      WHERE c.deleted_at IS NULL
        AND c.sign_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND c.sign_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
        AND ${contractScope.clause}
    `, contractScope.params),
    pool.query(`
      SELECT COUNT(*) as count
      FROM crm_customer cu
      WHERE cu.deleted_at IS NULL
        AND cu.create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND cu.create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
        AND ${customerScope.clause}
    `, customerScope.params),
    pool.query(`
      SELECT COUNT(*) as count
      FROM crm_contract c
      WHERE c.deleted_at IS NULL
        AND c.create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND c.create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
        AND ${contractScope.clause}
    `, contractScope.params),
    pool.query(`
      SELECT COALESCE(SUM(p.pay_amount), 0) as amount
      FROM crm_payment p
      LEFT JOIN crm_contract c ON p.contract_id = c.id AND c.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
        AND p.pay_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND p.pay_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
        AND ${contractScope.clause}
    `, contractScope.params),
    pool.query(`
      SELECT COALESCE(SUM(o.expected_amount), 0) as amount
      FROM crm_opportunity o
      WHERE o.deleted_at IS NULL
        AND o.stage NOT IN (5, 6)
        AND ${opportunityScope.clause}
    `, opportunityScope.params),
    pool.query(
      `SELECT COUNT(*) as count FROM crm_customer cu
        WHERE cu.deleted_at IS NULL
          AND cu.create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND cu.create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH
          AND cu.status = 'following' AND ${customerScope.clause}`,
      customerScope.params
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM crm_customer cu
        WHERE cu.deleted_at IS NULL AND cu.converted_at >= NOW() - INTERVAL 30 DAY AND ${customerScope.clause}`,
      customerScope.params
    )
  ]);

  return {
    month_sales: monthSales[0].amount?.toString() || '0.00',
    month_customers: monthCustomers[0].count,
    month_leads: monthLeads[0].count,
    month_converted: monthConverted[0].count,
    month_contracts: monthContracts[0].count,
    month_payments: monthPayments[0].amount?.toString() || '0.00',
    opportunity_amount: opportunityAmount[0].amount?.toString() || '0.00'
  };
}

/** 今日待办 */
async function getTodayTasks(pool, dataPermission) {
  const [followScope, serviceScope] = await Promise.all([
    scopeFor(dataPermission, 'create_by', 'f'),
    scopeFor(dataPermission, 'assignee_id', 'so')
  ]);

  const [followList] = await pool.query(`
    SELECT f.id, f.customer_id, f.follow_type, f.content, f.next_time,
           cu.company_name
    FROM crm_follow_up f
    LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.deleted_at IS NULL
    WHERE f.deleted_at IS NULL
      AND ${followScope.clause}
      AND f.next_time IS NOT NULL
      AND DATE(f.next_time) = CURRENT_DATE
    ORDER BY f.next_time ASC
    LIMIT 50
  `, followScope.params);

  const [followTotal] = await pool.query(`
    SELECT COUNT(*) as total
    FROM crm_follow_up f
    WHERE f.deleted_at IS NULL
      AND ${followScope.clause}
      AND f.next_time IS NOT NULL
      AND DATE(f.next_time) = CURRENT_DATE
  `, followScope.params);

  const [serviceList] = await pool.query(`
    SELECT so.id, so.order_no, so.title, so.type, so.priority, so.status,
           cu.company_name as customer_name
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    WHERE ${serviceScope.clause}
      AND so.status IN (1, 2, 3)
    ORDER BY
      CASE so.priority
        WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4
      END ASC,
      so.create_time ASC
    LIMIT 50
  `, serviceScope.params);

  const [serviceTotal] = await pool.query(`
    SELECT COUNT(*) as total
    FROM crm_service_order so
    WHERE ${serviceScope.clause}
      AND so.status IN (1, 2, 3)
  `, serviceScope.params);

  return {
    follow_list: followList,
    follow_count: followTotal[0].total,
    service_list: serviceList,
    service_count: serviceTotal[0].total
  };
}

/** 快捷操作统计 */
async function getQuickStats(pool, dataPermission) {
  const [contractScope] = await Promise.all([scopeFor(dataPermission, 'create_by', 'c')]);

  // 公海池（owner_id IS NULL）本质是**共享池**，计数为全局量：
  // 旧实现给它传了 userId 参数但 SQL 里没有占位符（参数被静默丢弃，属死参数 bug）。
  // 此处显式声明为全局计数——若日后要按范围过滤，需先定义「公海计数按谁的范围」。
  const [customerPool] = await pool.query(
    'SELECT COUNT(*) as count FROM crm_customer WHERE owner_id IS NULL AND deleted_at IS NULL',
    []
  );

  const [pendingContract] = await pool.query(`
    SELECT COUNT(*) as count FROM crm_contract c
    WHERE c.deleted_at IS NULL AND c.status = 1 AND ${contractScope.clause}
  `, contractScope.params);

  const [pendingPayment] = await pool.query(`
    SELECT COUNT(*) as count
    FROM crm_payment_plan pp
    LEFT JOIN crm_contract c ON pp.contract_id = c.id
    WHERE pp.plan_date <= CURRENT_DATE
      AND pp.id NOT IN (
        SELECT COALESCE(plan_id, 0) FROM crm_payment WHERE plan_id IS NOT NULL
      )
      AND ${contractScope.clause}
  `, contractScope.params);

  return {
    customer_pool: customerPool[0].count,
    pending_contract: pendingContract[0].count,
    pending_payment: pendingPayment[0].count
  };
}

/** 逾期统计（仪表盘用） */
async function getOverdueStats(pool, dataPermission) {
  const overdueDays = await getOverdueDays();
  const scope = await scopeFor(dataPermission, 'owner_id', 'c');

  const whereClause = `c.pool_status = ?
    AND c.deleted_at IS NULL
    AND c.owner_id IS NOT NULL
    AND ((c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ${overdueDays} DAY)
      OR c.last_follow_time < NOW() - INTERVAL ${overdueDays} DAY)
    AND ${scope.clause}`;

  const [result] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c WHERE ${whereClause}`,
    [POOL_STATUS.PRIVATE, ...scope.params]
  );

  return { overdue_count: result[0].total || 0, overdue_days: overdueDays };
}

module.exports = {
  getOverview,
  getTodayTasks,
  getQuickStats,
  getOverdueStats
};
