const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 1. 添加跟进记录
router.post('/add', authenticateToken, async (req, res) => {
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
      'SELECT COUNT(*) as total FROM crm_follow_up WHERE customer_id = ?',
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
      LEFT JOIN crm_contact c ON f.contact_id = c.id
      WHERE f.customer_id = ?
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

module.exports = router;
