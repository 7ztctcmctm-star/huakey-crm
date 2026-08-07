/**
 * @deprecated 线索服务层（Prompt 4-1 已废弃）
 * 线索已整合为客户生命周期的"潜客"阶段（customer_type='prospect'）。
 * 相关路由 /customer/leads/* 已全部返回 410 Gone，请使用 customerService。
 * 从 routes/customer/leads.js 提取的业务逻辑
 */

const ROLES = require('../config/roles');
const { CUSTOMER_STATUS } = require('../constants/customerStatus');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 线索数据权限子句构建
 * @param {object} pool
 * @param {object} user - { userId, roleId, manageAll }
 * @returns {{ clause: string, params: Array }}
 */
async function buildLeadsPermissionClause(pool, user) {
  if (user.roleId === ROLES.SALES) {
    const [users] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ?', [user.userId]
    );
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [deptUserIds] = await pool.query(
        'SELECT id FROM sys_user WHERE dept_id = ?', [deptId]
      );
      const userIds = deptUserIds.map(u => u.id);
      return {
        clause: `(c.owner_id IS NULL OR c.owner_id = ? OR c.owner_id IN (${userIds.map(() => '?').join(',')}))`,
        params: [user.userId, ...userIds]
      };
    }
    return { clause: '(c.owner_id IS NULL OR c.owner_id = ?)', params: [user.userId] };
  }
  if (user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER || user.manageAll) {
    return { clause: '1=1', params: [] };
  }
  return { clause: '(c.owner_id IS NULL OR c.owner_id = ?)', params: [user.userId] };
}

/**
 * 线索列表（分页、筛选）
 * @param {object} pool
 * @param {object} params - { page, pageSize, company_name, contact_name, phone, source, lead_level, follow_status, owner_id }
 * @param {object} user - { userId, roleId, manageAll }
 * @param {object} sourceParentMap - SOURCE_PARENT_MAP
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function getLeadsList(pool, params, user, sourceParentMap = {}) {
  const { page = 1, pageSize = 10, company_name, contact_name, phone, source, lead_level, follow_status, owner_id } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  const { clause: permissionClause, params: permParams } = await buildLeadsPermissionClause(pool, user);
  queryParams.push(...permParams);

  let whereClause;
  if (owner_id) {
    whereClause = `WHERE ${permissionClause} AND c.status = ? AND c.owner_id = ?`;
    queryParams.push(CUSTOMER_STATUS.FOLLOWING, owner_id);
  } else {
    whereClause = `WHERE ${permissionClause} AND c.status = ? AND c.owner_id IS NULL`;
    queryParams.push(CUSTOMER_STATUS.FOLLOWING);
  }

  if (company_name) { whereClause += ' AND c.company_name LIKE ?'; queryParams.push(`%${company_name}%`); }
  if (contact_name) { whereClause += ' AND c.contact_name LIKE ?'; queryParams.push(`%${contact_name}%`); }
  if (phone) { whereClause += ' AND c.phone LIKE ?'; queryParams.push(`%${phone}%`); }
  if (source) {
    if (sourceParentMap[source]) {
      const children = sourceParentMap[source];
      whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
      queryParams.push(...children);
    } else {
      whereClause += ' AND c.source = ?'; queryParams.push(source);
    }
  }
  if (lead_level) { whereClause += ' AND c.lead_level = ?'; queryParams.push(lead_level); }
  if (follow_status) { whereClause += ' AND c.follow_status = ?'; queryParams.push(follow_status); }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, queryParams
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
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 线索转化：将未分配的线索分配给指定销售
 * @param {object} pool
 * @param {number} id
 * @param {number} userId
 * @returns {{ id: number, company_name: string }}
 */
async function convertLead(pool, id, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND status = ? AND owner_id IS NULL`,
      [id, CUSTOMER_STATUS.FOLLOWING]
    );
    if (rows.length === 0) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '线索不存在或已分配');
    }

    const lead = rows[0];
    await connection.query(
      `UPDATE crm_customer
       SET owner_id = ?,
           converted_at = COALESCE(converted_at, NOW()),
           lead_level = NULL
       WHERE id = ?`,
      [userId, id]
    );

    await connection.commit();
    return { id, company_name: lead.company_name };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 批量转化线索
 * @param {object} pool
 * @param {Array<number>} ids
 * @returns {{ converted: number, errors: Array }}
 */
async function batchConvert(pool, ids) {
  let converted = 0;
  const errors = [];

  for (const id of ids) {
    try {
      await convertLead(pool, id);
      converted++;
    } catch (error) {
      errors.push({ id, message: error.message });
    }
  }

  return { converted, errors };
}

/**
 * 导入线索（批量插入）
 * @param {object} pool
 * @param {Array<object>} leads - [{ company_name, contact_name, phone, source, ... }]
 * @param {number} userId
 * @returns {{ imported: number, errors: Array }}
 */
async function importLeads(pool, leads, userId) {
  let imported = 0;
  const errors = [];

  for (const lead of leads) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO crm_customer (company_name, source, status, owner_id, create_by)
         VALUES (?, ?, ?, ?, ?)`,
        [lead.company_name, lead.source || null, CUSTOMER_STATUS.FOLLOWING, null, userId]
      );

      // 联系人信息统一存入 crm_contact
      if (lead.contact_name || lead.phone) {
        await connection.query(
          `INSERT INTO crm_contact (customer_id, name, phone, is_decision, is_primary, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [result.insertId, lead.contact_name || '', lead.phone || null, 0, 1]
        );
      }

      await connection.commit();
      imported++;
    } catch (error) {
      await connection.rollback();
      errors.push({ lead: lead.company_name, message: error.message });
    } finally {
      connection.release();
    }
  }

  return { imported, errors };
}

/**
 * 销售领取线索
 * @param {object} pool
 * @param {number} id
 * @param {number} userId
 * @returns {{ id: number, company_name: string }}
 */
async function claimLead(pool, id, userId) {
  const [rows] = await pool.query(
    `SELECT id, company_name FROM crm_customer WHERE id = ? AND status = ? AND owner_id IS NULL`,
    [id, CUSTOMER_STATUS.FOLLOWING]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '线索不存在或已被领取');
  }

  const [userInfo] = await pool.query(
    'SELECT dept_id FROM sys_user WHERE id = ?',
    [userId]
  );
  const deptId = userInfo.length > 0 ? userInfo[0].dept_id : null;

  await pool.query(
    'UPDATE crm_customer SET owner_id = ?, dept_id = ?, follow_status = ? WHERE id = ?',
    [userId, deptId, '初次联系', id]
  );

  return { id, company_name: rows[0].company_name };
}

/**
 * 标记线索为已流失
 * @param {object} pool
 * @param {number} id
 * @param {number} userId
 */
async function markLeadLost(pool, id, userId) {
  const [rows] = await pool.query(
    `SELECT id FROM crm_customer WHERE id = ? AND status = ? AND owner_id = ? AND deleted_at IS NULL`,
    [id, CUSTOMER_STATUS.FOLLOWING, userId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '线索不存在或无权操作');
  }

  await pool.query(
    `UPDATE crm_customer
     SET status = ?,
         follow_status = '已流失'
     WHERE id = ?`,
    [CUSTOMER_STATUS.LOST, id]
  );
}

/**
 * 线索统计
 * @param {object} pool
 * @param {object} user - { userId, roleId, manageAll }
 * @returns {{ total: number, week_new: number, month_converted: number }}
 */
async function getLeadsStats(pool, user) {
  const { clause: permissionClause, params: permParams } = await buildLeadsPermissionClause(pool, user);

  const leadWhere = `${permissionClause} AND c.status = ? AND c.owner_id IS NULL`;
  const convertedWhere = `${permissionClause} AND c.status = ? AND c.owner_id IS NOT NULL AND c.converted_at >= NOW() - INTERVAL 30 DAY`;

  const [total] = await pool.query(
    `SELECT COUNT(*) as cnt FROM crm_customer c WHERE ${leadWhere}`,
    [...permParams, CUSTOMER_STATUS.FOLLOWING]
  );
  const [month] = await pool.query(
    `SELECT COUNT(*) as cnt FROM crm_customer c WHERE ${leadWhere} AND YEAR(c.create_time) = YEAR(NOW()) AND WEEK(c.create_time, 1) = WEEK(NOW(), 1)`,
    [...permParams, CUSTOMER_STATUS.FOLLOWING]
  );
  const [converted] = await pool.query(
    `SELECT COUNT(*) as cnt FROM crm_customer c WHERE ${convertedWhere}`,
    [...permParams, CUSTOMER_STATUS.FOLLOWING]
  );

  return {
    total: total[0].cnt,
    week_new: month[0].cnt,
    month_converted: converted[0].cnt
  };
}

module.exports = {
  buildLeadsPermissionClause,
  getLeadsList,
  convertLead,
  batchConvert,
  importLeads,
  claimLead,
  markLeadLost,
  getLeadsStats
};
