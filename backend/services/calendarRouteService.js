// 日历日程服务
// 从 routes/calendar.js 提取的业务逻辑

/**
 * 获取日程列表
 */
async function getEvents(pool, { start_date, end_date, event_type }) {
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

  return rows;
}

/**
 * 获取日程详情
 */
async function getEvent(pool, id) {
  const [[row]] = await pool.query(`
    SELECT e.*, c.company_name as customer_name, ct.name as contact_name
    FROM crm_calendar_event e
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    LEFT JOIN crm_contact ct ON e.contact_id = ct.id
    WHERE e.id = ? AND e.deleted_at IS NULL
  `, [id]);
  return row;
}

/**
 * 创建日程
 */
async function createEvent(pool, data, userId) {
  const { title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, related_type, related_id, attendees, reminder_minutes, color } = data;
  if (!title || !start_time) return { error: '标题和开始时间必填' };

  const attendeesStr = Array.isArray(attendees) ? JSON.stringify(attendees) : attendees;
  const [result] = await pool.query(
    `INSERT INTO crm_calendar_event (title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, related_type, related_id, attendees, reminder_minutes, color, create_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, event_type || 'meeting', description || null, start_time, end_time || null, all_day || 0, location || null, customer_id || null, contact_id || null, related_type || null, related_id || null, attendeesStr, reminder_minutes || 15, color || '#2563EB', userId]
  );
  return { id: result.insertId };
}

/**
 * 更新日程（含所有权校验）
 */
async function updateEvent(pool, id, data, userId, manageAll) {
  const [[event]] = await pool.query('SELECT create_by FROM crm_calendar_event WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!event) return { error: '日程不存在', status: 404 };
  if (event.create_by !== userId && !manageAll) {
    return { error: '无权修改此日程', status: 403 };
  }

  const { title, event_type, description, start_time, end_time, all_day, location, customer_id, contact_id, attendees, reminder_minutes, status, color } = data;
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
  if (fields.length === 0) return { error: '没有要更新的字段', status: 400 };
  values.push(id);
  await pool.query(`UPDATE crm_calendar_event SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
  return { success: true };
}

/**
 * 删除日程（含所有权校验，软删除）
 */
async function deleteEvent(pool, id, userId, manageAll) {
  const [[event]] = await pool.query('SELECT create_by FROM crm_calendar_event WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!event) return { error: '日程不存在', status: 404 };
  if (event.create_by !== userId && !manageAll) {
    return { error: '无权删除此日程', status: 403 };
  }

  await pool.query('UPDATE crm_calendar_event SET deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}

/**
 * 标记日程完成
 */
async function completeEvent(pool, id) {
  await pool.query("UPDATE crm_calendar_event SET status = 'completed' WHERE id = ? AND deleted_at IS NULL", [id]);
  return { success: true };
}

/**
 * 获取今日日程
 */
async function getToday(pool) {
  const [rows] = await pool.query(`
    SELECT e.*, c.company_name as customer_name
    FROM crm_calendar_event e
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    WHERE e.deleted_at IS NULL AND DATE(e.start_time) = CURDATE()
    ORDER BY e.start_time ASC
  `);
  return rows;
}

/**
 * 获取未来7天日程
 */
async function getUpcoming(pool) {
  const [rows] = await pool.query(`
    SELECT e.*, c.company_name as customer_name
    FROM crm_calendar_event e
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    WHERE e.deleted_at IS NULL AND e.start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
    ORDER BY e.start_time ASC
  `);
  return rows;
}

module.exports = {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  completeEvent,
  getToday,
  getUpcoming
};
