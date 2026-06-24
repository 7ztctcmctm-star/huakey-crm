const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { cache, invalidateCache } = require('../../middleware/cache');
const ROLES = require('../../config/roles');
const { createRouteLogger } = require('../../middleware/logger');
const { logFieldChanges } = require('../../utils/fieldLog');
const contractService = require('../../services/contractService');

const MODULE_NAME = '合同管理';
const logAction = createRouteLogger(MODULE_NAME);

// --- Joi schemas ---

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

// --- Routes ---

// TODO: 提取到 contractService.listContracts（需对齐 SQL 和权限传参方式）
router.post('/list', authenticateToken, cache(60), checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(listSchema), async (req, res) => {
  const { page = 1, pageSize = 10, keyword = '', status = '', customer_id = '', approval_status = '', payment_status = '' } = req.body;
  const offset = (page - 1) * pageSize;

  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');

    const PAYMENT_STATUS_CLAUSE = {
      overdue: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status = 'overdue')`,
      partial: `EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
      completed: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id) AND NOT EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
      pending: `NOT EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL)`
    };

    let sql = `SELECT c.*, cu.company_name as customer_name, u.real_name as create_by_name,
      (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
      (SELECT COALESCE(SUM(pp.plan_amount), 0) FROM crm_payment_plan pp WHERE pp.contract_id = c.id) as plan_total,
      cur.symbol as currency_symbol
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN sys_user u ON c.create_by = u.id
      LEFT JOIN crm_currency cur ON c.currency = cur.code COLLATE utf8mb4_unicode_ci
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
    const [rows] = await pool.query(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      WHERE c.deleted_at IS NULL AND ${permissionClause}`;
    const countParams = [...permParams];

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
    console.error('[合同] 合同列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/detail/:id', authenticateToken, checkDataPermission('contract', 'create_by'), async (req, res) => {
  const { id } = req.params;

  try {
    // 权限校验（service 不含权限检查）
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const [permCheck] = await pool.query(
      `SELECT c.id FROM crm_contract c WHERE c.id = ? AND c.deleted_at IS NULL AND ${permissionClause}`,
      [id, ...permParams]
    );
    if (!permCheck.length) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }

    const contract = await contractService.getContract(pool, id);
    if (!contract) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }

    res.json({ code: 200, message: '查询成功', data: contract });
  } catch (error) {
    console.error('[合同] 查询合同详情失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('contract:add'), validate(addContractSchema), async (req, res) => {
  const { customer_id, amount, plans } = req.body;

  try {
    const result = await contractService.createContract(pool, req.body, req.user.userId);
    await logAction(req, 'add', `新增合同: ${result.contract_no}`);

    // 通知审批人（不影响主流程）
    try {
      const [custInfo] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ?', [customer_id]);
      const customerName = custInfo.length > 0 ? custInfo[0].company_name : '未知客户';
      const [userInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [req.user.userId]);
      const userName = userInfo.length > 0 ? userInfo[0].real_name : '未知';
      await pool.query(
        `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_role_id)
         SELECT 'contract_approval', ?, ?, 'contract', ?, ?, r.id
         FROM sys_role r
         WHERE (r.manage_all IS TRUE OR r.id IN (1, 2))
           AND NOT EXISTS (
             SELECT 1 FROM crm_notification n
             WHERE n.business_type = 'contract' AND n.business_id = ? AND n.to_role_id = r.id AND n.is_dismissed = 0
           )`,
        [
          '新合同待审批',
          `${userName} 为客户"${customerName}"创建合同 ${result.contract_no}，金额 ¥${amount}，待审批`,
          result.id,
          req.user.userId,
          result.id
        ]
      );
    } catch (error) {
      console.error('[合同] 创建合同通知失败（不影响主流程）:', error);
    }

    res.json({ code: 200, message: '创建合同成功', data: result });
  } catch (error) {
    console.error('[合同] 创建合同失败:', error);
    const status = error.code || 500;
    res.status(status).json({ code: status, message: error.message || '创建合同失败', data: null });
  }
});

// TODO: 提取到 contractService.updateContract
router.post('/update', authenticateToken, checkPermission('contract:edit'), validate(updateContractSchema), async (req, res) => {
  const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark, plans, delete_plan_ids } = req.body;
  const connection = await pool.getConnection();

  try {
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
      const phs = delete_plan_ids.map(() => '?').join(', ');
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

    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: '修改合同成功', data: null });
  } catch (error) {
    await connection.rollback();
    console.error('[合同] 修改合同失败:', error);
    res.status(500).json({ code: 500, message: '修改合同失败', data: null });
  } finally {
    connection.release();
  }
});

// TODO: 提取到 contractService.deleteContract
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

    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contract[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该合同', data: null });
    }

    await pool.query('UPDATE crm_contract SET deleted_at = NOW() WHERE id=?', [id]);
    await pool.query('UPDATE crm_payment SET deleted_at = NOW() WHERE contract_id=? AND deleted_at IS NULL', [id]);
    await pool.query('UPDATE crm_payment_plan SET deleted_at = NOW() WHERE contract_id=? AND deleted_at IS NULL', [id]);
    await logAction(req, 'delete', `删除合同: ID=${id}`);
    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: '删除合同成功', data: null });
  } catch (error) {
    console.error('[合同] 删除合同失败:', error);
    res.status(500).json({ code: 500, message: '删除合同失败', data: null });
  }
});

// TODO: 提取到 contractService.getOpportunityList
router.get('/opportunity-list', authenticateToken, checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [rows] = await pool.query(
      `SELECT o.id, o.name FROM crm_opportunity o WHERE ${permissionClause} AND o.stage != 5 AND o.stage != 6 AND o.deleted_at IS NULL ORDER BY o.name`,
      permParams
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[合同] 商机列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 合同搜索（轻量级，供快速回款录入选择合同）
// TODO: 提取到 contractService.searchContracts
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
    console.error('[合同] 合同搜索错误:', error);
    res.status(500).json({ code: 500, message: '搜索失败', data: null });
  }
});

module.exports = router;
