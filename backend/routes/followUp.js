const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
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

    // 更新客户的最后跟进时间、跟进状态、生命周期状态
    await pool.query(
      `UPDATE crm_customer
       SET last_follow_time = NOW(),
           follow_status = CASE
             WHEN follow_status IS NULL OR follow_status = '初次联系' THEN '跟进中'
             ELSE follow_status
           END,
           lifecycle_status = CASE
             WHEN lifecycle_status = 'new' THEN 'nurturing'
             ELSE lifecycle_status
           END
       WHERE id = ?`,
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
router.post('/list', authenticateToken, checkPermission('followup:calendar'), async (req, res) => {
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
router.get('/remind', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res) => {
  try {
    const { clause: permClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'f');

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_time,
        cu.company_name,
        co.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      LEFT JOIN crm_contact co ON f.contact_id = co.id
      WHERE ${permClause}
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) = CURRENT_DATE
      ORDER BY f.next_time ASC`,
      permParams
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

// 3.1 明日计划跟进列表
router.get('/tomorrow', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res) => {
  try {
    const { clause: permClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'f');

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_time,
        cu.company_name, cu.contact_name as customer_contact, cu.phone as customer_phone,
        co.name as contact_name,
        u.real_name as creator_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      LEFT JOIN crm_contact co ON f.contact_id = co.id AND co.deleted_at IS NULL
      LEFT JOIN sys_user u ON f.create_by = u.id
      WHERE f.deleted_at IS NULL
        AND DATE(f.next_time) = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
        AND ${permClause}
      ORDER BY f.next_time ASC`,
      permParams
    );

    res.json({
      code: 200, message: '获取明日计划成功',
      data: { list: records, total: records.length }
    });
  } catch (error) {
    console.error('获取明日计划错误:', error);
    res.status(500).json({ code: 500, message: '获取明日计划失败', data: null });
  }
});

// 3.2 逾期未跟进列表
router.get('/overdue', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res) => {
  try {
    const { clause: permClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'f');

    const [records] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_time,
        cu.company_name, cu.contact_name as customer_contact, cu.phone as customer_phone,
        co.name as contact_name,
        u.real_name as creator_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      LEFT JOIN crm_contact co ON f.contact_id = co.id AND co.deleted_at IS NULL
      LEFT JOIN sys_user u ON f.create_by = u.id
      WHERE f.deleted_at IS NULL
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) < CURRENT_DATE
        AND ${permClause}
      ORDER BY f.next_time ASC`,
      permParams
    );

    res.json({
      code: 200, message: '获取逾期跟进成功',
      data: { list: records, total: records.length }
    });
  } catch (error) {
    console.error('获取逾期跟进错误:', error);
    res.status(500).json({ code: 500, message: '获取逾期跟进失败', data: null });
  }
});

// 3.3 任务统计（今日/明日/逾期数量）
// 注意：此端点需要同时检查 create_by 和 customer_owner 两个字段
router.get('/task-stats', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res) => {
  try {
    const dp = req.dataPermission;
    let permClause = '1=1';
    const permParams = [];

    if (dp.type === 'all') {
      permClause = '1=1';
    } else if (dp.type === 'dept' || dp.type === 'dept_and_sub') {
      const [deptRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [dp.userId]);
      const deptId = deptRows[0]?.dept_id;
      if (deptId) {
        const [deptUsers] = await pool.query('SELECT id FROM sys_user WHERE dept_id = ?', [deptId]);
        const ids = deptUsers.map(u => u.id);
        if (ids.length > 0) {
          const ph = ids.map(() => '?').join(',');
          permClause = `(create_by IN (${ph}) OR customer_owner IN (${ph}))`;
          permParams.push(...ids, ...ids);
        }
      }
    } else if (dp.type === 'custom' && dp.customDeptIds) {
      const deptIds = String(dp.customDeptIds).split(',').map(Number).filter(n => !isNaN(n));
      if (deptIds.length > 0) {
        const ph = deptIds.map(() => '?').join(',');
        permClause = `(create_by IN (SELECT id FROM sys_user WHERE dept_id IN (${ph})) OR customer_owner IN (SELECT id FROM sys_user WHERE dept_id IN (${ph})))`;
        permParams.push(...deptIds, ...deptIds);
      }
    } else {
      permClause = '(create_by = ? OR customer_owner = ?)';
      permParams.push(dp.userId, dp.userId);
    }

    const [stats] = await pool.query(
      `SELECT
        SUM(CASE WHEN DATE(next_time) = CURRENT_DATE THEN 1 ELSE 0 END) as today_count,
        SUM(CASE WHEN DATE(next_time) = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY) THEN 1 ELSE 0 END) as tomorrow_count,
        SUM(CASE WHEN DATE(next_time) < CURRENT_DATE THEN 1 ELSE 0 END) as overdue_count
      FROM (
        SELECT f.next_time, f.create_by, cu.owner_id as customer_owner
        FROM crm_follow_up f
        LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
        WHERE f.deleted_at IS NULL AND f.next_time IS NOT NULL
      ) t
      WHERE ${permClause}`,
      permParams
    );

    res.json({
      code: 200, message: '获取统计成功',
      data: {
        today_count: stats[0]?.today_count || 0,
        tomorrow_count: stats[0]?.tomorrow_count || 0,
        overdue_count: stats[0]?.overdue_count || 0
      }
    });
  } catch (error) {
    console.error('获取任务统计错误:', error);
    res.status(500).json({ code: 500, message: '获取统计失败', data: null });
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
// 注意：此端点需要同时检查 f.create_by 和 cu.owner_id 两个字段
router.post('/calendar', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res) => {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({ code: 400, message: '请提供年份和月份', data: null });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    // 构建数据权限条件（需要同时检查 create_by 和 customer owner）
    const dp = req.dataPermission;
    let permClause = '1=1';
    const permExtraParams = [];

    if (dp.type === 'all') {
      permClause = '1=1';
    } else if (dp.type === 'dept' || dp.type === 'dept_and_sub') {
      const [deptRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [dp.userId]);
      const deptId = deptRows[0]?.dept_id;
      if (deptId) {
        const [deptUsers] = await pool.query('SELECT id FROM sys_user WHERE dept_id = ?', [deptId]);
        const ids = deptUsers.map(u => u.id);
        if (ids.length > 0) {
          const ph = ids.map(() => '?').join(',');
          permClause = `(f.create_by IN (${ph}) OR cu.owner_id IN (${ph}))`;
          permExtraParams.push(...ids, ...ids);
        }
      }
    } else if (dp.type === 'custom' && dp.customDeptIds) {
      const deptIds = String(dp.customDeptIds).split(',').map(Number).filter(n => !isNaN(n));
      if (deptIds.length > 0) {
        const ph = deptIds.map(() => '?').join(',');
        permClause = `(f.create_by IN (SELECT id FROM sys_user WHERE dept_id IN (${ph})) OR cu.owner_id IN (SELECT id FROM sys_user WHERE dept_id IN (${ph})))`;
        permExtraParams.push(...deptIds, ...deptIds);
      }
    } else {
      permClause = '(f.create_by = ? OR cu.owner_id = ?)';
      permExtraParams.push(dp.userId, dp.userId);
    }

    const params = [startDate, endDate, startDate, endDate, ...permExtraParams];

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
        AND ${permClause}
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
