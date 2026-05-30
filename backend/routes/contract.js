const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { getDataPermission, buildPermissionClause } = require('../utils/permission');

const MODULE_NAME = '合同管理';

const { createRouteLogger } = require('../middleware/logger');
const { logFieldChanges } = require('../utils/fieldLog');
const logAction = createRouteLogger(MODULE_NAME);

/**
 * 重新计算回款计划的 paid_amount / status / overdue_days
 * @param {number} planId - 回款计划ID
 */
async function recalculatePlanStatus(planId) {
  const [plans] = await pool.query('SELECT plan_amount, plan_date FROM crm_payment_plan WHERE id = ?', [planId]);
  if (!plans.length) return;

  const plan = plans[0];

  // 计算已回金额（排除已删除的回款记录）
  const [sumRows] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  const paidAmount = parseFloat(sumRows[0].total);

  // 计算状态
  let status = 'pending';
  if (paidAmount >= parseFloat(plan.plan_amount)) {
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

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  customer_id: Joi.number().integer().positive().allow('', null),
  approval_status: Joi.number().integer().valid(1, 2, 3).allow('', null),
  payment_status: Joi.string().valid('overdue', 'partial', 'completed', 'pending').allow('', null)
});

const addContractSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  amount: Joi.number().precision(2).min(0).required(),
  sign_date: Joi.date().iso().allow(null),
  delivery_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(500).allow('', null),
  remark: Joi.string().max(2000).allow('', null),
  plans: Joi.array().items(Joi.object({
    plan_date: Joi.date().iso().required(),
    plan_amount: Joi.number().precision(2).min(0).required(),
    remark: Joi.string().max(500).allow('', null)
  })).allow(null)
});

const updateContractSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  amount: Joi.number().precision(2).min(0).required(),
  sign_date: Joi.date().iso().allow(null),
  delivery_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(500).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4),
  remark: Joi.string().max(2000).allow('', null),
  plans: Joi.array().items(Joi.object({
    id: Joi.number().integer().positive().allow(null),
    plan_date: Joi.date().iso().required(),
    plan_amount: Joi.number().precision(2).min(0).required(),
    remark: Joi.string().max(500).allow('', null)
  })).allow(null),
  delete_plan_ids: Joi.array().items(Joi.number().integer().positive()).allow(null)
});

const deleteContractSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

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


router.post('/list', authenticateToken, validate(listSchema), async (req, res) => {
  const { page = 1, pageSize = 10, keyword = '', status = '', customer_id = '', approval_status = '', payment_status = '' } = req.body;
  const offset = (page - 1) * pageSize;

  const permission = await getDataPermission(req.user);
  const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c', 'create_by');

  // 回款状态子查询条件
  const PAYMENT_STATUS_CLAUSE = {
    overdue: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status = 'overdue')`,
    partial: `EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
    completed: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id) AND NOT EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
    pending: `NOT EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL)`
  };

  let sql = `SELECT c.*, cu.company_name as customer_name, u.real_name as create_by_name,
    (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
    (SELECT COALESCE(SUM(pp.plan_amount), 0) FROM crm_payment_plan pp WHERE pp.contract_id = c.id) as plan_total
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    WHERE c.deleted_at IS NULL AND ${permissionClause}`;

  const params = [...permParams];
  
  if (keyword) {
    sql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (customer_id) {
    sql += ' AND c.customer_id = ?';
    params.push(customer_id);
  }
  if (approval_status) {
    sql += ' AND c.approval_status = ?';
    params.push(approval_status);
  }
  if (payment_status && PAYMENT_STATUS_CLAUSE[payment_status]) {
    sql += ` AND ${PAYMENT_STATUS_CLAUSE[payment_status]}`;
  }

  sql += ' ORDER BY c.create_time DESC LIMIT ?, ?';
  params.push(offset, pageSize);
  
  try {
    const [rows] = await pool.query(sql, params);
    
    let countSql = `SELECT COUNT(*) as total FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      WHERE c.deleted_at IS NULL AND ${permissionClause}`;
    const countParams = [];
    
    if (keyword) {
      countSql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
      countParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
      countSql += ' AND c.status = ?';
      countParams.push(status);
    }
    if (customer_id) {
      countSql += ' AND c.customer_id = ?';
      countParams.push(customer_id);
    }
    if (approval_status) {
      countSql += ' AND c.approval_status = ?';
      countParams.push(approval_status);
    }
    if (payment_status && PAYMENT_STATUS_CLAUSE[payment_status]) {
      countSql += ` AND ${PAYMENT_STATUS_CLAUSE[payment_status]}`;
    }

    const [countResult] = await pool.query(countSql, countParams);
    
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: countResult[0].total } });
  } catch (error) {
    console.error('Contract list error:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c', 'create_by');

    const [contract] = await pool.query(`
      SELECT c.*, cu.company_name as customer_name, cu.contact_name as contact, cu.phone, cu.address,
        u.real_name as create_by_name
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN sys_user u ON c.create_by = u.id
      WHERE c.id = ? AND ${permissionClause}
    `, [id, ...permParams]);
    
    if (!contract.length) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }
    
    const [plans] = await pool.query(
      'SELECT * FROM crm_payment_plan WHERE contract_id = ? ORDER BY plan_date',
      [id]
    );
    
    const [payments] = await pool.query(`
      SELECT p.*, pp.plan_date, pp.plan_amount
      FROM crm_payment p
      LEFT JOIN crm_payment_plan pp ON p.plan_id = pp.id
      WHERE p.contract_id = ?
      ORDER BY p.pay_date DESC
    `, [id]);
    
    const paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.pay_amount || 0), 0);
    const planTotal = plans.reduce((sum, p) => sum + parseFloat(p.plan_amount || 0), 0);
    
    res.json({
      code: 200,
      message: '查询成功',
      data: {
        ...contract[0],
        plans,
        payments,
        paid_amount: paidTotal,
        plan_total: planTotal
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('contract:add'), validate(addContractSchema), async (req, res) => {
  const { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, remark, plans } = req.body;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ? FOR UPDATE', [`CON-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const contractNo = `CON-${dateStr}-${seq}`;
    
    const [result] = await connection.query(
      'INSERT INTO crm_contract (contract_no, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, remark, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [contractNo, customer_id, opportunity_id || null, amount, sign_date, delivery_date, payment_terms, remark, req.user.userId]
    );
    
    const contractId = result.insertId;
    
    if (plans && plans.length > 0) {
      const placeholders = plans.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
      const flatValues = plans.flatMap(p => [contractId, p.plan_date, p.plan_amount, p.remark || null]);
      await connection.query(`INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES ${placeholders}`, flatValues);
    }
    
    await connection.commit();
    await logAction(req, 'add', `新增合同: ${contractNo}`);

    // 创建审批通知（通知有审批权限的管理员）
    try {
      const [custInfo] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ?', [customer_id]);
      const customerName = custInfo.length > 0 ? custInfo[0].company_name : '未知客户';
      const [userInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [req.user.userId]);
      const userName = userInfo.length > 0 ? userInfo[0].real_name : '未知';
      await pool.query(
        `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_role_id)
         SELECT 'contract_approval', ?, ?, 'contract', ?, ?, r.id
         FROM sys_role r
         WHERE (r.manage_all = 1 OR r.id IN (1, 2))
           AND NOT EXISTS (
             SELECT 1 FROM crm_notification n
             WHERE n.business_type = 'contract' AND n.business_id = ? AND n.to_role_id = r.id AND n.is_dismissed = 0
           )`,
        [
          '新合同待审批',
          `${userName} 为客户"${customerName}"创建合同 ${contractNo}，金额 ¥${amount}，待审批`,
          contractId,
          req.user.userId,
          contractId
        ]
      );
    } catch (e) {
      console.error('创建合同通知失败（不影响主流程）:', e);
    }

    res.json({ code: 200, message: '创建合同成功', data: { id: contractId, contract_no: contractNo } });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ code: 500, message: '创建合同失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/update', authenticateToken, checkPermission('contract:edit'), validate(updateContractSchema), async (req, res) => {
  const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark, plans, delete_plan_ids } = req.body;
  const connection = await pool.getConnection();

  try {
    // 查询旧记录用于字段变更对比
    const [oldRows] = await pool.query(
      'SELECT customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark FROM crm_contract WHERE id=? AND deleted_at IS NULL',
      [id]
    );
    const oldData = oldRows.length > 0 ? oldRows[0] : null;

    await connection.beginTransaction();

    await connection.query(
      'UPDATE crm_contract SET customer_id=?, opportunity_id=?, amount=?, sign_date=?, delivery_date=?, payment_terms=?, status=?, remark=? WHERE id=?',
      [customer_id, opportunity_id || null, amount, sign_date, delivery_date, payment_terms, status, remark, id]
    );

    if (delete_plan_ids && delete_plan_ids.length > 0) {
      const phs = delete_plan_ids.map((_, i) => '$' + (i + 1)).join(', ');
      await connection.query(`DELETE FROM crm_payment_plan WHERE id IN (${phs})`, delete_plan_ids);
    }

    if (plans && plans.length > 0) {
      for (const plan of plans) {
        if (plan.id) {
          await connection.query(
            'UPDATE crm_payment_plan SET plan_date=?, plan_amount=?, remark=? WHERE id=?',
            [plan.plan_date, plan.plan_amount, plan.remark || null, plan.id]
          );
        } else {
          await connection.query(
            'INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES (?, ?, ?, ?)',
            [id, plan.plan_date, plan.plan_amount, plan.remark || null]
          );
        }
      }
    }

    await connection.commit();
    await logAction(req, 'update', `修改合同: ID=${id}`);

    if (oldData) {
      const contractFields = ['customer_id', 'opportunity_id', 'amount', 'sign_date', 'delivery_date', 'payment_terms', 'status', 'remark'];
      const newData = { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark };
      await logFieldChanges(req, {
        module: MODULE_NAME,
        action: '编辑',
        oldData,
        newData,
        allowedFields: contractFields,
        description: `修改合同 #${id} 字段变更`
      });
    }

    res.json({ code: 200, message: '修改合同成功', data: null });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ code: 500, message: '修改合同失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/delete', authenticateToken, checkPermission('contract:delete'), validate(deleteContractSchema), async (req, res) => {
  const { id } = req.body;
  
  try {
    const [contract] = await pool.query('SELECT status, create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [id]);
    if (!contract.length) {
      return res.json({ code: 404, message: '合同不存在', data: null });
    }
    if (contract[0].status === 3) {
      return res.json({ code: 400, message: '已完成的合同不能删除', data: null });
    }

    // 权限检查：管理员或创建人可删除
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && contract[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该合同', data: null });
    }

    await pool.query('UPDATE crm_contract SET deleted_at = NOW() WHERE id=?', [id]);
    await pool.query('UPDATE crm_payment SET deleted_at = NOW() WHERE contract_id=? AND deleted_at IS NULL', [id]);
    await logAction(req, 'delete', `删除合同: ID=${id}`);
    res.json({ code: 200, message: '删除合同成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除合同失败', data: null });
  }
});

router.post('/payment/add', authenticateToken, checkPermission('contract'), validate(paymentAddSchema), async (req, res) => {
  const { contract_id, plan_id, pay_date, pay_amount, pay_method, remark } = req.body;

  try {
    console.log('收到回款登记请求:', { contract_id, plan_id, pay_date, pay_amount, pay_method, remark });

    // [安全修复] 归属校验：验证用户有权操作此合同的回款
    const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [contract_id]);
    if (!contracts.length) {
      return res.status(404).json({ code: 404, message: '所属合同不存在', data: null });
    }
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && contracts[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权为该合同登记回款', data: null });
    }

    await pool.query(
      'INSERT INTO crm_payment (contract_id, plan_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?, ?)',
      [contract_id, plan_id || null, pay_date, pay_amount, pay_method, remark]
    );
    
    await pool.query('UPDATE crm_contract SET status=2 WHERE id=? AND status=1', [contract_id]);

    // 刷新回款计划状态
    if (plan_id) {
      await recalculatePlanStatus(plan_id);
    }

    await logAction(req, 'add', `登记回款: 合同ID=${contract_id}, 金额=${pay_amount}`);
    res.json({ code: 200, message: '登记回款成功', data: null });
  } catch (error) {
    console.error('登记回款失败:', error.message);
    console.error('错误详情:', error);
    console.error('请求体:', req.body);
    res.status(500).json({ code: 500, message: '登记回款失败', data: null });
  }
});

router.post('/payment/update', authenticateToken, checkPermission('contract'), validate(paymentUpdateSchema), async (req, res) => {
  const { id, pay_date, pay_amount, pay_method, remark } = req.body;

  try {
    // 查找旧 plan_id 用于刷新
    const [oldPayment] = await pool.query('SELECT plan_id, contract_id FROM crm_payment WHERE id = ?', [id]);

    // [安全修复] 归属校验：验证用户有权修改此回款记录
    if (oldPayment.length) {
      const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [oldPayment[0].contract_id]);
      if (contracts.length) {
        const { manageAll, roleId, userId } = req.user;
        if (!manageAll && roleId !== 1 && roleId !== 2 && contracts[0].create_by !== userId) {
          return res.status(403).json({ code: 403, message: '无权修改该回款记录', data: null });
        }
      }
    }

    await pool.query(
      'UPDATE crm_payment SET pay_date=?, pay_amount=?, pay_method=?, remark=? WHERE id=?',
      [pay_date, pay_amount, pay_method, remark, id]
    );

    // 刷新回款计划状态
    if (oldPayment.length && oldPayment[0].plan_id) {
      await recalculatePlanStatus(oldPayment[0].plan_id);
    }

    await logAction(req, 'update', `修改回款记录: ID=${id}`);
    res.json({ code: 200, message: '修改回款记录成功', data: null });
  } catch (error) {
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

    // 权限检查：管理员或合同创建人可删除
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && contracts[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该回款记录', data: null });
    }

    await pool.query('UPDATE crm_payment SET deleted_at = NOW() WHERE id=?', [id]);

    // 刷新回款计划状态
    if (payments[0].plan_id) {
      await recalculatePlanStatus(payments[0].plan_id);
    }

    await logAction(req, 'delete', `删除回款记录: ID=${id}`);
    res.json({ code: 200, message: '删除回款记录成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除回款记录失败', data: null });
  }
});

router.get('/opportunity-list', authenticateToken, async (req, res) => {
  try {
    const { getDataPermission, buildPermissionClause } = require('../utils/permission');
    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'o');

    const [rows] = await pool.query(
      `SELECT o.id, o.name FROM crm_opportunity o WHERE ${permissionClause} AND o.stage != 5 AND o.stage != 6 AND o.deleted_at IS NULL ORDER BY o.name`,
      permParams
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('Opportunity list error:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

const XLSX = require('xlsx');
const multer = require('multer');
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('仅支持 xlsx/xls/csv 文件'), ok);
  }
});

router.post('/export', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { keyword = '', status = '' } = req.body;

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c', 'create_by');

    let sql = `SELECT c.contract_no, cu.company_name as customer_name, c.amount,
      (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
      c.sign_date, c.delivery_date, c.status, c.payment_terms, c.remark,
      u.real_name as create_by_name, c.create_time
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN sys_user u ON c.create_by = u.id
      WHERE c.deleted_at IS NULL AND ${permissionClause}`;
    const params = [...permParams];

    if (keyword) { sql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (status) { sql += ' AND c.status = ?'; params.push(status); }

    sql += ' ORDER BY c.create_time DESC LIMIT 10000';

    const [rows] = await pool.query(sql, params);

    const statusMap = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' };
    const exportData = rows.map(row => ({
      '合同编号': row.contract_no,
      '客户名称': row.customer_name || '',
      '合同金额': parseFloat(row.amount || 0),
      '已回款': parseFloat(row.paid_amount || 0),
      '签订日期': row.sign_date || '',
      '交付日期': row.delivery_date || '',
      '状态': statusMap[row.status] || '',
      '付款条款': row.payment_terms || '',
      '创建人': row.create_by_name || '',
      '备注': row.remark || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '合同列表');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=contracts.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出合同 ${rows.length} 条`);
  } catch (error) {
    console.error('导出合同错误:', error);
    res.status(500).json({ code: 500, message: '导出合同失败', data: null });
  }
});

// 回款管理：回款列表 + 逾期未回款
router.post('/payment/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, tab = 'all', keyword, start_date, end_date } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    if (tab === 'overdue') {
      // 逾期未回款：回款计划已到期但未足额到账
      let where = 'WHERE pp.plan_date < CURRENT_DATE AND c.deleted_at IS NULL';
      if (keyword) {
        where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
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
        params
      );

      const [list] = await pool.query(
        `SELECT pp.id as plan_id, pp.contract_id, c.contract_no, cu.company_name,
                pp.plan_date, pp.plan_amount,
                COALESCE(p.paid, 0) as paid_amount,
                (pp.plan_amount - COALESCE(p.paid, 0)) as remain_amount,
                (CURRENT_DATE - pp.plan_date) as overdue_days
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
        [...params, parseInt(pageSize), parseInt(offset)]
      );

      res.json({ code: 200, message: '查询成功', data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } else {
      // 全部回款
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
    console.error('查询回款列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 回款导出
router.post('/payment/export', authenticateToken, async (req, res) => {
  try {
    const { keyword, start_date, end_date } = req.body;
    const params = [];
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

    const [rows] = await pool.query(
      `SELECT c.contract_no, cu.company_name,
              p.pay_date, p.pay_amount, p.pay_method, p.remark
       FROM crm_payment p
       JOIN crm_contract c ON p.contract_id = c.id
       JOIN crm_customer cu ON c.customer_id = cu.id
       ${where}
       ORDER BY p.pay_date DESC
       LIMIT 10000`, params
    );

    const exportData = rows.map(row => ({
      '合同编号': row.contract_no,
      '客户名称': row.company_name || '',
      '回款日期': row.pay_date || '',
      '回款金额': parseFloat(row.pay_amount || 0),
      '回款方式': row.pay_method || '',
      '备注': row.remark || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '回款列表');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出回款 ${rows.length} 条`);
  } catch (error) {
    console.error('导出回款错误:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// 合同搜索（轻量级，供快速回款录入选择合同）
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword || keyword.length < 1) {
      return res.json({ code: 200, data: [] });
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.contract_no, cu.company_name, c.amount
       FROM crm_contract c
       JOIN crm_customer cu ON c.customer_id = cu.id
       WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
         AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)
       ORDER BY c.create_time DESC LIMIT 20`,
      [`%${keyword}%`, `%${keyword}%`]
    );
    res.json({ code: 200, data: rows });
  } catch (error) {
    console.error('合同搜索错误:', error);
    res.status(500).json({ code: 500, message: '搜索失败', data: null });
  }
});

// 客户对账汇总
router.post('/payment/summary', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let where = 'WHERE c.deleted_at IS NULL';
    if (keyword) {
      where += ' AND cu.company_name LIKE ?';
      params.push(`%${keyword}%`);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(DISTINCT cu.id) as total
       FROM crm_contract c
       JOIN crm_customer cu ON c.customer_id = cu.id
       ${where}`,
      params
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
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('对账汇总错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 对账单导出
router.post('/payment/statement-export', authenticateToken, async (req, res) => {
  try {
    const { keyword, start_date, end_date } = req.body;

    let where = 'WHERE c.deleted_at IS NULL AND c.status IN (1,2,3)';
    const params = [];
    if (keyword) {
      where += ' AND cu.company_name LIKE ?';
      params.push(`%${keyword}%`);
    }

    // Sheet1: 客户汇总
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

    // Sheet2: 回款明细
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
    console.error('对账单导出错误:', error);
    res.status(500).json({ code: 500, message: '导出对账单失败', data: null });
  }
});

// 审批合同（仅管理员）
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { id, approval_status, approval_remark } = req.body;
    // 仅boss/管理员可审批
    if (!req.user.manageAll && req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ code: 403, message: '无审批权限', data: null });
    }
    if (!id || ![2, 3].includes(approval_status)) {
      return res.status(400).json({ code: 400, message: '参数错误: id必填, approval_status为2(通过)或3(拒绝)', data: null });
    }

    const [rows] = await pool.query('SELECT id FROM crm_contract WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }

    await pool.query(
      'UPDATE crm_contract SET approval_status = ?, approver_id = ?, approval_remark = ? WHERE id = ?',
      [approval_status, req.user.userId, approval_remark || null, id]
    );

    // 审批后自动解除通知
    await pool.query(
      'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
      ['contract', id]
    );

    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    console.error('审批合同错误:', error);
    res.status(500).json({ code: 500, message: '审批失败', data: null });
  }
});

// 批量导入回款（Excel）
router.post('/payment/import', authenticateToken, checkPermission('contract'), importUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传文件', data: null });
  }

  const connection = await pool.getConnection();
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    if (rows.length === 0) {
      return res.status(400).json({ code: 400, message: '文件内容为空', data: null });
    }
    if (rows.length > 500) {
      return res.status(400).json({ code: 400, message: '单次导入不超过500条', data: null });
    }

    await connection.beginTransaction();

    let successCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const contractNo = String(row['合同编号'] || row['contract_no'] || '').trim();
      const payDate = row['回款日期'] || row['pay_date'];
      const payAmount = parseFloat(row['回款金额'] || row['pay_amount'] || 0);
      const payMethod = String(row['回款方式'] || row['pay_method'] || '银行转账').trim();
      const remark = row['备注'] || row['remark'] || null;

      if (!contractNo || !payDate || !payAmount) {
        errors.push(`第${i + 2}行：缺少必填字段`);
        continue;
      }

      // 查找合同
      const [contracts] = await connection.query(
        'SELECT id FROM crm_contract WHERE contract_no = ? AND deleted_at IS NULL',
        [contractNo]
      );
      if (contracts.length === 0) {
        errors.push(`第${i + 2}行：合同编号 ${contractNo} 不存在`);
        continue;
      }

      // 解析日期
      let formattedDate = payDate;
      if (typeof payDate === 'number') {
        // Excel日期序列号
        formattedDate = new Date((payDate - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      } else if (payDate instanceof Date) {
        formattedDate = payDate.toISOString().slice(0, 10);
      }

      await connection.query(
        'INSERT INTO crm_payment (contract_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?)',
        [contracts[0].id, formattedDate, payAmount, payMethod, remark]
      );

      // 更新合同状态
      await connection.query('UPDATE crm_contract SET status = 2 WHERE id = ? AND status = 1', [contracts[0].id]);

      successCount++;
    }

    await connection.commit();

    res.json({
      code: 200,
      message: `导入完成：成功 ${successCount} 条${errors.length > 0 ? `，失败 ${errors.length} 条` : ''}`,
      data: { success: successCount, failed: errors.length, errors }
    });
  } catch (error) {
    await connection.rollback();
    console.error('回款导入错误:', error);
    res.status(500).json({ code: 500, message: '导入失败', data: null });
  } finally {
    connection.release();
  }
});

// 回款导入模板下载
router.get('/payment/import-template', authenticateToken, async (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['合同编号', '回款日期', '回款金额', '回款方式', '备注'],
    ['CON-260101-001', '2026-01-15', 50000, '银行转账', '第一期回款']
  ]);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, '回款导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=payment_import_template.xlsx');
  res.send(buf);
});

module.exports = router;
