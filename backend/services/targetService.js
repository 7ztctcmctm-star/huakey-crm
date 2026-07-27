/**
 * 销售目标服务层
 * 从 routes/target.js 提取的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 获取销售目标列表（含达成率）
 */
async function listTargets(pool, { year, month }) {
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;

  // 获取所有销售用户
  const [users] = await pool.query(
    `SELECT u.id, u.real_name, d.name as dept_name
     FROM sys_user u
     LEFT JOIN sys_dept d ON u.dept_id = d.id
     WHERE u.status = 1
     ORDER BY u.id`
  );

  // 获取目标
  const [targets] = await pool.query(
    `SELECT user_id, target_amount FROM crm_sales_target WHERE year = ? AND month = ? AND deleted_at IS NULL`,
    [y, m]
  );

  // 获取实际成交金额
  const [actuals] = await pool.query(
    `SELECT create_by as user_id, COALESCE(SUM(amount), 0) as actual_amount
     FROM crm_contract
     WHERE YEAR(sign_date) = ? AND MONTH(sign_date) = ?
     GROUP BY create_by`,
    [y, m]
  );

  // 获取实际回款金额
  const [payments] = await pool.query(
    `SELECT c.create_by as user_id, COALESCE(SUM(p.pay_amount), 0) as payment_amount
     FROM crm_payment p
     LEFT JOIN crm_contract c ON p.contract_id = c.id
     WHERE YEAR(p.pay_date) = ? AND MONTH(p.pay_date) = ?
     GROUP BY c.create_by`,
    [y, m]
  );

  const targetMap = {};
  targets.forEach(t => { targetMap[t.user_id] = parseFloat(t.target_amount); });
  const actualMap = {};
  actuals.forEach(a => { actualMap[a.user_id] = parseFloat(a.actual_amount); });
  const paymentMap = {};
  payments.forEach(p => { paymentMap[p.user_id] = parseFloat(p.payment_amount); });

  const list = users.map(u => {
    const target = targetMap[u.id] || 0;
    const actual = actualMap[u.id] || 0;
    const payment = paymentMap[u.id] || 0;
    return {
      user_id: u.id,
      real_name: u.real_name,
      dept_name: u.dept_name || '-',
      target_amount: target,
      actual_amount: actual,
      payment_amount: payment,
      achievement_rate: target > 0 ? Math.round((actual / target) * 100) : 0
    };
  });

  return { year: y, month: m, list };
}

/**
 * 设置/更新销售目标
 */
async function setTarget(pool, { user_id, year, month, target_amount }, userId) {
  const [users] = await pool.query('SELECT id FROM sys_user WHERE id = ? AND status = 1', [user_id]);
  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  await pool.query(
    `INSERT INTO crm_sales_target (user_id, year, month, target_amount, create_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount), update_time = NOW()`,
    [user_id, year, month, target_amount || 0, userId]
  );
}

/**
 * 批量设置销售目标
 */
async function batchSetTarget(pool, { year, month, targets }, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const t of targets) {
      await connection.query(
        `INSERT INTO crm_sales_target (user_id, year, month, target_amount, create_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount), update_time = NOW()`,
        [t.user_id, year, month, t.target_amount || 0, userId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 删除销售目标（软删除）
 */
async function deleteTarget(pool, { id }) {
  if (!id) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '目标ID不能为空');
  }

  await pool.query('UPDATE crm_sales_target SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  listTargets,
  setTarget,
  batchSetTarget,
  deleteTarget
};
