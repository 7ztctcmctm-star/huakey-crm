const pool = require('../config/database');

const REMINDER_DAYS = [90, 60, 30, 15, 7];

const checkQualificationExpiry = async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Math.max(...REMINDER_DAYS));
    const maxDate = futureDate.toISOString().slice(0, 10);

    const [qualifications] = await pool.query(
      `SELECT q.id as qual_id, q.supplier_id, q.cert_name, q.expire_date,
              s.name as supplier_name
       FROM crm_supplier_qualification q
       JOIN crm_supplier s ON q.supplier_id = s.id
       WHERE q.status = 1
         AND q.expire_date BETWEEN ? AND ?
         AND q.expire_date >= ?
       ORDER BY q.expire_date ASC`,
      [today, maxDate, today]
    );

    console.log(`发现 ${qualifications.length} 个即将到期或已过期的资质`);

    const reminders = [];
    for (const qual of qualifications) {
      const expireDate = new Date(qual.expire_date);
      const daysUntilExpiry = Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24));

      let reminderType = '即将到期';
      if (daysUntilExpiry < 0) {
        reminderType = '已过期';
      }

      const existingReminder = await pool.query(
        `SELECT id FROM crm_qualification_reminder
         WHERE qualification_id = ? AND reminder_type = ? AND is_notified = 0`,
        [qual.qual_id, reminderType]
      );

      if (existingReminder[0].length === 0) {
        await pool.query(
          `INSERT INTO crm_qualification_reminder (qualification_id, supplier_id, cert_name, expire_date, days_before, reminder_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [qual.qual_id, qual.supplier_id, qual.cert_name, qual.expire_date, Math.abs(daysUntilExpiry), reminderType]
        );

        reminders.push({
          ...qual,
          daysUntilExpiry,
          reminderType,
          message: `${reminderType === '已过期' ? '已过期' : '将在' + daysUntilExpiry + '天后到期'}: ${qual.cert_name} (${qual.supplier_name})`
        });
      }
    }

    return { total: qualifications.length, reminders };
  } catch (error) {
    console.error('Check qualification expiry error:', error.message);
    throw error;
  }
};

const getPendingReminders = async () => {
  try {
    const [reminders] = await pool.query(
      `SELECT r.*, s.name as supplier_name
       FROM crm_qualification_reminder r
       JOIN crm_supplier s ON r.supplier_id = s.id
       WHERE r.is_notified = 0
       ORDER BY r.expire_date ASC`
    );
    return reminders;
  } catch (error) {
    console.error('Get pending reminders error:', error.message);
    throw error;
  }
};

const markReminderAsNotified = async (reminderIds) => {
  if (!Array.isArray(reminderIds)) reminderIds = [reminderIds];
  try {
    await pool.query(
      `UPDATE crm_qualification_reminder SET is_notified = 1, notified_at = NOW() WHERE id IN (?)`,
      [reminderIds]
    );
    return true;
  } catch (error) {
    console.error('Mark reminder error:', error.message);
    throw error;
  }
};

const getExpiringSoonList = async (days = 30) => {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const [list] = await pool.query(
      `SELECT q.*, s.name as supplier_name, (q.expire_date - CURRENT_DATE) as days_left
       FROM crm_supplier_qualification q
       JOIN crm_supplier s ON q.supplier_id = s.id
       WHERE q.status = 1 AND q.expire_date <= ? AND q.expire_date > CURRENT_DATE
       ORDER BY q.expire_date ASC`,
      [targetDate.toISOString().slice(0, 10)]
    );
    return list;
  } catch (error) {
    console.error('Get expiring soon list error:', error.message);
    throw error;
  }
};

const getExpiredList = async () => {
  try {
    const [list] = await pool.query(
      `SELECT q.*, s.name as supplier_name, (CURRENT_DATE - q.expire_date) as days_expired
       FROM crm_supplier_qualification q
       JOIN crm_supplier s ON q.supplier_id = s.id
       WHERE q.status = 1 AND q.expire_date < CURRENT_DATE
       ORDER BY q.expire_date ASC`
    );
    return list;
  } catch (error) {
    console.error('Get expired list error:', error.message);
    throw error;
  }
};

const updateQualificationStatus = async () => {
  try {
    const result = await pool.query(
      `UPDATE crm_supplier_qualification
       SET status = CASE
         WHEN expire_date < CURRENT_DATE THEN 3
         WHEN expire_date <= CURRENT_DATE + INTERVAL 30 DAY THEN 2
         ELSE 1
       END
       WHERE status != 3`
    );
    console.log(`更新资质状态: ${result[0].affectedRows} 条`);
    return result[0].affectedRows;
  } catch (error) {
    console.error('Update qualification status error:', error.message);
    throw error;
  }
};

module.exports = {
  checkQualificationExpiry,
  getPendingReminders,
  markReminderAsNotified,
  getExpiringSoonList,
  getExpiredList,
  updateQualificationStatus,
  REMINDER_DAYS
};
