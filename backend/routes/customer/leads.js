const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { SOURCE_PARENT_MAP } = require('./detail');

const MODULE_NAME = '客户管理';

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const { getDataPermission, buildPermissionClause } = require('../../utils/permission');

const router = express.Router();

// 线索列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, company_name, contact_name, phone, source, lead_level, follow_status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c');
    params.push(...permParams);

    // 线索池准入：status=1 且 负责人为空或为管理员
    // 支持"我的线索"模式
    let whereClause;
    if (req.body.owner_id) {
      whereClause = `WHERE ${permissionClause} AND c.status = 1 AND c.owner_id = ?`;
      params.push(req.body.owner_id);
    } else {
      whereClause = `WHERE ${permissionClause} AND c.status = 1 AND (c.owner_id IS NULL OR c.owner_id = 1)`;
    }

    if (company_name) { whereClause += ' AND c.company_name LIKE ?'; params.push(`%${company_name}%`); }
    if (contact_name) { whereClause += ' AND c.contact_name LIKE ?'; params.push(`%${contact_name}%`); }
    if (phone) { whereClause += ' AND c.phone LIKE ?'; params.push(`%${phone}%`); }
    if (source) {
      if (SOURCE_PARENT_MAP[source]) {
        const children = SOURCE_PARENT_MAP[source];
        whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
        params.push(...children);
      } else {
        whereClause += ' AND c.source = ?'; params.push(source);
      }
    }
    if (lead_level) { whereClause += ' AND c.lead_level = ?'; params.push(lead_level); }
    if (follow_status) { whereClause += ' AND c.follow_status = ?'; params.push(follow_status); }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.source, c.level,
        c.lead_level, c.follow_status, c.owner_id, c.status,
        c.last_follow_time, c.create_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY c.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({ code: 200, message: '获取线索列表成功', data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('获取线索列表错误:', error);
    res.status(500).json({ code: 500, message: '获取线索列表失败', data: null });
  }
});

// 线索转化：将线索转为正式客户，自动创建商机
router.post('/convert', authenticateToken, checkPermission('leads'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await connection.query('SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND status = 1', [id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或已转化', data: null });

    const lead = rows[0];
    await connection.query(
      `UPDATE crm_customer
       SET status = 2,
           customer_type = 'customer',
           lifecycle_status = 'active',
           converted_at = COALESCE(converted_at, NOW()),
           lead_level = NULL
       WHERE id = ?`,
      [id]
    );

    // 自动创建商机
    const ownerId = lead.owner_id || req.user.userId;
    await connection.query(
      `INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, owner_id)
       VALUES (?, ?, 0, NULL, 1, 10, ?)`,
      [id, `${lead.company_name} 商机`, ownerId]
    );

    await connection.commit();

    await logAction(req, 'convert', `线索转化: ${lead.company_name} → 正式客户（已自动创建商机）`);

    res.json({ code: 200, message: '转化成功，已自动创建商机', data: { id, company_name: lead.company_name } });
  } catch (error) {
    await connection.rollback();
    console.error('线索转化错误:', error);
    res.status(500).json({ code: 500, message: '转化失败', data: null });
  } finally {
    connection.release();
  }
});

// 销售领取线索
router.post('/claim', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await pool.query(
      'SELECT id, company_name FROM crm_customer WHERE id = ? AND status = 1 AND (owner_id IS NULL OR owner_id = 1)',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或已被领取', data: null });

    await pool.query(
      'UPDATE crm_customer SET owner_id = ?, follow_status = ? WHERE id = ?',
      [req.user.userId, '初次联系', id]
    );

    await logAction(req, 'claim-lead', `领取线索: ${rows[0].company_name}`);

    res.json({ code: 200, message: '领取成功，该线索已归您跟进', data: { id, company_name: rows[0].company_name } });
  } catch (error) {
    console.error('领取线索错误:', error);
    res.status(500).json({ code: 500, message: '领取失败', data: null });
  }
});

// 销售标记线索为已流失
router.post('/mark-lost', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status = 1 AND owner_id = ?',
      [id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或无权操作', data: null });

    await pool.query(
      `UPDATE crm_customer
       SET status = 3,
           customer_type = 'customer',
           lifecycle_status = 'lost',
           follow_status = '已流失'
       WHERE id = ?`,
      [id]
    );

    res.json({ code: 200, message: '已标记为流失', data: { id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 线索统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c');

    const [total] = await pool.query(`SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 1`, permParams);
    const [month] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 1 AND YEAR(create_time) = YEAR(NOW()) AND WEEK(create_time, 1) = WEEK(NOW(), 1)`,
      permParams
    );
    const [converted] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 2 AND converted_at >= NOW() - INTERVAL 30 DAY`,
      permParams
    );

    res.json({ code: 200, message: '查询成功', data: {
      total: total[0].cnt,
      week_new: month[0].cnt,
      month_converted: converted[0].cnt
    }});
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
