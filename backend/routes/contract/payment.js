const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const ROLES = require('../../config/roles');
const { createRouteLogger } = require('../../middleware/logger');
const paymentService = require('../../services/paymentService');

const logAction = createRouteLogger('合同管理');

// --- Joi schemas ---

const paymentAddSchema = Joi.object({
  contract_id: Joi.number().integer().positive().required(),
  plan_id: Joi.number().integer().positive().allow(null),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// --- Routes ---

router.post('/payment/add', authenticateToken, checkPermission('contract'), validate(paymentAddSchema), async (req, res) => {
  const { contract_id, plan_id, pay_date, pay_amount, pay_method, remark } = req.body;

  try {
    const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [contract_id]);
    if (!contracts.length) {
      return res.status(404).json({ code: 404, message: '所属合同不存在', data: null });
    }
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contracts[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权为该合同登记回款', data: null });
    }

    await paymentService.recordPayment(pool, { contract_id, plan_id, pay_date, pay_amount, pay_method, remark });

    await logAction(req, 'add', `登记回款: 合同ID=${contract_id}, 金额=${pay_amount}`);
    res.json({ code: 200, message: '登记回款成功', data: null });
  } catch (error) {
    console.error('[合同] 登记回款失败:', error.message);
    res.status(500).json({ code: 500, message: '登记回款失败', data: null });
  }
});

router.post('/payment/update', authenticateToken, checkPermission('contract'), validate(paymentUpdateSchema), async (req, res) => {
  const { id, pay_date, pay_amount, pay_method, remark } = req.body;

  try {
    const [oldPayment] = await pool.query('SELECT plan_id, contract_id FROM crm_payment WHERE id = ?', [id]);

    if (oldPayment.length) {
      const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [oldPayment[0].contract_id]);
      if (contracts.length) {
        const { manageAll, roleId, userId } = req.user;
        if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contracts[0].create_by !== userId) {
          return res.status(403).json({ code: 403, message: '无权修改该回款记录', data: null });
        }
      }
    }

    await paymentService.updatePayment(pool, { id, pay_date, pay_amount, pay_method, remark });

    await logAction(req, 'update', `修改回款记录: ID=${id}`);
    res.json({ code: 200, message: '修改回款记录成功', data: null });
  } catch (error) {
    console.error('[合同] 修改回款记录失败:', error);
    res.status(500).json({ code: 500, message: '修改回款记录失败', data: null });
  }
});

router.post('/payment/delete', authenticateToken, checkPermission('contract'), validate(paymentDeleteSchema), async (req, res) => {
  const { id } = req.body;

  try {
    const [payments] = await pool.query('SELECT contract_id, plan_id FROM crm_payment WHERE id=? AND deleted_at IS NULL', [id]);
    if (!payments.length) {
      return res.status(404).json({ code: 404, message: '回款记录不存在', data: null });
    }

    const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [payments[0].contract_id]);
    if (!contracts.length) {
      return res.status(404).json({ code: 404, message: '所属合同不存在', data: null });
    }

    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contracts[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该回款记录', data: null });
    }

    await paymentService.deletePayment(pool, id);

    await logAction(req, 'delete', `删除回款记录: ID=${id}`);
    res.json({ code: 200, message: '删除回款记录成功', data: null });
  } catch (error) {
    console.error('[合同] 删除回款记录失败:', error);
    res.status(500).json({ code: 500, message: '删除回款记录失败', data: null });
  }
});

// 回款管理：回款列表 + 逾期未回款
router.post('/payment/list', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, tab = 'all', keyword, start_date, end_date } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    if (tab === 'overdue') {
      const result = await paymentService.getOverduePayments(pool, { page, pageSize, keyword });
      res.json({ code: 200, message: '查询成功', data: { list: result.list, total: result.total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } else if (tab === 'summary') {
      // TODO: 提取到 paymentService.getMonthlySummary
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

      const [[planTotal]] = await pool.query(
        "SELECT COALESCE(SUM(plan_amount), 0) as total FROM crm_payment_plan WHERE plan_date BETWEEN ? AND ? AND deleted_at IS NULL",
        [monthStart, monthEnd]
      );
      const [[paidTotal]] = await pool.query(
        "SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE pay_date BETWEEN ? AND ? AND deleted_at IS NULL",
        [monthStart, monthEnd]
      );
      const planVal = parseFloat(planTotal.total) || 0;
      const paidVal = parseFloat(paidTotal.total) || 0;
      const rate = planVal > 0 ? Math.round(paidVal / planVal * 100) : 0;

      res.json({ code: 200, message: '查询成功', data: { list: [], total: 0, page: 1, pageSize: 1, summary: { month_plan_total: planVal, month_paid_total: paidVal, month_rate: rate } } });
    } else {
      // TODO: 提取到 paymentService.listPayments
      let where = 'WHERE p.deleted_at IS NULL';
      if (keyword) {
        where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (start_date) {
        where += ' AND p.pay_date >= ?';
        params.push(start_date);
      }
      if (end_date) {
        where += ' AND p.pay_date <= ?';
        params.push(end_date);
      }

      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total
         FROM crm_payment p
         JOIN crm_contract c ON p.contract_id = c.id
         JOIN crm_customer cu ON c.customer_id = cu.id
         ${where}`, params
      );

      const [list] = await pool.query(
        `SELECT p.id, p.contract_id, c.contract_no, cu.company_name,
                p.pay_date, p.pay_amount, p.pay_method, p.remark, p.create_time
         FROM crm_payment p
         JOIN crm_contract c ON p.contract_id = c.id
         JOIN crm_customer cu ON c.customer_id = cu.id
         ${where}
         ORDER BY p.pay_date DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(pageSize), parseInt(offset)]
      );

      res.json({ code: 200, message: '查询成功', data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    }
  } catch (error) {
    console.error('[合同] 查询回款列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 回款合并视图（计划+记录）
router.post('/payment/merged', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, start_date, end_date } = req.body;
    const result = await paymentService.getMergedPayments(pool, { page, pageSize, keyword, start_date, end_date });
    res.json({ code: 200, message: '查询成功', data: { list: result.list, total: result.total } });
  } catch (error) {
    console.error('[合同] 合并回款视图查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 客户对账汇总
router.post('/payment/summary', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.body;
    const result = await paymentService.getCustomerReconciliation(pool, { page, pageSize, keyword });
    res.json({
      code: 200, message: '查询成功',
      data: { list: result.list, total: result.total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('[合同] 对账汇总错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 对账单导出
// TODO: 提取到 paymentService.exportStatement
router.post('/payment/statement-export', authenticateToken, checkPermission('contract'), async (req, res) => {
  const XLSX = require('xlsx');
  try {
    const { keyword, start_date, end_date } = req.body;

    let where = 'WHERE c.deleted_at IS NULL AND c.status IN (1,2,3)';
    const params = [];
    if (keyword) {
      where += ' AND cu.company_name LIKE ?';
      params.push(`%${keyword}%`);
    }

    const [summaryRows] = await pool.query(
      `SELECT cu.company_name, cu.contact_name, cu.phone,
              COUNT(DISTINCT c.id) as contract_count,
              COALESCE(SUM(c.amount), 0) as total_amount,
              COALESCE(SUM(cp.paid), 0) as paid_amount,
              COALESCE(SUM(c.amount), 0) - COALESCE(SUM(cp.paid), 0) as outstanding_amount
       FROM crm_contract c
       JOIN crm_customer cu ON c.customer_id = cu.id
       LEFT JOIN (
         SELECT contract_id, SUM(pay_amount) as paid
         FROM crm_payment WHERE deleted_at IS NULL GROUP BY contract_id
       ) cp ON cp.contract_id = c.id
       ${where}
       GROUP BY cu.id, cu.company_name, cu.contact_name, cu.phone
       HAVING total_amount > 0
       ORDER BY outstanding_amount DESC`,
      params
    );

    const summaryData = summaryRows.map(r => ({
      '客户名称': r.company_name,
      '联系人': r.contact_name || '',
      '电话': r.phone || '',
      '合同数': r.contract_count,
      '合同总额': parseFloat(r.total_amount),
      '已回款': parseFloat(r.paid_amount),
      '未回款': parseFloat(r.outstanding_amount),
      '回款率': r.total_amount > 0 ? Math.round(parseFloat(r.paid_amount) / parseFloat(r.total_amount) * 100) + '%' : '100%'
    }));

    let detailWhere = 'WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL';
    const detailParams = [];
    if (keyword) {
      detailWhere += ' AND cu.company_name LIKE ?';
      detailParams.push(`%${keyword}%`);
    }
    if (start_date) {
      detailWhere += ' AND p.pay_date >= ?';
      detailParams.push(start_date);
    }
    if (end_date) {
      detailWhere += ' AND p.pay_date <= ?';
      detailParams.push(end_date);
    }

    const [detailRows] = await pool.query(
      `SELECT cu.company_name, c.contract_no, c.amount as contract_amount,
              pp.plan_date, pp.plan_amount,
              p.pay_date, p.pay_amount, p.pay_method, p.remark
       FROM crm_payment p
       JOIN crm_contract c ON p.contract_id = c.id
       JOIN crm_customer cu ON c.customer_id = cu.id
       LEFT JOIN crm_payment_plan pp ON p.plan_id = pp.id
       ${detailWhere}
       ORDER BY cu.company_name, c.contract_no, p.pay_date`,
      detailParams
    );

    const detailData = detailRows.map(r => ({
      '客户名称': r.company_name,
      '合同编号': r.contract_no,
      '合同金额': parseFloat(r.contract_amount),
      '计划日期': r.plan_date || '-',
      '计划金额': r.plan_amount ? parseFloat(r.plan_amount) : '-',
      '回款日期': r.pay_date,
      '回款金额': parseFloat(r.pay_amount),
      '回款方式': r.pay_method || '',
      '备注': r.remark || ''
    }));

    const wb = XLSX.utils.book_new();
    if (summaryData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws1, '客户汇总');
    }
    if (detailData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, ws2, '回款明细');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=statement.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出对账单 ${summaryRows.length}个客户 ${detailRows.length}条回款`);
  } catch (error) {
    console.error('[合同] 对账单导出错误:', error);
    res.status(500).json({ code: 500, message: '导出对账单失败', data: null });
  }
});

module.exports = router;
