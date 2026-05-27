const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 1. 获取销售目标列表（含达成率）
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.body;
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

    res.json({
      code: 200,
      message: '查询成功',
      data: { year: y, month: m, list }
    });
  } catch (error) {
    console.error('获取销售目标错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 设置/更新销售目标
router.post('/set', authenticateToken, checkPermission('target'), async (req, res) => {
  try {
    const { user_id, year, month, target_amount } = req.body;

    if (!user_id || !year || !month) {
      return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    }

    // 检查用户是否存在
    const [users] = await pool.query('SELECT id FROM sys_user WHERE id = ? AND status = 1', [user_id]);
    if (users.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    // 使用 INSERT ... ON DUPLICATE KEY 更新
    await pool.query(
      `INSERT INTO crm_sales_target (user_id, year, month, target_amount, create_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount), update_time = NOW()`,
      [user_id, year, month, target_amount || 0, req.user.userId]
    );

    res.json({ code: 200, message: '设置目标成功', data: null });
  } catch (error) {
    console.error('设置销售目标错误:', error);
    res.status(500).json({ code: 500, message: '设置目标失败', data: null });
  }
});

// 3. 批量设置销售目标
router.post('/batch-set', authenticateToken, checkPermission('target'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { year, month, targets } = req.body;

    if (!year || !month || !targets || !Array.isArray(targets)) {
      return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    }

    await connection.beginTransaction();

    for (const t of targets) {
      await connection.query(
        `INSERT INTO crm_sales_target (user_id, year, month, target_amount, create_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount), update_time = NOW()`,
        [t.user_id, year, month, t.target_amount || 0, req.user.userId]
      );
    }

    await connection.commit();
    res.json({ code: 200, message: '批量设置成功', data: null });
  } catch (error) {
    await connection.rollback();
    console.error('批量设置销售目标错误:', error);
    res.status(500).json({ code: 500, message: '批量设置失败', data: null });
  } finally {
    connection.release();
  }
});

// 4. 删除销售目标
router.post('/delete', authenticateToken, checkPermission('target'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ code: 400, message: '目标ID不能为空', data: null });
    }

    await pool.query('UPDATE crm_sales_target SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除目标成功', data: null });
  } catch (error) {
    console.error('删除销售目标错误:', error);
    res.status(500).json({ code: 500, message: '删除目标失败', data: null });
  }
});

module.exports = router;
