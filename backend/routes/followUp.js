const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

const followUpAddSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  follow_type: Joi.string().max(50).allow('', null),
  content: Joi.string().required().max(5000),
  next_time: Joi.date().iso().allow(null),
  next_content: Joi.string().max(1000).allow('', null),
  attachment_ids: Joi.array().items(Joi.number().integer().positive()).allow(null)
});

const followUpBatchAddSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    customer_id: Joi.number().integer().positive().required(),
    content: Joi.string().required().max(5000),
    follow_type: Joi.string().max(50).allow('', null),
    next_time: Joi.date().iso().allow(null)
  })).min(1).max(20).required()
});

const followUpUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  follow_type: Joi.string().max(50).allow('', null),
  content: Joi.string().required().max(5000),
  next_time: Joi.date().iso().allow(null),
  next_content: Joi.string().max(1000).allow('', null)
});

const followUpDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 添加跟进记录
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(followUpAddSchema), async (req, res) => {
  try {
    const { customer_id, contact_id, follow_type, content, next_time, next_content } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        code: 400,
        message: '客户ID不能为空',
        data: null
      });
    }

    if (!content) {
      return res.status(400).json({
        code: 400,
        message: '跟进内容不能为空',
        data: null
      });
    }

    const [customers] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_follow_up (customer_id, contact_id, follow_type, content, next_time, next_content, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, contact_id || null, follow_type || '电话', content, next_time || null, next_content || null, req.user.userId]
    );

    // 绑定附件
    const { attachment_ids } = req.body;
    if (attachment_ids && attachment_ids.length > 0) {
      await pool.query(
        `UPDATE crm_attachment SET business_type = 'follow_up', business_id = ? WHERE id IN (${attachment_ids.map(() => '?').join(',')})`,
        [result.insertId, ...attachment_ids]
      );
    }

    // 更新客户的最后跟进时间
    await pool.query(
      'UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?',
      [customer_id]
    );

    // 自动解除该客户的逾期提醒
    await pool.query(
      `UPDATE crm_follow_up_reminder
       SET is_dismissed = 1
       WHERE customer_id = ? AND is_dismissed = 0`,
      [customer_id]
    );

    res.json({
      code: 200,
      message: '添加跟进记录成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加跟进记录错误:', error);
    res.status(500).json({
      code: 500,
      message: '添加跟进记录失败',
      data: null
    });
  }
});

// 批量添加跟进记录
router.post('/batch-add', authenticateToken, checkPermission('customer:edit'), validate(followUpBatchAddSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 400, message: '跟进记录不能为空', data: null });
    }
    if (items.length > 20) {
      return res.status(400).json({ code: 400, message: '单次批量跟进不超过20条', data: null });
    }

    await connection.beginTransaction();

    for (const item of items) {
      if (!item.customer_id || !item.content) continue;

      await connection.query(
        `INSERT INTO crm_follow_up (customer_id, follow_type, content, next_time, create_by)
         VALUES (?, ?, ?, ?, ?)`,
        [item.customer_id, item.follow_type || '电话', item.content, item.next_time || null, req.user.userId]
      );

      await connection.query(
        'UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?',
        [item.customer_id]
      );

      await connection.query(
        'UPDATE crm_follow_up_reminder SET is_dismissed = 1 WHERE customer_id = ? AND is_dismissed = 0',
        [item.customer_id]
      );
    }

    await connection.commit();

    res.json({ code: 200, message: `成功录入 ${items.length} 条跟进记录`, data: { count: items.length } });
  } catch (error) {
    await connection.rollback();
    console.error('批量跟进错误:', error);
    res.status(500).json({ code: 500, message: '批量跟进失败', data: null });
  } finally {
    connection.release();
  }
});

// 2. 获取客户的跟进记录列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        code: 400,
        message: '客户ID不能为空',
        data: null
      });
    }

    const offset = (page - 1) * pageSize;

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM crm_follow_up WHERE customer_id = ? AND deleted_at IS NULL',
      [customer_id]
    );
    const total = countResult[0].total;

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_by, f.create_time,
        u.real_name as creator_name,
        c.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN sys_user u ON f.create_by = u.id
      LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
      WHERE f.customer_id = ? AND f.deleted_at IS NULL
      ORDER BY f.create_time DESC
      LIMIT ? OFFSET ?`,
      [customer_id, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取跟进记录成功',
      data: {
        list: records,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取跟进记录错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取跟进记录失败',
      data: null
    });
  }
});

// 3. 获取今日需要跟进的提醒
router.get('/remind', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    let whereClause = '';
    const params = [];

    // 数据权限
    if (roleId === 1 || roleId === 2) {
      whereClause = '1=1';
    } else {
      whereClause = 'f.create_by = ?';
      params.push(userId);
    }

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_time,
        cu.company_name,
        co.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      LEFT JOIN crm_contact co ON f.contact_id = co.id
      WHERE ${whereClause}
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) = CURDATE()
      ORDER BY f.next_time ASC`,
      params
    );

    res.json({
      code: 200,
      message: '获取今日待跟进成功',
      data: {
        list: records,
        total: records.length
      }
    });
  } catch (error) {
    console.error('获取今日待跟进错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取今日待跟进失败',
      data: null
    });
  }
});

// 4. 编辑跟进记录
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(followUpUpdateSchema), async (req, res) => {
  try {
    const { id, contact_id, follow_type, content, next_time, next_content } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '记录ID不能为空', data: null });
    }
    if (!content) {
      return res.status(400).json({ code: 400, message: '跟进内容不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT id, create_by FROM crm_follow_up WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '跟进记录不存在', data: null });
    }

    // 只有创建人可编辑
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && rows[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权编辑该记录', data: null });
    }

    await pool.query(
      `UPDATE crm_follow_up SET contact_id = ?, follow_type = ?, content = ?, next_time = ?, next_content = ?
       WHERE id = ?`,
      [contact_id || null, follow_type || '电话', content, next_time || null, next_content || null, id]
    );

    res.json({ code: 200, message: '修改跟进记录成功', data: null });
  } catch (error) {
    console.error('修改跟进记录错误:', error);
    res.status(500).json({ code: 500, message: '修改跟进记录失败', data: null });
  }
});

// 5. 删除跟进记录
router.post('/delete', authenticateToken, checkPermission('customer:delete'), validate(followUpDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '记录ID不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT id, create_by, customer_id FROM crm_follow_up WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '跟进记录不存在', data: null });
    }

    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && rows[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该记录', data: null });
    }

    await pool.query('UPDATE crm_follow_up SET deleted_at = NOW() WHERE id = ?', [id]);

    // 更新客户的最后跟进时间为最近一条记录的时间
    const [latest] = await pool.query(
      'SELECT MAX(create_time) as latest_time FROM crm_follow_up WHERE customer_id = ? AND deleted_at IS NULL',
      [rows[0].customer_id]
    );
    await pool.query(
      'UPDATE crm_customer SET last_follow_time = ? WHERE id = ?',
      [latest[0].latest_time || null, rows[0].customer_id]
    );

    res.json({ code: 200, message: '删除跟进记录成功', data: null });
  } catch (error) {
    console.error('删除跟进记录错误:', error);
    res.status(500).json({ code: 500, message: '删除跟进记录失败', data: null });
  }
});

// 6. 跟进日历：获取某月的跟进记录（含下次跟进时间）
router.post('/calendar', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.body;
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    if (!year || !month) {
      return res.status(400).json({ code: 400, message: '请提供年份和月份', data: null });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    let ownerFilter = '';
    const params = [startDate, endDate, startDate, endDate];
    if (roleId !== 1 && roleId !== 2) {
      ownerFilter = ' AND (f.create_by = ? OR cu.owner_id = ?)';
      params.push(userId, userId);
    }

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_time,
        cu.company_name,
        co.name as contact_name,
        DATE(f.create_time) as follow_date,
        DATE(f.next_time) as plan_date
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      LEFT JOIN crm_contact co ON f.contact_id = co.id
      WHERE (DATE(f.create_time) BETWEEN ? AND ? OR DATE(f.next_time) BETWEEN ? AND ?)
        ${ownerFilter}
      ORDER BY f.create_time DESC`,
      params
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list: records, total: records.length }
    });
  } catch (error) {
    console.error('跟进日历查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
