/**
 * 跟进记录服务层
 * 从 routes/followUp.js 提取的业务逻辑，供路由层复用
 */

const ROLES = require('../config/roles');
const logger = require('../config/logger');
const { CUSTOMER_STATUS } = require('../constants/customerStatus');
const customerService = require('../services/customerService');

/**
 * 添加跟进记录
 * @param {object} pool
 * @param {object} params - { customer_id, contact_id, follow_type, content, next_time, next_content, attachment_ids }
 * @param {number} userId - 当前用户ID
 * @returns {{ id: number }}
 */
async function addFollowUp(pool, params, userId) {
  const { customer_id, contact_id, follow_type, content, next_time, next_content, attachment_ids } = params;

  const [customers] = await pool.query(
    'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
    [customer_id]
  );
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO crm_follow_up (customer_id, contact_id, follow_type, content, next_time, next_content, create_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [customer_id, contact_id || null, follow_type || '电话', content, next_time || null, next_content || null, userId]
  );

  // 绑定附件
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

  // 自动推进客户状态：new / sea -> following（可通过 advance_status=false 手动覆盖）
  const advanceStatus = params.advance_status !== false;
  if (advanceStatus) {
    const [customerRows] = await pool.query(
      'SELECT status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customer_id]
    );
    if (customerRows.length > 0) {
      const currentStatus = customerRows[0].status;
      if (currentStatus === CUSTOMER_STATUS.SEA || currentStatus === 'new') {
        try {
          await customerService.transitionStatus(
            pool,
            customer_id,
            CUSTOMER_STATUS.FOLLOWING,
            userId
          );
        } catch (e) {
          logger.error('[跟进] 自动推进客户状态失败', {
            customer_id,
            from_status: currentStatus,
            error: e.message,
            traceId: 'N/A'
          });
        }
      }
    }
  }

  return { id: result.insertId };
}

/**
 * 批量添加跟进记录（事务）
 * @param {object} pool
 * @param {Array} items - [{ customer_id, content, follow_type, next_time }]
 * @param {number} userId
 * @returns {{ count: number }}
 */
async function batchAddFollowUp(pool, items, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const item of items) {
      if (!item.customer_id || !item.content) continue;

      await connection.query(
        `INSERT INTO crm_follow_up (customer_id, follow_type, content, next_time, create_by)
         VALUES (?, ?, ?, ?, ?)`,
        [item.customer_id, item.follow_type || '电话', item.content, item.next_time || null, userId]
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
    return { count: items.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取客户的跟进记录列表
 * @param {object} pool
 * @param {object} params - { customer_id, page, pageSize }
 * @param {object} permission - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function listFollowUps(pool, params, permission) {
  const { customer_id, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;
  const { clause: permClause, params: permParams } = permission;

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_follow_up f WHERE f.customer_id = ? AND f.deleted_at IS NULL AND ${permClause}`,
    [customer_id, ...permParams]
  );
  const total = countResult[0].total;

  const [records] = await pool.query(
    `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
      f.next_time, f.next_content, f.create_by, f.create_time,
      f.is_plan, f.plan_status, f.finish_time,
      u.real_name as creator_name,
      c.name as contact_name
    FROM crm_follow_up f
    LEFT JOIN sys_user u ON f.create_by = u.id
    LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
    WHERE f.customer_id = ? AND f.deleted_at IS NULL AND ${permClause}
    ORDER BY f.create_time DESC
    LIMIT ? OFFSET ?`,
    [customer_id, ...permParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list: records, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 获取今日需要跟进的提醒
 * @param {object} pool
 * @param {object} permission - { clause, params }
 * @returns {{ list: Array, total: number }}
 */
async function getTodayRemind(pool, permission) {
  const { clause: permClause, params: permParams } = permission;

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

  return { list: records, total: records.length };
}

/**
 * 明日计划跟进列表
 * @param {object} pool
 * @param {object} permission - { clause, params }
 * @returns {{ list: Array, total: number }}
 */
async function getTomorrowPlan(pool, permission) {
  const { clause: permClause, params: permParams } = permission;

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

  return { list: records, total: records.length };
}

/**
 * 逾期未跟进列表
 * @param {object} pool
 * @param {object} permission - { clause, params }
 * @returns {{ list: Array, total: number }}
 */
async function getOverdueList(pool, permission) {
  const { clause: permClause, params: permParams } = permission;

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

  return { list: records, total: records.length };
}

/**
 * 任务统计（今日/明日/逾期数量）
 * @param {object} pool
 * @param {object} dataPermission - { type, userId, customDeptIds }
 * @returns {{ today_count: number, tomorrow_count: number, overdue_count: number }}
 */
async function getTaskStats(pool, dataPermission) {
  const dp = dataPermission;
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

  return {
    today_count: stats[0]?.today_count || 0,
    tomorrow_count: stats[0]?.tomorrow_count || 0,
    overdue_count: stats[0]?.overdue_count || 0
  };
}

/**
 * 编辑跟进记录
 * @param {object} pool
 * @param {object} params - { id, contact_id, follow_type, content, next_time, next_content }
 * @param {object} user - { manageAll, roleId, userId }
 */
async function updateFollowUp(pool, params, user) {
  const { id, contact_id, follow_type, content, next_time, next_content } = params;

  const [rows] = await pool.query('SELECT id, create_by FROM crm_follow_up WHERE id = ?', [id]);
  if (rows.length === 0) {
    const err = new Error('跟进记录不存在');
    err.code = 404;
    throw err;
  }

  if (!user.manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(user.roleId) && rows[0].create_by !== user.userId) {
    const err = new Error('无权编辑该记录');
    err.code = 403;
    throw err;
  }

  await pool.query(
    `UPDATE crm_follow_up SET contact_id = ?, follow_type = ?, content = ?, next_time = ?, next_content = ?
     WHERE id = ?`,
    [contact_id || null, follow_type || '电话', content, next_time || null, next_content || null, id]
  );
}

/**
 * 删除跟进记录（软删除）
 * @param {object} pool
 * @param {number} id
 * @param {object} user - { manageAll, roleId, userId }
 */
async function deleteFollowUp(pool, id, user) {
  const [rows] = await pool.query('SELECT id, create_by, customer_id FROM crm_follow_up WHERE id = ?', [id]);
  if (rows.length === 0) {
    const err = new Error('跟进记录不存在');
    err.code = 404;
    throw err;
  }

  if (!user.manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(user.roleId) && rows[0].create_by !== user.userId) {
    const err = new Error('无权删除该记录');
    err.code = 403;
    throw err;
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
}

/**
 * 跟进日历：获取某月的跟进记录
 * @param {object} pool
 * @param {object} params - { year, month }
 * @param {object} dataPermission - { type, userId, customDeptIds }
 * @returns {{ list: Array, total: number }}
 */
async function getCalendar(pool, params, dataPermission) {
  const { year, month } = params;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const dp = dataPermission;
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

  const queryParams = [startDate, endDate, startDate, endDate, ...permExtraParams];

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
    queryParams
  );

  return { list: records, total: records.length };
}

/**
 * 添加跟进计划（合并模型：is_plan=1 的跟进记录）
 * @param {object} pool
 * @param {object} params - { customer_id, contact_id, plan_time, plan_content, follow_type }
 * @param {number} userId
 * @returns {{ id: number }}
 */
async function addPlan(pool, params, userId) {
  const { customer_id, contact_id, plan_time, plan_content, follow_type } = params;

  const [customers] = await pool.query(
    'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
    [customer_id]
  );
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO crm_follow_up
       (customer_id, contact_id, follow_type, content, next_time, create_by, is_plan, plan_status)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'pending')`,
    [customer_id, contact_id || null, follow_type || '电话', plan_content, plan_time || null, userId]
  );

  return { id: result.insertId };
}

/**
 * 跟进计划列表（is_plan=1）
 * @param {object} pool
 * @param {object} params - { customer_id, status, start_date, end_date, page, pageSize }
 * @param {object} permission - { clause, params }
 */
async function listPlans(pool, params, permission) {
  const { customer_id, status, start_date, end_date, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;
  const { clause: permClause, params: permParams } = permission;

  const where = ['f.is_plan = 1', 'f.deleted_at IS NULL', permClause];
  const queryParams = [...permParams];
  if (customer_id) { where.push('f.customer_id = ?'); queryParams.push(customer_id); }
  if (status) { where.push('f.plan_status = ?'); queryParams.push(status); }
  if (start_date) { where.push('DATE(f.next_time) >= ?'); queryParams.push(start_date); }
  if (end_date) { where.push('DATE(f.next_time) <= ?'); queryParams.push(end_date); }
  const whereStr = where.join(' AND ');

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_follow_up f WHERE ${whereStr}`,
    queryParams
  );
  const total = countResult[0].total;

  const [records] = await pool.query(
    `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
       f.next_time, f.finish_time, f.plan_status, f.create_by, f.create_time,
       u.real_name as creator_name,
       c.name as contact_name
     FROM crm_follow_up f
     LEFT JOIN sys_user u ON f.create_by = u.id
     LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
     WHERE ${whereStr}
     ORDER BY f.next_time ASC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list: records, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 完成跟进计划：将 is_plan=1 的计划转为实际跟进（is_plan=0），填充完成时间与内容
 * @param {object} pool
 * @param {object} params - { id, content, follow_type }
 * @param {number} userId
 */
async function completePlan(pool, params) {
  const { id, content, follow_type } = params;

  const [rows] = await pool.query(
    'SELECT id, customer_id, create_by FROM crm_follow_up WHERE id = ? AND is_plan = 1 AND deleted_at IS NULL',
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('跟进计划不存在');
    err.code = 404;
    throw err;
  }

  await pool.query(
    `UPDATE crm_follow_up
     SET is_plan = 0, plan_status = 'completed', finish_time = NOW(),
         content = ?, follow_type = COALESCE(?, follow_type)
     WHERE id = ?`,
    [content, follow_type || null, id]
  );

  const customerId = rows[0].customer_id;
  await pool.query('UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?', [customerId]);
  await pool.query(
    'UPDATE crm_follow_up_reminder SET is_dismissed = 1 WHERE customer_id = ? AND is_dismissed = 0',
    [customerId]
  );

  return { id };
}

/**
 * 取消跟进计划（软删除）
 * @param {object} pool
 * @param {object} params - { id, roleId, userId, manageAll }
 */
async function cancelPlan(pool, params) {
  const { id, roleId, userId, manageAll } = params;

  const [rows] = await pool.query(
    'SELECT id, create_by FROM crm_follow_up WHERE id = ? AND is_plan = 1 AND deleted_at IS NULL',
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('跟进计划不存在');
    err.code = 404;
    throw err;
  }

  if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && rows[0].create_by !== userId) {
    const err = new Error('无权取消该计划');
    err.code = 403;
    throw err;
  }

  await pool.query('UPDATE crm_follow_up SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}

module.exports = {
  addFollowUp,
  batchAddFollowUp,
  listFollowUps,
  getTodayRemind,
  getTomorrowPlan,
  getOverdueList,
  getTaskStats,
  updateFollowUp,
  deleteFollowUp,
  getCalendar,
  addPlan,
  listPlans,
  completePlan,
  cancelPlan
};
