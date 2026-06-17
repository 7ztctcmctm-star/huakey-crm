const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const ROLES = require('../config/roles');

const router = express.Router();

const addPlanSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  plan_time: Joi.date().iso().required(),
  plan_content: Joi.string().max(500).required(),
  follow_type: Joi.string().max(20).default('电话')
});

const listPlanSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  customer_id: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid('pending', 'completed', 'overdue').allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const completePlanSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  content: Joi.string().max(2000).required(),
  follow_type: Joi.string().max(20).allow(null)
});

const cancelPlanSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 创建跟进计划
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(addPlanSchema), async (req, res) => {
  try {
    const { customer_id, contact_id, plan_time, plan_content, follow_type } = req.body;

    const [customers] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_follow_plan (customer_id, contact_id, plan_time, plan_content, follow_type, create_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_id, contact_id || null, plan_time, plan_content, follow_type || '电话', req.user.userId]
    );

    res.json({
      code: 200,
      message: '创建跟进计划成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('创建跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '创建跟进计划失败', data: null });
  }
});

// 2. 跟进计划列表
router.post('/list', authenticateToken, validate(listPlanSchema), async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      customer_id,
      status,
      start_date,
      end_date
    } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];
    const { roleId, userId } = req.user;

    // 数据权限：管理员/经理看全部，其他人只看自己创建的
    let whereClause;
    if (roleId === ROLES.ADMIN || roleId === ROLES.MANAGER) {
      whereClause = 'WHERE fp.deleted_at IS NULL';
    } else {
      whereClause = 'WHERE fp.deleted_at IS NULL AND fp.create_by = ?';
      params.push(userId);
    }

    if (customer_id) {
      whereClause += ' AND fp.customer_id = ?';
      params.push(customer_id);
    }
    if (status) {
      whereClause += ' AND fp.status = ?';
      params.push(status);
    }
    if (start_date) {
      whereClause += ' AND fp.plan_time >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND fp.plan_time < ?';
      params.push(end_date + ' 23:59:59');
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_follow_plan fp ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT fp.id, fp.customer_id, fp.contact_id, fp.plan_time, fp.plan_content,
        fp.follow_type, fp.status, fp.create_by, fp.create_time,
        c.company_name,
        co.name as contact_name,
        u.real_name as creator_name
      FROM crm_follow_plan fp
      LEFT JOIN crm_customer c ON fp.customer_id = c.id
      LEFT JOIN crm_contact co ON fp.contact_id = co.id AND co.deleted_at IS NULL
      LEFT JOIN sys_user u ON fp.create_by = u.id
      ${whereClause}
      ORDER BY fp.plan_time ASC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取跟进计划列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取跟进计划列表错误:', error);
    res.status(500).json({ code: 500, message: '获取跟进计划列表失败', data: null });
  }
});

// 3. 完成跟进计划（事务：更新状态 + 创建跟进记录 + 更新客户最后跟进时间）
router.post('/complete', authenticateToken, checkPermission('customer:edit'), validate(completePlanSchema), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id, content, follow_type } = req.body;
    const userId = req.user.userId;

    await conn.beginTransaction();

    const [plans] = await conn.query(
      'SELECT id, customer_id, contact_id, plan_content, follow_type as plan_follow_type, status, create_by FROM crm_follow_plan WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (plans.length === 0) {
      await conn.rollback();
      return res.status(404).json({ code: 404, message: '跟进计划不存在', data: null });
    }

    const plan = plans[0];
    if (plan.status === 'completed') {
      await conn.rollback();
      return res.status(400).json({ code: 400, message: '该计划已完成', data: null });
    }

    // 更新计划状态为已完成
    await conn.query(
      'UPDATE crm_follow_plan SET status = ? WHERE id = ?',
      ['completed', id]
    );

    // 自动创建跟进记录
    await conn.query(
      `INSERT INTO crm_follow_up (customer_id, contact_id, follow_type, content, create_by)
       VALUES (?, ?, ?, ?, ?)`,
      [plan.customer_id, plan.contact_id, follow_type || plan.plan_follow_type, content, userId]
    );

    // 更新客户最后跟进时间
    await conn.query(
      'UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?',
      [plan.customer_id]
    );

    await conn.commit();

    res.json({ code: 200, message: '跟进计划已完成', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('完成跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '完成跟进计划失败', data: null });
  } finally {
    conn.release();
  }
});

// 4. 取消跟进计划（软删除，仅创建人或管理员）
router.post('/cancel', authenticateToken, validate(cancelPlanSchema), async (req, res) => {
  try {
    const { id } = req.body;
    const { roleId, userId, manageAll } = req.user;

    const [plans] = await pool.query(
      'SELECT id, create_by, status FROM crm_follow_plan WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (plans.length === 0) {
      return res.status(404).json({ code: 404, message: '跟进计划不存在', data: null });
    }

    const plan = plans[0];
    if (plan.status === 'completed') {
      return res.status(400).json({ code: 400, message: '已完成的计划不能取消', data: null });
    }

    // 权限检查：创建人或管理员可取消
    if (!manageAll && roleId !== 1 && roleId !== 2 && plan.create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权取消该计划', data: null });
    }

    await pool.query(
      'UPDATE crm_follow_plan SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    res.json({ code: 200, message: '跟进计划已取消', data: null });
  } catch (error) {
    console.error('取消跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '取消跟进计划失败', data: null });
  }
});

module.exports = router;
