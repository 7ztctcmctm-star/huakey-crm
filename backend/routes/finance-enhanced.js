const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// ============ 回款提醒 ============

// 提醒列表
router.get('/reminders', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { status = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND r.status = ?'; params.push(status); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_payment_reminder r ${where}`, params);
    const [rows] = await pool.query(`
      SELECT r.*, c.contract_no, cu.company_name as customer_name
      FROM crm_payment_reminder r
      JOIN crm_contract c ON r.contract_id = c.id
      JOIN crm_customer cu ON r.customer_id = cu.id
      ${where} ORDER BY r.remind_date ASC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[财务] 提醒列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 生成回款提醒
router.post('/reminders/generate', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    let created = 0;

    // 即将到期：未来7天内到期的回款计划
    const [upcoming] = await pool.query(`
      SELECT pp.id as plan_id, pp.contract_id, c.customer_id, pp.plan_date, pp.plan_amount,
             DATEDIFF(pp.plan_date, CURDATE()) as remind_days
      FROM crm_payment_plan pp
      JOIN crm_contract c ON pp.contract_id = c.id
      WHERE pp.status != 'completed' AND c.deleted_at IS NULL
        AND pp.plan_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND NOT EXISTS (
          SELECT 1 FROM crm_payment_reminder pr
          WHERE pr.contract_id = pp.contract_id AND pr.plan_id = pp.id
            AND pr.remind_type = 'upcoming' AND pr.remind_date = CURDATE()
        )
    `);

    for (const r of upcoming) {
      await pool.query(
        'INSERT IGNORE INTO crm_payment_reminder (contract_id, plan_id, customer_id, remind_date, remind_type, remind_days, amount) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)',
        [r.contract_id, r.plan_id, r.customer_id, 'upcoming', r.remind_days, r.plan_amount]
      );
      created++;
    }

    // 已逾期：超过计划日期未完成回款
    const [overdue] = await pool.query(`
      SELECT pp.id as plan_id, pp.contract_id, c.customer_id, pp.plan_date, pp.plan_amount,
             DATEDIFF(CURDATE(), pp.plan_date) as remind_days
      FROM crm_payment_plan pp
      JOIN crm_contract c ON pp.contract_id = c.id
      WHERE pp.status != 'completed' AND c.deleted_at IS NULL
        AND pp.plan_date < CURDATE()
        AND NOT EXISTS (
          SELECT 1 FROM crm_payment_reminder pr
          WHERE pr.contract_id = pp.contract_id AND pr.plan_id = pp.id
            AND pr.remind_type = 'overdue' AND pr.remind_date = CURDATE()
        )
    `);

    for (const r of overdue) {
      await pool.query(
        'INSERT IGNORE INTO crm_payment_reminder (contract_id, plan_id, customer_id, remind_date, remind_type, remind_days, amount) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)',
        [r.contract_id, r.plan_id, r.customer_id, 'overdue', -r.remind_days, r.plan_amount]
      );
      created++;
    }

    res.json({ code: 200, message: `生成完成，新增 ${created} 条提醒`, data: { created } });
  } catch (error) {
    console.error('[财务] 生成提醒失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 确认提醒
router.put('/reminders/:id/acknowledge', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    await pool.query("UPDATE crm_payment_reminder SET status = 'acknowledged' WHERE id = ?", [req.params.id]);
    res.json({ code: 200, message: '已确认', data: null });
  } catch (error) {
    console.error('[财务] 确认提醒失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 提醒汇总
router.get('/reminders/summary', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const [[{ today_pending }]] = await pool.query("SELECT COUNT(*) as today_pending FROM crm_payment_reminder WHERE status = 'pending' AND remind_date = CURDATE()");
    const [[{ upcoming }]] = await pool.query("SELECT COUNT(*) as upcoming FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'upcoming'");
    const [[{ overdue }]] = await pool.query("SELECT COUNT(*) as overdue FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'overdue'");
    const [[{ overdue_amount }]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as overdue_amount FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'overdue'");

    res.json({
      code: 200, message: '查询成功',
      data: { today_pending, upcoming, overdue, overdue_amount: parseFloat(overdue_amount) }
    });
  } catch (error) {
    console.error('[财务] 提醒汇总查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 对账管理 ============

// 客户对账数据
router.get('/reconciliation/customer', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { customer_id, start_date, end_date } = req.query;
    if (!customer_id) return res.status(400).json({ code: 400, message: '请选择客户', data: null });

    const now = new Date();
    const startDate = start_date || `${now.getFullYear()}-01-01`;
    const endDate = end_date || `${now.getFullYear()}-12-31`;

    // 客户信息
    const [[customer]] = await pool.query('SELECT id, company_name, contact_name, phone FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [customer_id]);
    if (!customer) return res.status(404).json({ code: 404, message: '客户不存在', data: null });

    // 合同列表
    const [contracts] = await pool.query(`
      SELECT id, contract_no, amount, sign_date, status
      FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL
        AND sign_date BETWEEN ? AND ?
      ORDER BY sign_date
    `, [customer_id, startDate, endDate]);

    // 回款记录
    const [payments] = await pool.query(`
      SELECT p.id, p.pay_amount, p.pay_date, p.pay_method, ct.contract_no
      FROM crm_payment p
      JOIN crm_contract ct ON p.contract_id = ct.id
      WHERE ct.customer_id = ? AND ct.deleted_at IS NULL AND p.deleted_at IS NULL
        AND p.pay_date BETWEEN ? AND ?
      ORDER BY p.pay_date
    `, [customer_id, startDate, endDate]);

    const totalAmount = contracts.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
    const paidAmount = payments.reduce((s, p) => s + parseFloat(p.pay_amount || 0), 0);

    res.json({
      code: 200, message: '查询成功',
      data: { customer, contracts, payments, summary: { total_amount: totalAmount, paid_amount: paidAmount, unpaid_amount: totalAmount - paidAmount } }
    });
  } catch (error) {
    console.error('[财务] 客户对账查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 供应商对账数据
router.get('/reconciliation/supplier', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { supplier_id, start_date, end_date } = req.query;
    if (!supplier_id) return res.status(400).json({ code: 400, message: '请选择供应商', data: null });

    const now = new Date();
    const startDate = start_date || `${now.getFullYear()}-01-01`;
    const endDate = end_date || `${now.getFullYear()}-12-31`;

    const [[supplier]] = await pool.query('SELECT id, name, contact_person, phone FROM crm_supplier WHERE id = ? AND deleted_at IS NULL', [supplier_id]);
    if (!supplier) return res.status(404).json({ code: 404, message: '供应商不存在', data: null });

    const [orders] = await pool.query(`
      SELECT id, order_no, total_amount, create_time, status
      FROM crm_purchase_order WHERE supplier_id = ? AND deleted_at IS NULL
        AND create_time BETWEEN ? AND ?
      ORDER BY create_time
    `, [supplier_id, startDate, endDate + ' 23:59:59']);

    const totalAmount = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

    res.json({
      code: 200, message: '查询成功',
      data: { supplier, orders, payments: [], summary: { total_amount: totalAmount, paid_amount: 0, unpaid_amount: totalAmount } }
    });
  } catch (error) {
    console.error('[财务] 供应商对账查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 生成对账单号
const generateReconNo = async () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_reconciliation WHERE recon_no LIKE ?", [`RC-${dateStr}-%`]);
  return `RC-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;
};

// 保存对账单
router.post('/reconciliation/save', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { recon_type, target_id, target_name, period_start, period_end, total_amount, paid_amount, unpaid_amount, detail_data } = req.body;
    if (!recon_type || !target_id) return res.status(400).json({ code: 400, message: '参数不完整', data: null });

    const reconNo = await generateReconNo();
    const [result] = await pool.query(
      'INSERT INTO crm_reconciliation (recon_no, recon_type, target_id, target_name, period_start, period_end, total_amount, paid_amount, unpaid_amount, detail_data, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [reconNo, recon_type, target_id, target_name || null, period_start, period_end, total_amount || 0, paid_amount || 0, unpaid_amount || 0, detail_data || null, req.user.userId]
    );
    res.json({ code: 200, message: '保存成功', data: { id: result.insertId, recon_no: reconNo } });
  } catch (error) {
    console.error('[财务] 保存对账单失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 对账单列表
router.get('/reconciliation/list', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { recon_type = '', status = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE 1=1';
    const params = [];
    if (recon_type) { where += ' AND recon_type = ?'; params.push(recon_type); }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_reconciliation ${where}`, params);
    const [rows] = await pool.query(`
      SELECT r.*, u.real_name as create_by_name
      FROM crm_reconciliation r LEFT JOIN sys_user u ON r.create_by = u.id
      ${where} ORDER BY r.create_time DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[财务] 对账单列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 财务分析 ============

router.get('/analysis', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const now = new Date();
    const yearStart = start_date || `${now.getFullYear()}-01-01`;
    const yearEnd = end_date || `${now.getFullYear()}-12-31`;

    // 利润分析
    const [[income]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [yearStart, yearEnd]
    );
    const [[cost]] = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [yearStart, yearEnd + ' 23:59:59']
    );
    const grossProfit = parseFloat(income.total) - parseFloat(cost.total);
    const grossMargin = parseFloat(income.total) > 0 ? (grossProfit / parseFloat(income.total) * 100).toFixed(1) : 0;

    // 成本结构（按采购类别/供应商分）
    const [costStructure] = await pool.query(`
      SELECT s.type as name, COALESCE(SUM(po.total_amount), 0) as value
      FROM crm_purchase_order po
      JOIN crm_supplier s ON po.supplier_id = s.id
      WHERE po.deleted_at IS NULL AND po.create_time BETWEEN ? AND ?
      GROUP BY s.type ORDER BY value DESC
    `, [yearStart, yearEnd + ' 23:59:59']);

    // 应收账款账龄
    const [receivables] = await pool.query(`
      SELECT c.id, c.amount, COALESCE(SUM(p.pay_amount), 0) as paid,
             DATEDIFF(CURDATE(), COALESCE(c.sign_date, c.create_time)) as age_days
      FROM crm_contract c
      LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
      GROUP BY c.id HAVING (c.amount - paid) > 0
    `);

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    receivables.forEach(r => {
      const unpaid = parseFloat(r.amount) - parseFloat(r.paid);
      if (r.age_days <= 30) aging['0-30'] += unpaid;
      else if (r.age_days <= 60) aging['31-60'] += unpaid;
      else if (r.age_days <= 90) aging['61-90'] += unpaid;
      else aging['90+'] += unpaid;
    });

    // 现金流（最近12个月）
    const [cashIn] = await pool.query(`
      SELECT DATE_FORMAT(pay_date, '%Y-%m') as month, COALESCE(SUM(pay_amount), 0) as amount
      FROM crm_payment WHERE deleted_at IS NULL AND pay_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month
    `);
    const [cashOut] = await pool.query(`
      SELECT DATE_FORMAT(create_time, '%Y-%m') as month, COALESCE(SUM(total_amount), 0) as amount
      FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month
    `);

    // 收款效率
    const [paymentCycle] = await pool.query(`
      SELECT AVG(DATEDIFF(p.pay_date, c.sign_date)) as avg_days
      FROM crm_payment p
      JOIN crm_contract c ON p.contract_id = c.id
      WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
        AND p.pay_date BETWEEN ? AND ? AND c.sign_date IS NOT NULL
    `, [yearStart, yearEnd]);

    // 回款率趋势
    const [collectionTrend] = await pool.query(`
      SELECT month, contract_amount, COALESCE(paid_amount, 0) as paid_amount FROM (
        SELECT DATE_FORMAT(c.sign_date, '%Y-%m') as month,
               COALESCE(SUM(c.amount), 0) as contract_amount
        FROM crm_contract c WHERE c.deleted_at IS NULL AND c.sign_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY month
      ) t1 LEFT JOIN (
        SELECT DATE_FORMAT(p.pay_date, '%Y-%m') as month,
               COALESCE(SUM(p.pay_amount), 0) as paid_amount
        FROM crm_payment p
        JOIN crm_contract c2 ON p.contract_id = c2.id
        WHERE p.deleted_at IS NULL AND c2.deleted_at IS NULL AND p.pay_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY month
      ) t2 USING (month)
      ORDER BY month
    `);

    // 合并现金流
    const cashFlowMap = {};
    cashIn.forEach(r => { cashFlowMap[r.month] = { month: r.month, inflow: parseFloat(r.amount), outflow: 0 }; });
    cashOut.forEach(r => {
      if (cashFlowMap[r.month]) cashFlowMap[r.month].outflow = parseFloat(r.amount);
      else cashFlowMap[r.month] = { month: r.month, inflow: 0, outflow: parseFloat(r.amount) };
    });

    res.json({
      code: 200, message: '查询成功',
      data: {
        profit: { income: parseFloat(income.total), cost: parseFloat(cost.total), gross_profit: grossProfit, gross_margin: parseFloat(grossMargin) },
        costStructure,
        aging: Object.entries(aging).map(([label, amount]) => ({ label, amount })),
        cashFlow: Object.values(cashFlowMap).sort((a, b) => a.month.localeCompare(b.month)),
        collection: { avg_days: paymentCycle[0]?.avg_days ? Math.round(paymentCycle[0].avg_days) : 0, trend: collectionTrend }
      }
    });
  } catch (error) {
    console.error('[财务] 分析查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 财务分析导出CSV
router.get('/analysis/export', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const now = new Date();
    const yearStart = start_date || `${now.getFullYear()}-01-01`;
    const yearEnd = end_date || `${now.getFullYear()}-12-31`;

    const [rows] = await pool.query(`
      SELECT c.contract_no as '合同编号', cu.company_name as '客户名称', c.amount as '合同金额',
             c.sign_date as '签订日期', COALESCE(SUM(p.pay_amount), 0) as '已回款',
             (c.amount - COALESCE(SUM(p.pay_amount), 0)) as '未回款'
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.sign_date BETWEEN ? AND ?
      GROUP BY c.id ORDER BY c.sign_date DESC
    `, [yearStart, yearEnd]);

    if (rows.length === 0) return res.status(404).json({ code: 404, message: '无数据', data: null });

    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=financial_analysis.csv');
    res.send('﻿' + csv);
  } catch (error) {
    console.error('[财务] 导出失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

module.exports = router;
