/**
 * 回款核心服务层
 * 从 routes/contract.js 回款部分提取的业务逻辑，供路由层复用
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
// 【#4 金额统一】回款金额一律走 money 工具，禁止浮点运算后写入 DECIMAL 列
const money = require('../utils/money');
// 【#16】业务事件派发（Webhook）
const webhookDispatcher = require('./webhookDispatcher');
const { assertUniquePlanDates } = require('../utils/paymentPlan');

/**
 * [P2-05] 回款金额兜底校验（服务层强制，不依赖路由 Joi）。
 *
 * 路由 schema 原来只有 `min(0)`：0 元回款可入库；也没有上限，超过
 * `DECIMAL(15,2)` 范围的值会在 MySQL 侧被截断或报错。此处统一要求：
 *   - 有限数字且 > 0
 *   - ≤ DECIMAL(15,2) 上限
 *   - 最多 2 位小数（多于 2 位直接拒绝，不做静默舍入）
 *
 * @param {number|string} value
 * @returns {number} 归一化到 2 位小数后的金额
 */
function assertValidPaymentAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回款金额必须是有效数字');
  }
  if (amount <= 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回款金额必须大于 0');
  }
  if (amount > money.MAX_AMOUNT) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `回款金额不能超过 ${money.MAX_AMOUNT}`);
  }
  const rounded = money.round2(amount);
  if (Math.abs(rounded - amount) > 1e-6) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回款金额最多保留两位小数');
  }
  return rounded;
}

/**
 * 重新计算回款计划的 paid_amount / status / overdue_days
 * @param {object} pool
 * @param {number} planId
 */
async function recalculatePlanStatus(pool, planId) {
  const [plans] = await pool.query('SELECT plan_amount, plan_date FROM crm_payment_plan WHERE id = ?', [planId]);
  if (!plans.length) return;

  const plan = plans[0];

  // 计算已回金额（排除已删除的回款记录）
  const [sumRows] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  // 【#4 金额统一】保留 SUM 返回的十进制字符串精度，避免经 number 往返后写入 DECIMAL 引入尾数偏差。
  // 仅比较/落库使用字符串（MySQL 会按列精度正确解析），数值比较用 round2 归一化。
  const paidAmountRaw = money.toDecimalString(sumRows[0].total);
  const paidAmount = money.round2(paidAmountRaw);

  // 计算状态
  let status = 'pending';
  if (paidAmount >= money.round2(plan.plan_amount)) {
    status = 'completed';
  } else if (paidAmount > 0) {
    status = 'partial';
  } else if (new Date(plan.plan_date) < new Date()) {
    status = 'overdue';
  }

  // 计算逾期天数
  let overdueDays = 0;
  if ((status === 'pending' || status === 'partial') && new Date(plan.plan_date) < new Date()) {
    overdueDays = Math.floor((Date.now() - new Date(plan.plan_date).getTime()) / 86400000);
  }

  await pool.query(
    'UPDATE crm_payment_plan SET paid_amount = ?, status = ?, overdue_days = ? WHERE id = ?',
    [paidAmount, status, overdueDays, planId]
  );
}

/**
 * 创建回款计划
 * @param {object} pool
 * @param {number} contractId
 * @param {Array} plans - [{ plan_date, plan_amount, remark }]
 * @returns {{ count: number }}
 */
async function createPaymentPlans(pool, contractId, plans) {
  if (!plans || plans.length === 0) return { count: 0 };

  // 【迁移 123】uk_plan_contract_date 生效后，与已有计划撞日期会撞 1062；此处前置校验给出可读提示
  const [existingRows] = await pool.query(
    'SELECT plan_date FROM crm_payment_plan WHERE contract_id = ?',
    [contractId]
  );
  const finalDates = (existingRows || []).map((p) => p.plan_date);
  for (const plan of plans) finalDates.push(plan.plan_date);
  assertUniquePlanDates(finalDates);

  const placeholders = plans.map(() => '(?, ?, ?, ?)').join(', ');
  const flatValues = plans.flatMap(p => [contractId, p.plan_date, p.plan_amount, p.remark || null]);

  const [result] = await pool.query(
    `INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES ${placeholders}`,
    flatValues
  );

  return { count: result.affectedRows };
}

/**
 * 重新计算回款计划状态（事务内版本，使用 conn 而非 pool）
 * @param {object} conn - 数据库连接（事务内）
 * @param {number} planId
 */
async function recalculatePlanStatusWithConn(conn, planId) {
  // [P0-08] 行锁 + 当前读：并发回款（登记/修改/删除）必须串行化到同一计划，
  // 否则两笔回款各自 SUM 到「不含对方」的金额，后写者用偏小的 paid_amount 覆盖先写者（丢更新）。
  // FOR UPDATE 是锁定读，绕过 REPEATABLE READ 快照，等待期间对方已提交的金额可见。
  const [plans] = await conn.query(
    'SELECT plan_amount, plan_date FROM crm_payment_plan WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [planId]
  );
  if (!plans.length) return;

  const plan = plans[0];
  const [sumRows] = await conn.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  // 【#4 金额统一】同 recalculatePlanStatus：字符串精度 + round2 归一化，避免浮点写入偏差
  const paidAmount = money.round2(money.toDecimalString(sumRows[0].total));

  let status = 'pending';
  let overdueDays = 0;
  if (paidAmount >= money.round2(plan.plan_amount)) {
    status = 'completed';
  } else if (paidAmount > 0) {
    status = 'partial';
  }
  if (status !== 'completed' && plan.plan_date) {
    const now = new Date();
    const planDate = new Date(plan.plan_date);
    const diffDays = Math.floor((now - planDate) / (1000 * 60 * 60 * 24));
    overdueDays = diffDays > 0 ? diffDays : 0;
  }

  await conn.query(
    'UPDATE crm_payment_plan SET paid_amount = ?, status = ?, overdue_days = ? WHERE id = ?',
    [paidAmount, status, overdueDays, planId]
  );
}

/**
 * 登记回款（匹配回款计划）
 * @param {object} pool
 * @param {object} data - { contract_id, plan_id, pay_date, pay_amount, pay_method, remark }
 * @returns {{ id: number }}
 */
/**
 * 登记回款
 * @param {object} pool
 * @param {object} data - { contract_id, plan_id, pay_date, pay_amount, pay_method, remark }
 * @param {string} [idempotencyKey] - 幂等键（2026-10-15 补，AGENTS.md 7.18）；
 *        重复 key 直接返回首次结果，不重复落库；无 key 时行为不变
 * @returns {Promise<{id: number}>}
 */
async function recordPayment(pool, data, idempotencyKey, operatorId) {
  // [P2-05] 金额校验放在幂等占位之前：无效请求不写 crm_idempotency、不进事务
  const payAmount = assertValidPaymentAmount(data.pay_amount);
  const { runIdempotent } = require('../utils/idempotency');
  const { result } = await runIdempotent(pool, idempotencyKey, 'payment', async () => {
    const { contract_id, plan_id, pay_date, pay_method, remark } = data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 锁定读：既防止合同在登记过程中被删/改，也确保本事务的第一次一致性读
      // 发生在拿到计划行锁之后（否则 REPEATABLE READ 快照会早于并发事务的提交）。
      const [contracts] = await conn.query(
        'SELECT id, status FROM crm_contract WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [contract_id]
      );
      if (!contracts.length) {
        throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '所属合同不存在')
      }

      // [P0-08] 计划必须存在且属于本合同，否则回款会挂到别家合同上（金额/状态全错）。
      // 同时用 FOR UPDATE 锁住计划行：并发登记同一计划时在此排队，
      // 后到事务的重算一定能看到先到事务已提交的回款。
      if (plan_id) {
        const [plans] = await conn.query(
          'SELECT id, contract_id FROM crm_payment_plan WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [plan_id]
        );
        if (!plans.length) {
          throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '回款计划不存在')
        }
        if (Number(plans[0].contract_id) !== Number(contract_id)) {
          throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回款计划不属于该合同')
        }
      }

      const [insertResult] = await conn.query(
        'INSERT INTO crm_payment (contract_id, plan_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?, ?)',
        [contract_id, plan_id || null, pay_date, payAmount, pay_method || null, remark || null]
      );

      await conn.query('UPDATE crm_contract SET status = 2 WHERE id = ? AND status = 1', [contract_id]);

      if (plan_id) {
        await recalculatePlanStatusWithConn(conn, plan_id);
      }

      await conn.commit();

      // 【#16】回款成功事件派发（事务提交后、非阻塞；失败不影响回款结果）
      // 幂等命中时不会重新进入本函数，webhook 天然不会重复派发
      webhookDispatcher.dispatch(pool, 'payment.received', {
        payment_id: insertResult.insertId, contract_id, plan_id: plan_id || null,
        pay_amount: payAmount, pay_date, pay_method: pay_method || null
      }).catch(() => { /* 派发器内部已记日志，此处仅兜底吞异常 */ });

      return { id: insertResult.insertId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }, operatorId);
  return result;
}

/**
 * 更新回款记录
 * @param {object} pool
 * @param {object} data - { id, pay_date, pay_amount, pay_method, remark }
 */
async function updatePayment(pool, data) {
  const { id, pay_date, pay_method, remark } = data;
  // [P2-05] 修改回款同样校验金额，避免绕过新增接口把金额改成 0/超限
  const payAmount = assertValidPaymentAmount(data.pay_amount);

  // [P0-08] 改金额 + 重算计划必须在同一事务内：原实现事务外重算，
  // 中途失败会留下「回款已改、计划 paid_amount/status 仍是旧值」的半套数据。
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 查找旧 plan_id 用于刷新；FOR UPDATE 防止并发修改/删除同一笔回款
    const [oldPayment] = await conn.query(
      'SELECT plan_id, contract_id FROM crm_payment WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!oldPayment.length) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '回款记录不存在')
    }

    await conn.query(
      'UPDATE crm_payment SET pay_date = ?, pay_amount = ?, pay_method = ?, remark = ? WHERE id = ? AND deleted_at IS NULL',
      [pay_date, payAmount, pay_method, remark, id]
    );

    // 刷新回款计划状态（同事务、锁计划行）
    if (oldPayment[0].plan_id) {
      await recalculatePlanStatusWithConn(conn, oldPayment[0].plan_id);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 删除回款记录（逻辑删除）
 * @param {object} pool
 * @param {number} paymentId
 */
async function deletePayment(pool, paymentId) {
  // [P0-08] 软删 + 重算计划同事务；FOR UPDATE 保证并发双击只删一次、
  // 且后到事务的重算能看到先到事务已提交的删除结果。
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [payments] = await conn.query(
      'SELECT contract_id, plan_id FROM crm_payment WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [paymentId]
    );
    if (!payments.length) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '回款记录不存在')
    }

    await conn.query(
      'UPDATE crm_payment SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [paymentId]
    );

    // 刷新回款计划状态（同事务、锁计划行）
    if (payments[0].plan_id) {
      await recalculatePlanStatusWithConn(conn, payments[0].plan_id);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 逾期检测：获取所有逾期未足额到账的回款计划
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword }
 * @returns {{ list: Array, total: number }}
 */
async function getOverduePayments(pool, params = {}, permission = null) {
  const { page = 1, pageSize = 20, keyword } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE pp.plan_date < CURRENT_DATE AND c.deleted_at IS NULL';
  if (permission && permission.clause && permission.clause !== '1=1') {
    where += ` AND ${permission.clause}`;
    queryParams.push(...(permission.params || []));
  }
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT plan_id, COALESCE(SUM(pay_amount), 0) as paid
       FROM crm_payment WHERE deleted_at IS NULL GROUP BY plan_id
     ) p ON p.plan_id = pp.id
     ${where} AND COALESCE(p.paid, 0) < pp.plan_amount`,
    queryParams
  );

  const [list] = await pool.query(
    `SELECT pp.id as plan_id, pp.contract_id, c.contract_no, cu.company_name,
            pp.plan_date, pp.plan_amount,
            COALESCE(p.paid, 0) as paid_amount,
            (pp.plan_amount - COALESCE(p.paid, 0)) as remain_amount,
            DATEDIFF(CURRENT_DATE, pp.plan_date) as overdue_days
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT plan_id, COALESCE(SUM(pay_amount), 0) as paid
       FROM crm_payment WHERE deleted_at IS NULL GROUP BY plan_id
     ) p ON p.plan_id = pp.id
     ${where} AND COALESCE(p.paid, 0) < pp.plan_amount
     ORDER BY pp.plan_date ASC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total };
}

/**
 * 回款合并视图（计划+记录）
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword, start_date, end_date }
 * @returns {{ list: Array, total: number }}
 */
async function getMergedPayments(pool, params = {}, permission = null) {
  const { page = 1, pageSize = 20, keyword, start_date, end_date } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE pp.deleted_at IS NULL';
  if (permission && permission.clause && permission.clause !== '1=1') {
    where += ` AND ${permission.clause}`;
    queryParams.push(...(permission.params || []));
  }
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (start_date) { where += ' AND pp.plan_date >= ?'; queryParams.push(start_date); }
  if (end_date) { where += ' AND pp.plan_date <= ?'; queryParams.push(end_date); }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT pp.id) as total
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}`, queryParams
  );

  const [rows] = await pool.query(`
    SELECT pp.id as plan_id, pp.contract_id, c.contract_no, cu.company_name,
           pp.plan_amount, pp.plan_date,
           COALESCE(SUM(p.pay_amount), 0) as paid_amount,
           (pp.plan_amount - COALESCE(SUM(p.pay_amount), 0)) as unpaid_amount,
           CASE
             WHEN COALESCE(SUM(p.pay_amount), 0) >= pp.plan_amount THEN 'completed'
             WHEN pp.plan_date < CURDATE() THEN 'overdue'
             ELSE 'pending'
           END as plan_status
    FROM crm_payment_plan pp
    JOIN crm_contract c ON pp.contract_id = c.id
    JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN crm_payment p ON p.contract_id = pp.contract_id AND p.plan_id = pp.id AND p.deleted_at IS NULL
    ${where}
    GROUP BY pp.id
    ORDER BY pp.plan_date DESC
    LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

/**
 * 本月回款汇总
 * @param {object} pool
 * @returns {{ month_plan_total: number, month_paid_total: number, month_rate: number }}
 */
async function getMonthlySummary(pool, permission = null) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  const [[planTotal]] = await pool.query(
    `SELECT COALESCE(SUM(pp.plan_amount), 0) as total
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     WHERE pp.plan_date BETWEEN ? AND ? AND pp.deleted_at IS NULL AND ${permissionClause}`,
    [monthStart, monthEnd, ...permParams]
  );
  const [[paidTotal]] = await pool.query(
    `SELECT COALESCE(SUM(p.pay_amount), 0) as total
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     WHERE p.pay_date BETWEEN ? AND ? AND p.deleted_at IS NULL AND ${permissionClause}`,
    [monthStart, monthEnd, ...permParams]
  );

  // 金额计算统一走 utils/money.js（BigInt 精确十进制，2026-10-15 收敛）
  const planVal = money.round2(planTotal.total || 0);
  const paidVal = money.round2(paidTotal.total || 0);
  const rate = planVal > 0 ? Math.round(paidVal / planVal * 100) : 0;

  return { month_plan_total: planVal, month_paid_total: paidVal, month_rate: rate };
}

/**
 * 客户对账汇总
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword }
 * @returns {{ list: Array, total: number }}
 */
async function getCustomerReconciliation(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE c.deleted_at IS NULL';
  if (keyword) {
    where += ' AND cu.company_name LIKE ?';
    queryParams.push(`%${keyword}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(DISTINCT cu.id) as total
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}`,
    queryParams
  );

  const [list] = await pool.query(
    `SELECT cu.id as customer_id, cu.company_name,
            COUNT(DISTINCT c.id) as contract_count,
            COALESCE(SUM(c.amount), 0) as total_amount,
            COALESCE(SUM(cp.paid), 0) as paid_amount,
            COALESCE(SUM(c.amount), 0) - COALESCE(SUM(cp.paid), 0) as outstanding_amount
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT contract_id, SUM(pay_amount) as paid
       FROM crm_payment WHERE deleted_at IS NULL
       GROUP BY contract_id
     ) cp ON cp.contract_id = c.id
     ${where}
     GROUP BY cu.id, cu.company_name
     HAVING total_amount > 0
     ORDER BY outstanding_amount DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total };
}

module.exports = {
  recalculatePlanStatus,
  recalculatePlanStatusWithConn,
  createPaymentPlans,
  recordPayment,
  updatePayment,
  deletePayment,
  getOverduePayments,
  getMergedPayments,
  getMonthlySummary,
  getCustomerReconciliation
};
