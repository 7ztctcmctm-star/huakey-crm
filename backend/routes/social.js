const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 沟通记录列表
router.get('/records', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    const { customer_id, contact_id, platform, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE 1=1 AND s.deleted_at IS NULL';
    const params = [];
    if (customer_id) { where += ' AND s.customer_id = ?'; params.push(customer_id); }
    if (contact_id) { where += ' AND s.contact_id = ?'; params.push(contact_id); }
    if (platform) { where += ' AND s.platform = ?'; params.push(platform); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_social_contact s ${where}`, params);
    const [rows] = await pool.query(`
      SELECT s.*, c.company_name as customer_name, ct.name as contact_name, u.real_name as create_by_name
      FROM crm_social_contact s
      LEFT JOIN crm_customer c ON s.customer_id = c.id
      LEFT JOIN crm_contact ct ON s.contact_id = ct.id
      LEFT JOIN sys_user u ON s.create_by = u.id
      ${where} ORDER BY s.message_time DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[社媒] 记录列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建沟通记录
router.post('/records', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    const { customer_id, contact_id, platform, direction, content, attachment_url, message_time } = req.body;
    if (!platform || !direction) return res.status(400).json({ code: 400, message: '平台和方向必填', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_social_contact (customer_id, contact_id, platform, direction, content, attachment_url, message_time, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [customer_id || null, contact_id || null, platform, direction, content || null, attachment_url || null, message_time || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[社媒] 创建记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新记录
router.put('/records/:id', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    const { platform, direction, content, attachment_url, message_time } = req.body;
    const fields = [], values = [];
    if (platform !== undefined) { fields.push('platform = ?'); values.push(platform); }
    if (direction !== undefined) { fields.push('direction = ?'); values.push(direction); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (attachment_url !== undefined) { fields.push('attachment_url = ?'); values.push(attachment_url); }
    if (message_time !== undefined) { fields.push('message_time = ?'); values.push(message_time); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_social_contact SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[社媒] 更新记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除记录
router.delete('/records/:id', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    // 校验所有权
    const [[record]] = await pool.query('SELECT create_by FROM crm_social_contact WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ code: 404, message: '记录不存在', data: null });
    if (record.create_by !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权删除此记录', data: null });
    }

    await pool.query('UPDATE crm_social_contact SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[社媒] 删除记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 社媒统计
router.get('/stats', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_social_contact WHERE deleted_at IS NULL');
    const [[{ week_new }]] = await pool.query("SELECT COUNT(*) as week_new FROM crm_social_contact WHERE deleted_at IS NULL AND create_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
    const [platformDist] = await pool.query('SELECT platform, COUNT(*) as count FROM crm_social_contact WHERE deleted_at IS NULL GROUP BY platform ORDER BY count DESC');
    const [trend] = await pool.query(`
      SELECT DATE(message_time) as date, COUNT(*) as count
      FROM crm_social_contact WHERE deleted_at IS NULL AND message_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(message_time) ORDER BY date
    `);

    res.json({ code: 200, message: '查询成功', data: { total, week_new, platform_dist: platformDist, trend } });
  } catch (error) {
    console.error('[社媒] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 客户社媒时间线
router.get('/customer/:id/timeline', authenticateToken, checkPermission('social'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, ct.name as contact_name, u.real_name as create_by_name
      FROM crm_social_contact s
      LEFT JOIN crm_contact ct ON s.contact_id = ct.id
      LEFT JOIN sys_user u ON s.create_by = u.id
      WHERE s.customer_id = ? AND s.deleted_at IS NULL
      ORDER BY s.message_time DESC LIMIT 100
    `, [req.params.id]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[社媒] 客户时间线查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
