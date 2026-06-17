const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireManager } = require('../middleware/admin');

// ============ 员工档案 ============

// 员工列表
router.get('/employees', authenticateToken, requireManager, async (req, res) => {
  try {
    const { dept_id, status, keyword, contract_expiring, page = 1, pageSize = 20 } = req.query;
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

    // 即将到期合同数
    const [[{ expiring }]] = await pool.query(
      `SELECT COUNT(*) as expiring FROM crm_employee_profile p
       JOIN sys_user u ON p.user_id = u.id
       WHERE u.status = 1 AND p.contract_end IS NOT NULL
         AND p.contract_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
    );

    res.json({ code: 200, message: '查询成功', data: { list: rows, total, expiring_contracts: expiring } });
  } catch (error) {
    console.error('[HR] 员工列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工统计
router.get('/employees/stats', authenticateToken, requireManager, async (req, res) => {
  try {
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

    res.json({
      code: 200, message: '查询成功',
      data: { total: total.cnt, active: active.cnt, inactive: inactive.cnt, new_hire: newHire.cnt, new_leave: newLeave.cnt, dept_distribution: deptDist }
    });
  } catch (error) {
    console.error('[HR] 员工统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工详情
router.get('/employees/:id', authenticateToken, async (req, res) => {
  try {
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
    `, [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: '员工不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[HR] 员工详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工薪资信息（仅管理员可访问）
router.get('/employees/:id/salary', authenticateToken, requireManager, async (req, res) => {
  try {
    const [[profile]] = await pool.query(
      'SELECT salary_base, salary_commission_rate, bank_name, bank_account FROM crm_employee_profile WHERE user_id = ?',
      [req.params.id]
    );
    res.json({ code: 200, message: '查询成功', data: profile || {} });
  } catch (error) {
    console.error('[HR] 员工薪资查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建/更新员工档案
router.post('/employees/:id/profile', authenticateToken, requireManager, async (req, res) => {
  try {
    const userId = req.params.id;
    const [[user]] = await pool.query('SELECT id FROM sys_user WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ code: 404, message: '员工不存在', data: null });

    const fields = ['gender', 'birth_date', 'id_card', 'hire_date', 'leave_date', 'position', 'employment_type',
      'contract_start', 'contract_end', 'salary_base', 'salary_commission_rate', 'bank_name', 'bank_account',
      'emergency_contact', 'emergency_phone', 'address', 'education', 'university', 'major', 'remark'];

    const cols = [], vals = [], updates = [];
    const dateFields = ['birth_date', 'hire_date', 'leave_date', 'contract_start', 'contract_end'];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        let val = req.body[f] || null;
        // 日期字段格式转换：ISO格式 -> YYYY-MM-DD
        if (dateFields.includes(f) && val && typeof val === 'string' && val.includes('T')) {
          val = val.split('T')[0];
        }
        cols.push(f);
        vals.push(val);
        updates.push(`${f} = VALUES(${f})`);
      }
    }

    if (cols.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });

    cols.unshift('user_id');
    vals.unshift(userId);

    await pool.query(
      `INSERT INTO crm_employee_profile (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      vals
    );
    res.json({ code: 200, message: '保存成功', data: null });
  } catch (error) {
    console.error('[HR] 员工档案保存失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工佣金汇总
router.get('/employees/:id/commission', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
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

    res.json({
      code: 200, message: '查询成功',
      data: { month_total: parseFloat(monthTotal.total), quarter_total: parseFloat(quarterTotal.total), year_total: parseFloat(yearTotal.total), records }
    });
  } catch (error) {
    console.error('[HR] 员工佣金查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 佣金规则 ============

router.get('/commission/rules', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_commission_rule WHERE deleted_at IS NULL ORDER BY create_time DESC');
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[HR] 佣金规则查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/commission/rules', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, rule_type, apply_to, config, remark } = req.body;
    if (!name || !rule_type || !config) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const configStr = typeof config === 'string' ? config : JSON.stringify(config);
    const [result] = await pool.query(
      'INSERT INTO crm_commission_rule (name, rule_type, apply_to, config, remark, create_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name, rule_type, apply_to || 'contract', configStr, remark || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[HR] 创建佣金规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/commission/rules/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, rule_type, apply_to, config, status, remark } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (rule_type !== undefined) { fields.push('rule_type = ?'); values.push(rule_type); }
    if (apply_to !== undefined) { fields.push('apply_to = ?'); values.push(apply_to); }
    if (config !== undefined) { fields.push('config = ?'); values.push(typeof config === 'string' ? config : JSON.stringify(config)); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_commission_rule SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[HR] 更新佣金规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/commission/rules/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    await pool.query('UPDATE crm_commission_rule SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[HR] 删除佣金规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计算佣金
router.post('/commission/calculate', authenticateToken, requireManager, async (req, res) => {
  try {
    const { period, user_ids } = req.body;
    if (!period) return res.status(400).json({ code: 400, message: '请选择月份', data: null });

    // 获取默认规则
    const [[defaultRule]] = await pool.query(
      "SELECT * FROM crm_commission_rule WHERE status = 1 AND deleted_at IS NULL AND apply_to = 'contract' ORDER BY id LIMIT 1"
    );

    // 获取销售人员
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
      // 查询该月合同金额
      const [[contractData]] = await pool.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE create_by = ? AND deleted_at IS NULL AND sign_date >= ? AND sign_date < ?",
        [user.id, monthStart, nextMonth]
      );

      // 查询该月回款金额
      const [[paymentData]] = await pool.query(`
        SELECT COALESCE(SUM(p.pay_amount), 0) as total
        FROM crm_payment p JOIN crm_contract c ON p.contract_id = c.id
        WHERE c.create_by = ? AND p.deleted_at IS NULL AND p.pay_date >= ? AND p.pay_date < ?
      `, [user.id, monthStart, nextMonth]);

      const contractAmount = parseFloat(contractData.total);
      const paymentAmount = parseFloat(paymentData.total);

      if (contractAmount === 0 && paymentAmount === 0) continue;

      // 确定佣金比例
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
        // INSERT IGNORE避免重复
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

    res.json({ code: 200, message: '计算完成', data: { period, results, count: results.length } });
  } catch (error) {
    console.error('[HR] 佣金计算失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 佣金记录列表
router.get('/commission/records', authenticateToken, async (req, res) => {
  try {
    const { period, user_id, status, page = 1, pageSize = 20 } = req.query;
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

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[HR] 佣金记录查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 佣金统计
router.get('/commission/stats', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearStart = `${now.getFullYear()}-01`;

    const [[pending]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'calculated'", [thisMonth]);
    const [[confirmed]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'confirmed'", [thisMonth]);
    const [[paid]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period = ? AND status = 'paid'", [thisMonth]);
    const [[yearTotal]] = await pool.query("SELECT COALESCE(SUM(commission_amount), 0) as total FROM crm_commission_record WHERE period >= ?", [yearStart]);

    res.json({
      code: 200, message: '查询成功',
      data: { pending: parseFloat(pending.total), confirmed: parseFloat(confirmed.total), paid: parseFloat(paid.total), year_total: parseFloat(yearTotal.total) }
    });
  } catch (error) {
    console.error('[HR] 佣金统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量确认
router.post('/commission/records/batch-confirm', authenticateToken, requireManager, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择记录', data: null });
    const placeholders = ids.map(() => '?').join(',');
    await pool.query(`UPDATE crm_commission_record SET status = 'confirmed' WHERE id IN (${placeholders}) AND status = 'calculated'`, ids);
    res.json({ code: 200, message: '确认成功', data: null });
  } catch (error) {
    console.error('[HR] 批量确认失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量发放
router.post('/commission/records/batch-pay', authenticateToken, requireManager, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择记录', data: null });
    const placeholders = ids.map(() => '?').join(',');
    await pool.query(`UPDATE crm_commission_record SET status = 'paid' WHERE id IN (${placeholders}) AND status = 'confirmed'`, ids);
    res.json({ code: 200, message: '发放成功', data: null });
  } catch (error) {
    console.error('[HR] 批量发放失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 组织架构 ============

router.get('/org-tree', authenticateToken, async (req, res) => {
  try {
    const [depts] = await pool.query(`
      SELECT d.id, d.name, d.parent_id, d.sort,
             (SELECT COUNT(*) FROM sys_user u WHERE u.dept_id = d.id AND u.status = 1) as employee_count,
             (SELECT u.real_name FROM sys_user u WHERE u.dept_id = d.id AND u.role_id IN (1, 2) AND u.status = 1 LIMIT 1) as manager_name
      FROM sys_dept d WHERE d.deleted_at IS NULL ORDER BY d.sort, d.id
    `);

    // 构建树
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

    // 统计
    const [[totalDepts]] = await pool.query("SELECT COUNT(*) as cnt FROM sys_dept WHERE deleted_at IS NULL");
    const [[totalEmployees]] = await pool.query("SELECT COUNT(*) as cnt FROM sys_user WHERE status = 1");

    res.json({
      code: 200, message: '查询成功',
      data: { tree: roots, total_depts: totalDepts.cnt, total_employees: totalEmployees.cnt }
    });
  } catch (error) {
    console.error('[HR] 组织架构查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 部门员工列表
router.get('/org-tree/:deptId/employees', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.real_name, u.phone, u.email, p.position, p.employment_type
      FROM sys_user u LEFT JOIN crm_employee_profile p ON u.id = p.user_id
      WHERE u.dept_id = ? AND u.status = 1 ORDER BY u.id
    `, [req.params.deptId]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[HR] 部门员工查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
