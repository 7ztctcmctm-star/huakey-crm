/**
 * Sales Analytics Service (Phase 5.5.2)
 * 统一销售分析查询接口, 复用现有 SQL 结构 + RBAC 数据权限
 * 三域独立: Opportunity(预测) / Contract(收入) / Payment(现金流)
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const ROLES = require('../config/roles');

/**
 * 构建数据权限过滤条件 (复用 dashboardService 模式)
 * - admin/super_admin: 无过滤
 * - manager(admin code): 部门+子部门
 * - sales 等: 仅自己 owner_id
 * @param {object} user - req.user { userId, roleCode, manageAll }
 * @param {string} ownerColumn - 归属列名
 * @returns {{ where: string, params: Array }}
 */
function buildScope(user, ownerColumn = 'owner_id') {
  const where = [];
  const params = [];
  if (user.manageAll) {
    return { where: '', params };
  }
  if (user.roleCode === ROLES.ROLE_CODES.ADMIN) {
    // manager: 本部门+子部门
    where.push(`${ownerColumn} IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))`);
    params.push(user.userId);
  } else {
    where.push(`${ownerColumn} = ?`);
    params.push(user.userId);
  }
  return { where: where.length ? ' AND ' + where.join(' AND ') : '', params };
}

/**
 * GET /analytics/sales/overview
 * 返回: opportunity_amount, contract_amount, received_amount, pending_amount
 */
async function getOverview(pool, user) {
  const { where: oppScope, params: oppParams } = buildScope(user, 'owner_id');
  const { where: contractScope, params: contractParams } = buildScope(user, 'create_by');

  const [opps] = await pool.query(
    `SELECT COALESCE(SUM(expected_amount),0) as amount FROM crm_opportunity WHERE deleted_at IS NULL${oppScope}`,
    oppParams
  );
  const [contracts] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) as amount FROM crm_contract WHERE deleted_at IS NULL${contractScope}`,
    contractParams
  );
  // 已收: crm_payment 关联合同 create_by 过滤
  const [received] = await pool.query(
    `SELECT COALESCE(SUM(p.pay_amount),0) as amount
     FROM crm_payment p
     JOIN crm_contract c ON c.id = p.contract_id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL${contractScope}`,
    contractParams
  );
  // 未收: 应收 - 已收
  const [plans] = await pool.query(
    `SELECT COALESCE(SUM(pp.plan_amount),0) as amount
     FROM crm_payment_plan pp
     JOIN crm_contract c ON c.id = pp.contract_id
     WHERE pp.deleted_at IS NULL AND c.deleted_at IS NULL${contractScope}`,
    contractParams
  );
  const receivable = parseFloat(plans[0].amount);
  const receivedAmt = parseFloat(received[0].amount);
  return {
    opportunity_amount: opps[0].amount?.toString() || '0.00',
    contract_amount: contracts[0].amount?.toString() || '0.00',
    received_amount: receivedAmt.toFixed(2),
    pending_amount: Math.max(receivable - receivedAmt, 0).toFixed(2)
  };
}

/**
 * GET /analytics/sales/funnel
 * 返回: stage 分布(count/amount) + win_rate
 */
async function getSalesFunnel(pool, user) {
  const { where, params } = buildScope(user, 'owner_id');
  const [rows] = await pool.query(
    `SELECT stage, COUNT(id) as count, COALESCE(SUM(expected_amount),0) as amount
     FROM crm_opportunity WHERE deleted_at IS NULL${where}
     GROUP BY stage ORDER BY stage ASC`,
    params
  );
  const stageNames = ['', '询盘', '需求确认', '方案报价', '谈判', '成交', '失败'];
  const result = [];
  for (let i = 1; i <= 6; i++) {
    const row = rows.find(r => Number(r.stage) === i);
    result.push({ stage: i, stage_name: stageNames[i], count: row?.count || 0, amount: row?.amount?.toString() || '0.00' });
  }
  const won = rows.find(r => Number(r.stage) === 5)?.count || 0;
  const lost = rows.find(r => Number(r.stage) === 6)?.count || 0;
  const winRate = (won + lost) > 0 ? (won / (won + lost)) * 100 : 0;
  return { stages: result, win_rate: Number(winRate.toFixed(2)) };
}

/**
 * GET /analytics/contract/revenue
 * 返回: total/active/completed/cancelled 金额
 */
async function getContractRevenue(pool, user) {
  const { where, params } = buildScope(user, 'create_by');
  const [rows] = await pool.query(
    `SELECT status, COUNT(id) as count, COALESCE(SUM(amount),0) as amount
     FROM crm_contract WHERE deleted_at IS NULL${where}
     GROUP BY status`,
    params
  );
  const pick = (s) => { const r = rows.find(x => Number(x.status) === s); return r ? r.amount?.toString() : '0.00'; };
  const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  return {
    total_amount: total.toFixed(2),
    total_count: rows.reduce((sum, r) => sum + (r.count || 0), 0),
    active_amount: pick(2),
    completed_amount: pick(3),
    cancelled_amount: pick(4)
  };
}

/**
 * GET /analytics/payment/collection
 * 返回: receivable/received/outstanding/overdue/collection_rate
 */
async function getPaymentCollection(pool, user) {
  const { where: contractScope, params: contractParams } = buildScope(user, 'create_by');
  const [plans] = await pool.query(
    `SELECT COALESCE(SUM(pp.plan_amount),0) as amount
     FROM crm_payment_plan pp JOIN crm_contract c ON c.id = pp.contract_id
     WHERE pp.deleted_at IS NULL AND c.deleted_at IS NULL${contractScope}`,
    contractParams
  );
  const [received] = await pool.query(
    `SELECT COALESCE(SUM(p.pay_amount),0) as amount
     FROM crm_payment p JOIN crm_contract c ON c.id = p.contract_id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL${contractScope}`,
    contractParams
  );
  const [overdue] = await pool.query(
    `SELECT COALESCE(SUM(pp.plan_amount),0) as amount
     FROM crm_payment_plan pp JOIN crm_contract c ON c.id = pp.contract_id
     WHERE pp.deleted_at IS NULL AND c.deleted_at IS NULL AND pp.status = 'overdue'${contractScope}`,
    contractParams
  );
  const receivable = parseFloat(plans[0].amount);
  const receivedAmt = parseFloat(received[0].amount);
  const outstanding = Math.max(receivable - receivedAmt, 0);
  const rate = receivable > 0 ? (receivedAmt / receivable) * 100 : 0;
  return {
    receivable_amount: receivable.toFixed(2),
    received_amount: receivedAmt.toFixed(2),
    outstanding_amount: outstanding.toFixed(2),
    overdue_amount: overdue[0].amount?.toString() || '0.00',
    collection_rate: Number(rate.toFixed(2))
  };
}

module.exports = {
  getOverview,
  getSalesFunnel,
  getContractRevenue,
  getPaymentCollection
};
