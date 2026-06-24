const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 日程列表
router.get('/events', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const { start_date, end_date, event_type } = req.query;
    let where = 'WHERE e.deleted_at IS NULL';
    const params = [];
    if (start_date) { where += ' AND e.start_time >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND e.start_time <= ?'; params.push(end_date + ' 23:59:59'); }
    if (event_type) { where += ' AND e.event_type = ?'; params.push(event_type); }

    const [rows] = await pool.query(`
      SELECT e.*, c.company_name as customer_name, ct.name as contact_name, u.real_name as create_by_name
      FROM crm_calendar_event e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      LEFT JOIN crm_contact ct ON e.contact_id = ct.id
      LEFT JOIN sys_user u ON e.create_by = u.id
      ${where} ORDER BY e.start_time ASC
    `, params);

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[日程] 列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 日程详情
router.get('/events/:id', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const [[row]] = await pool.query(`
      SELECT e.*, c.company_name as customer_name, ct.name as contact_name
      FROM crm_calendar_event e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      LEFT JOIN crm_contact ct ON e.contact_id = ct.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `, [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: '日程不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[日程] 详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建日程
router.post('/events', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const { title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, related_type, related_id, attendees, reminder_minutes, color } = req.body;
    if (!title || !start_time) return res.status(400).json({ code: 400, message: '标题和开始时间必填', data: null });
    const attendeesStr = Array.isArray(attendees) ? JSON.stringify(attendees) : attendees;
    const [result] = await pool.query(
      `INSERT INTO crm_calendar_event (title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, related_type, related_id, attendees, reminder_minutes, color, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, event_type || 'meeting', description || null, start_time, end_time || null, all_day || 0, location || null, customer_id || null, contact_id || null, related_type || null, related_id || null, attendeesStr, reminder_minutes || 15, color || '#2563EB', req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[日程] 创建失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新日程
router.put('/events/:id', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    // 校验所有权
    const [[event]] = await pool.query('SELECT create_by FROM crm_calendar_event WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!event) return res.status(404).json({ code: 404, message: '日程不存在', data: null });
    if (event.create_by !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权修改此日程', data: null });
    }

    const { title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, attendees, reminder_minutes, status, color } = req.body;
    const fields = [], values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (event_type !== undefined) { fields.push('event_type = ?'); values.push(event_type); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (start_time !== undefined) { fields.push('start_time = ?'); values.push(start_time); }
    if (end_time !== undefined) { fields.push('end_time = ?'); values.push(end_time); }
    if (all_day !== undefined) { fields.push('all_day = ?'); values.push(all_day); }
    if (location !== undefined) { fields.push('location = ?'); values.push(location); }
    if (customer_id !== undefined) { fields.push('customer_id = ?'); values.push(customer_id); }
    if (contact_id !== undefined) { fields.push('contact_id = ?'); values.push(contact_id); }
    if (attendees !== undefined) { fields.push('attendees = ?'); values.push(Array.isArray(attendees) ? JSON.stringify(attendees) : attendees); }
    if (reminder_minutes !== undefined) { fields.push('reminder_minutes = ?'); values.push(reminder_minutes); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_calendar_event SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[日程] 更新失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除日程
router.delete('/events/:id', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    // 校验所有权
    const [[event]] = await pool.query('SELECT create_by FROM crm_calendar_event WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!event) return res.status(404).json({ code: 404, message: '日程不存在', data: null });
    if (event.create_by !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权删除此日程', data: null });
    }

    await pool.query('UPDATE crm_calendar_event SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[日程] 删除失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 标记完成
router.post('/events/:id/complete', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    await pool.query("UPDATE crm_calendar_event SET status = 'completed' WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
    res.json({ code: 200, message: '已标记完成', data: null });
  } catch (error) {
    console.error('[日程] 标记完成失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 今日日程
router.get('/today', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, c.company_name as customer_name
      FROM crm_calendar_event e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      WHERE e.deleted_at IS NULL AND DATE(e.start_time) = CURDATE()
      ORDER BY e.start_time ASC
    `);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[日程] 今日日程查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 未来7天日程
router.get('/upcoming', authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, c.company_name as customer_name
      FROM crm_calendar_event e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      WHERE e.deleted_at IS NULL AND e.start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
      ORDER BY e.start_time ASC
    `);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[日程] 未来日程查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
