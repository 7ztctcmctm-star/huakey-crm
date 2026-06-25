/**
 * 人力资源服务层
 * 从 routes/hr.js 提取的业务逻辑：员工档案、佣金规则、佣金计算、组织架构
 */

// ============ 员工档案 ============

/**
 * 查询员工列表（分页、筛选）
 */
async function getEmployees(pool, { dept_id, status, keyword, contract_expiring, page = 1, pageSize = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE 1=1';
  const params = [];

  if (dept_id) { where += ' AND u.dept_id = ?'; params.push(dept_id); }
  if (status !== undefined && status !== '') { where += ' AND u.status = ?'; params.push(parseInt(status)); }
  if (keyword) { where += ' AND (u.real_name LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (contract_expiring === 'true') {
    where += ' AND p.contract_end IS NOT NULL AND p.contract_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)';
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM sys_user u LEFT JOIN crm_employee_profile p ON u.id = p.user_id ${where}`, params
  );

  const [rows] = await pool.query(`
    SELECT u.id, u.username, u.real_name, u.phone, u.email, u.status, u.dept_id, u.role_id,
           d.name as dept_name, r.name as role_name,
           p.hire_date, p.position, p.employment_type, p.salary_base, p.salary_commission_rate,
           p.contract_end
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    LEFT JOIN crm_employee_profile p ON u.id = p.user_id
    ${where} ORDER BY u.id LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  const [[{ expiring }]] = await pool.query(
    `SELECT COUNT(*) as expiring FROM crm_employee_profile p
     JOIN sys_user u ON p.user_id = u.id
     WHERE u.status = 1 AND p.contract_end IS NOT NULL
       AND p.contract_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
  );

  return { list: rows, total, expiring_contracts: expiring };
}

/**
 * 员工统计
 */
async function getEmployeeStats(pool) {
  const [[total]] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user');
  const [[active]] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE status = 1');
  const [[inactive]] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE status != 1');

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [[newHire]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM crm_employee_profile WHERE hire_date >= ?", [monthStart]
  );
  const [[newLeave]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM crm_employee_profile WHERE leave_date >= ?", [monthStart]
  );

  const [deptDist] = await pool.query(`
    SELECT d.name, COUNT(u.id) as count
    FROM sys_dept d LEFT JOIN sys_user u ON d.id = u.dept_id AND u.status = 1
    GROUP BY d.id ORDER BY count DESC
  `);

  return { total: total.cnt, active: active.cnt, inactive: inactive.cnt, new_hire: newHire.cnt, new_leave: newLeave.cnt, dept_distribution: deptDist };
}

/**
 * 员工详情
 */
async function getEmployee(pool, id) {
  const [[row]] = await pool.query(`
    SELECT u.id, u.username, u.real_name, u.phone, u.email, u.status, u.dept_id, u.role_id, u.manager_id,
           d.name as dept_name, r.name as role_name, m.real_name as manager_name,
           p.id as profile_id, p.user_id, p.gender, p.birth_date, p.hire_date, p.leave_date,
           p.position, p.employment_type, p.contract_start, p.contract_end,
           p.emergency_contact, p.emergency_phone, p.address, p.education,
           p.university, p.major, p.remark
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    LEFT JOIN sys_user m ON u.manager_id = m.id
    LEFT JOIN crm_employee_profile p ON u.id = p.user_id
    WHERE u.id = ?
  `, [id]);
  return row || null;
}

/**
 * 员工薪资信息
 */
async function getEmployeeSalary(pool, userId) {
  const [[profile]] = await pool.query(
    'SELECT salary_base, salary_commission_rate, bank_name, bank_account FROM crm_employee_profile WHERE user_id = ?',
    [userId]
  );
  return profile || {};
}

/**
 * 创建/更新员工档案
 */
async function saveEmployeeProfile(pool, userId, data) {
  const [[user]] = await pool.query('SELECT id FROM sys_user WHERE id = ?', [userId]);
  if (!user) return null;

  const fields = ['gender', 'birth_date', 'id_card', 'hire_date', 'leave_date', 'position', 'employment_type',
    'contract_start', 'contract_end', 'salary_base', 'salary_commission_rate', 'bank_name', 'bank_account',
    'emergency_contact', 'emergency_phone', 'address', 'education', 'university', 'major', 'remark'];

  const cols = [], vals = [], updates = [];
  const dateFields = ['birth_date', 'hire_date', 'leave_date', 'contract_start', 'contract_end'];
  for (const f of fields) {
    if (data[f] !== undefined) {
      let val = data[f] || null;
      if (dateFields.includes(f) && val && typeof val === 'string' && val.includes('T')) {
        val = val.split('T')[0];
      }
      cols.push(f);
      vals.push(val);
      updates.push(`${f} = VALUES(${f})`);
    }
  }

  if (cols.length === 0) return false;

  cols.unshift('user_id');
  vals.unshift(userId);

  await pool.query(
    `INSERT INTO crm_employee_profile (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
    vals
  );
  return true;
}

/**
 * 员工佣金汇总
 */
async function getEmployeeCommission(pool, userId) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const quarterStart = `${now.getFullYear()}-${String(Math.ceil((now.getMonth() + 1) / 3) * 3 - 2).padStart(2, '0')}`;
  const yearStart = `${now.getFullYear()}-01`;

  const [[monthTotal]] = await pool.query(
    "SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE user_id = ? AND period = ?", [userId, thisMonth]
  );
  const [[quarterTotal]] = await pool.query(
    "SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE user_id = ? AND period >= ?", [userId, quarterStart]
  );
  const [[yearTotal]] = await pool.query(
    "SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE user_id = ? AND period >= ?", [userId, yearStart]
  );

  const [records] = await pool.query(`
    SELECT r.*, ru.real_name as user_name
    FROM crm_commission_record r
    JOIN sys_user ru ON r.user_id = ru.id
    WHERE r.user_id = ? ORDER BY r.period DESC, r.create_time DESC LIMIT 50
  `, [userId]);

  return { month_total: parseFloat(monthTotal.total), quarter_total: parseFloat(quarterTotal.total), year_total: parseFloat(yearTotal.total), records };
}

// ============ 佣金规则 ============

/**
 * 查询佣金规则列表
 */
async function getCommissionRules(pool) {
  const [rows] = await pool.query('SELECT * FROM crm_commission_rule WHERE deleted_at IS NULL ORDER BY create_time DESC');
  return rows;
}

/**
 * 创建佣金规则
 */
async function createCommissionRule(pool, data, userId) {
  const { name, rule_type, apply_to, config, remark } = data;
  const configStr = typeof config === 'string' ? config : JSON.stringify(config);
  const [result] = await pool.query(
    'INSERT INTO crm_commission_rule (name, rule_type, apply_to, config, remark, create_by) VALUES (?, ?, ?, ?, ?, ?)',
    [name, rule_type, apply_to || 'contract', configStr, remark || null, userId]
  );
  return { id: result.insertId };
}

/**
 * 更新佣金规则
 */
async function updateCommissionRule(pool, id, data) {
  const { name, rule_type, apply_to, config, status, remark } = data;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (rule_type !== undefined) { fields.push('rule_type = ?'); values.push(rule_type); }
  if (apply_to !== undefined) { fields.push('apply_to = ?'); values.push(apply_to); }
  if (config !== undefined) { fields.push('config = ?'); values.push(typeof config === 'string' ? config : JSON.stringify(config)); }
  if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
  if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
  if (fields.length === 0) return false;
  values.push(id);
  await pool.query(`UPDATE crm_commission_rule SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
  return true;
}

/**
 * 软删除佣金规则
 */
async function deleteCommissionRule(pool, id) {
  await pool.query('UPDATE crm_commission_rule SET deleted_at = NOW() WHERE id = ?', [id]);
}

// ============ 佣金计算 ============

/**
 * 计算佣金
 */
async function calculateCommission(pool, { period, user_ids }) {
  const [[defaultRule]] = await pool.query(
    "SELECT * FROM crm_commission_rule WHERE status = 1 AND deleted_at IS NULL AND apply_to = 'contract' ORDER BY id LIMIT 1"
  );

  let userWhere = "WHERE u.status = 1 AND r.code IN ('sales', 'admin', 'super_admin')";
  const userParams = [];
  if (user_ids && user_ids.length > 0) {
    userWhere += ` AND u.id IN (${user_ids.map(() => '?').join(',')})`;
    userParams.push(...user_ids);
  }

  const [salesUsers] = await pool.query(`
    SELECT u.id, u.real_name, p.salary_commission_rate, p.salary_base
    FROM sys_user u
    JOIN sys_role r ON u.role_id = r.id
    LEFT JOIN crm_employee_profile p ON u.id = p.user_id
    ${userWhere}
  `, userParams);

  const [year, month] = period.split('-');
  const monthStart = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? `${parseInt(year) + 1}-01-01` : `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;

  const results = [];

  for (const user of salesUsers) {
    const [[contractData]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE create_by = ? AND deleted_at IS NULL AND sign_date >= ? AND sign_date < ?",
      [user.id, monthStart, nextMonth]
    );

    const [[paymentData]] = await pool.query(`
      SELECT COALESCE(SUM(p.pay_amount), 0) as total
      FROM crm_payment p JOIN crm_contract c ON p.contract_id = c.id
      WHERE c.create_by = ? AND p.deleted_at IS NULL AND p.pay_date >= ? AND p.pay_date < ?
    `, [user.id, monthStart, nextMonth]);

    const contractAmount = parseFloat(contractData.total);
    const paymentAmount = parseFloat(paymentData.total);

    if (contractAmount === 0 && paymentAmount === 0) continue;

    let rate = user.salary_commission_rate || 0;
    if (rate === 0 && defaultRule) {
      try {
        const config = JSON.parse(defaultRule.config);
        rate = config.rate || 0;
      } catch { /* */ }
    }

    const baseAmount = contractAmount;
    const commissionAmount = baseAmount * rate / 100;

    if (commissionAmount > 0) {
      await pool.query(
        'INSERT IGNORE INTO crm_commission_record (user_id, rule_id, business_type, business_id, base_amount, commission_rate, commission_amount, period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, defaultRule?.id || null, 'contract', 0, baseAmount, rate, commissionAmount, period]
      );

      results.push({
        user_id: user.id, real_name: user.real_name,
        contract_amount: contractAmount, payment_amount: paymentAmount,
        base_amount: baseAmount, rate, commission_amount: commissionAmount
      });
    }
  }

  return { period, results, count: results.length };
}

/**
 * 查询佣金记录
 */
async function getCommissionRecords(pool, { period, user_id, status, page = 1, pageSize = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE 1=1';
  const params = [];
  if (period) { where += ' AND r.period = ?'; params.push(period); }
  if (user_id) { where += ' AND r.user_id = ?'; params.push(user_id); }
  if (status) { where += ' AND r.status = ?'; params.push(status); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_commission_record r ${where}`, params);
  const [rows] = await pool.query(`
    SELECT r.*, u.real_name as user_name,
      CASE WHEN r.business_type = 'contract' THEN c.contract_no ELSE CONCAT('回款#', r.business_id) END as business_no,
      COALESCE(cu.company_name, cu2.company_name) as customer_name
    FROM crm_commission_record r
    JOIN sys_user u ON r.user_id = u.id
    LEFT JOIN crm_contract c ON r.business_type = 'contract' AND r.business_id = c.id
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN crm_payment p ON r.business_type = 'payment' AND r.business_id = p.id
    LEFT JOIN crm_contract c2 ON p.contract_id = c2.id
    LEFT JOIN crm_customer cu2 ON c2.customer_id = cu2.id
    ${where} ORDER BY r.period DESC, r.create_time DESC LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  return { list: rows, total };
}

/**
 * 佣金统计
 */
async function getCommissionStats(pool) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearStart = `${now.getFullYear()}-01`;

  const [[pending]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'calculated'", [thisMonth]);
  const [[confirmed]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'confirmed'", [thisMonth]);
  const [[paid]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'paid'", [thisMonth]);
  const [[yearTotal]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period >= ?", [yearStart]);

  return { pending: parseFloat(pending.total), confirmed: parseFloat(confirmed.total), paid: parseFloat(paid.total), year_total: parseFloat(yearTotal.total) };
}

/**
 * 批量确认佣金
 */
async function batchConfirmCommission(pool, ids) {
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(`UPDATE crm_commission_record SET status = 'confirmed' WHERE id IN (${placeholders}) AND status = 'calculated'`, ids);
}

/**
 * 批量发放佣金
 */
async function batchPayCommission(pool, ids) {
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(`UPDATE crm_commission_record SET status = 'paid' WHERE id IN (${placeholders}) AND status = 'confirmed'`, ids);
}

// ============ 组织架构 ============

/**
 * 查询组织架构树
 */
async function getOrgTree(pool) {
  const [depts] = await pool.query(`
    SELECT d.id, d.name, d.parent_id, d.sort,
           (SELECT COUNT(*) FROM sys_user u WHERE u.dept_id = d.id AND u.status = 1) as employee_count,
           (SELECT u.real_name FROM sys_user u WHERE u.dept_id = d.id AND u.role_id IN (1, 2) AND u.status = 1 LIMIT 1) as manager_name
    FROM sys_dept d WHERE d.deleted_at IS NULL ORDER BY d.sort, d.id
  `);

  const map = {};
  const roots = [];
  depts.forEach(d => { map[d.id] = { ...d, children: [] }; });
  depts.forEach(d => {
    if (d.parent_id && map[d.parent_id]) {
      map[d.parent_id].children.push(map[d.id]);
    } else {
      roots.push(map[d.id]);
    }
  });

  const [[totalDepts]] = await pool.query("SELECT COUNT(*) as cnt FROM sys_dept WHERE deleted_at IS NULL");
  const [[totalEmployees]] = await pool.query("SELECT COUNT(*) as cnt FROM sys_user WHERE status = 1");

  return { tree: roots, total_depts: totalDepts.cnt, total_employees: totalEmployees.cnt };
}

/**
 * 查询部门员工列表
 */
async function getDeptEmployees(pool, deptId) {
  const [rows] = await pool.query(`
    SELECT u.id, u.real_name, u.phone, u.email, p.position, p.employment_type
    FROM sys_user u LEFT JOIN crm_employee_profile p ON u.id = p.user_id
    WHERE u.dept_id = ? AND u.status = 1 ORDER BY u.id
  `, [deptId]);
  return rows;
}

module.exports = {
  // 员工档案
  getEmployees,
  getEmployeeStats,
  getEmployee,
  getEmployeeSalary,
  saveEmployeeProfile,
  getEmployeeCommission,
  // 佣金规则
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  // 佣金计算
  calculateCommission,
  getCommissionRecords,
  getCommissionStats,
  batchConfirmCommission,
  batchPayCommission,
  // 组织架构
  getOrgTree,
  getDeptEmployees
};
