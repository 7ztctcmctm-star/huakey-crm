/**
 * 客户分配服务层
 * 从 routes/customer/assign.js 提取的业务逻辑
 */

const { CUSTOMER_STATUS } = require('../constants/customerStatus');
const { POOL_STATUS } = require('../constants/poolStatus');

// ========== 分配规则 ==========

/**
 * 获取分配规则列表
 */
async function getAssignRules(pool) {
  const [list] = await pool.query(
    'SELECT id, rule_name, assign_type, source_value, region_value, user_ids, last_assigned_index, priority, is_active, create_time, update_time FROM crm_assign_rule ORDER BY priority DESC, id ASC'
  );
  return list;
}

/**
 * 添加分配规则
 */
async function createRule(pool, data) {
  const { rule_name, assign_type, source_value, region_value, user_ids, priority } = data;
  const [result] = await pool.query(
    `INSERT INTO crm_assign_rule (rule_name, assign_type, source_value, region_value, user_ids, priority)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rule_name, assign_type, source_value || null, region_value || null, JSON.stringify(user_ids), priority || 0]
  );
  return result.insertId;
}

/**
 * 更新分配规则
 */
async function updateRule(pool, id, data) {
  const { rule_name, assign_type, source_value, region_value, user_ids, priority, is_active } = data;
  const updates = [];
  const params = [];

  if (rule_name !== undefined) { updates.push('rule_name = ?'); params.push(rule_name); }
  if (assign_type !== undefined) { updates.push('assign_type = ?'); params.push(assign_type); }
  if (source_value !== undefined) { updates.push('source_value = ?'); params.push(source_value); }
  if (region_value !== undefined) { updates.push('region_value = ?'); params.push(region_value); }
  if (user_ids !== undefined) { updates.push('user_ids = ?'); params.push(JSON.stringify(user_ids)); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

  if (updates.length === 0) return 0;

  params.push(id);
  const [result] = await pool.query(
    `UPDATE crm_assign_rule SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * 删除分配规则
 */
async function deleteRule(pool, id) {
  const [result] = await pool.query('DELETE FROM crm_assign_rule WHERE id = ?', [id]);
  return result.affectedRows;
}

/**
 * 轮询自动分配：将公海客户均匀分配给销售团队
 */
async function applyRule(pool, operatorId) {
  const connection = await pool.getConnection();
  try {
    // 获取公海可分配客户（无负责人且不在保护期）
    const [customers] = await connection.query(
      `SELECT id, owner_id FROM crm_customer
       WHERE deleted_at IS NULL AND owner_id IS NULL
         AND (protect_until IS NULL OR protect_until < NOW())
       ORDER BY create_time ASC
       LIMIT 500`
    );

    if (customers.length === 0) {
      return { count: 0, sales_count: 0, message: '没有可分配的客户' };
    }

    // 获取活跃销售用户
    const [salesUsers] = await connection.query(
      `SELECT u.id FROM sys_user u
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.status = 1 AND r.code IN ('sales') -- 旧码 sales_manager/tech 现库已不存在，自动分配仅面向 sales
       ORDER BY u.id`
    );

    if (salesUsers.length === 0) {
      return { count: 0, sales_count: 0, message: '没有可用的销售人员' };
    }

    await connection.beginTransaction();

    let successCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const targetUser = salesUsers[i % salesUsers.length];

      await connection.query(
        'UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL WHERE id = ?',
        [targetUser.id, POOL_STATUS.PRIVATE, customer.id]
      );

      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, '轮询自动分配')`,
        [customer.id, customer.owner_id, targetUser.id, operatorId]
      );

      successCount++;
    }

    await connection.commit();

    return { count: successCount, sales_count: salesUsers.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 自动分配负责人（供 detail.js 新增客户时调用）
 * 按规则匹配并轮询分配
 */
async function autoAssignOwner(pool, customer) {
  try {
    const [rules] = await pool.query(
      'SELECT id, rule_name, assign_type, source_value, region_value, user_ids, last_assigned_index, priority, is_active, create_time, update_time FROM crm_assign_rule WHERE is_active = 1 ORDER BY priority DESC'
    );
    if (rules.length === 0) return null;

    for (const rule of rules) {
      let matched = false;

      if (rule.assign_type === 'round_robin') {
        matched = true;
      } else if (rule.assign_type === 'by_source' && customer.source === rule.source_value) {
        matched = true;
      } else if (rule.assign_type === 'by_region' && customer.address && customer.address.includes(rule.region_value)) {
        matched = true;
      }

      if (matched) {
        let userIds;
        try {
          userIds = typeof rule.user_ids === 'string' ? JSON.parse(rule.user_ids) : rule.user_ids;
        } catch (error) {
          console.error('[客户分配] 解析用户ID失败:', error);
          continue;
        }
        if (!Array.isArray(userIds) || userIds.length === 0) continue;

        const lastIndex = rule.last_assigned_index || 0;
        const nextIndex = (lastIndex + 1) % userIds.length;

        await pool.query(
          'UPDATE crm_assign_rule SET last_assigned_index = ? WHERE id = ?',
          [nextIndex, rule.id]
        );

        return userIds[nextIndex];
      }
    }
    return null;
  } catch (error) {
    console.error('自动分配规则执行错误:', error);
    return null;
  }
}

// ========== 单个/批量分配 ==========

/**
 * 分配/回收客户负责人
 * to_user_id 为 null 表示回收为无负责人状态
 */
async function manualAssign(pool, customerId, toUserId, operatorId, remark) {
  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );

  if (customers.length === 0) {
    return { code: 404, message: '客户不存在', data: null };
  }

  const customer = customers[0];
  const fromUserId = customer.owner_id;

  // 更新负责人（to_user_id 为 null 表示回收为无负责人）
  // 回收时同步 pool_status='sea' 和 status=sea，分配时 pool_status='private'
  const toUserIdValue = toUserId || null;
  const poolStatus = toUserIdValue ? POOL_STATUS.PRIVATE : POOL_STATUS.SEA;

  let updateSql = 'UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL';
  const updateParams = [toUserIdValue, poolStatus];
  if (!toUserIdValue) {
    updateSql += ', status = ?';
    updateParams.push(CUSTOMER_STATUS.SEA);
  }
  updateSql += ' WHERE id = ?';
  updateParams.push(customerId);

  await pool.query(updateSql, updateParams);

  // 记录分配日志
  await pool.query(
    'INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, ?, ?, ?, ?)',
    [customerId, fromUserId, toUserId || null, operatorId, remark || null]
  );

  return { code: 200, message: toUserId ? '分配成功' : '已回收为待分配', data: null, company_name: customer.company_name };
}

/**
 * 批量分配客户负责人（事务保护）
 */
async function batchAssign(pool, customerIds, toUserId, operatorId, remark) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customerIds) {
      const [customers] = await connection.query(
        'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      const poolStatus = toUserId ? POOL_STATUS.PRIVATE : POOL_STATUS.SEA;
      let updateSql = 'UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL';
      const updateParams = [toUserId, poolStatus];
      if (!toUserId) {
        updateSql += ', status = ?';
        updateParams.push(CUSTOMER_STATUS.SEA);
      }
      updateSql += ' WHERE id = ?';
      updateParams.push(customerId);

      await connection.query(updateSql, updateParams);

      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, customer.owner_id, toUserId, operatorId, remark || null]
      );

      successCount++;
    }

    await connection.commit();
    return { count: successCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ========== 查询 ==========

/**
 * 查询分配日志
 */
async function getAssignLogs(pool, params) {
  const { customer_id, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let whereClause = '1=1';
  if (customer_id) {
    whereClause += ' AND al.customer_id = ?';
    queryParams.push(customer_id);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_assign_log al WHERE ${whereClause}`,
    queryParams
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT al.id, al.customer_id, al.from_user_id, al.to_user_id, al.operator_id, al.remark, al.create_time,
      c.company_name,
      u1.real_name as from_user_name,
      u2.real_name as to_user_name,
      u3.real_name as operator_name
    FROM crm_assign_log al
    LEFT JOIN crm_customer c ON al.customer_id = c.id
    LEFT JOIN sys_user u1 ON al.from_user_id = u1.id
    LEFT JOIN sys_user u2 ON al.to_user_id = u2.id
    LEFT JOIN sys_user u3 ON al.operator_id = u3.id
    WHERE ${whereClause}
    ORDER BY al.create_time DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 获取销售用户列表（供分配下拉选择）
 */
async function getSalesUsers(pool) {
  const [users] = await pool.query(
    `SELECT u.id, u.real_name, u.username, d.name as dept_name
     FROM sys_user u
     LEFT JOIN sys_dept d ON u.dept_id = d.id
     LEFT JOIN sys_role r ON u.role_id = r.id
     WHERE u.status = 1 AND r.code IN ('sales') -- 旧码 sales_manager/tech 现库已不存在，下拉仅列 sales
     ORDER BY d.name, u.real_name`
  );
  return users;
}

/**
 * 获取当前用户的下属列表
 */
async function getMySubordinates(pool, userId) {
  const [users] = await pool.query(
    `SELECT u.id, u.real_name, u.username, d.name as dept_name
     FROM sys_user u
     LEFT JOIN sys_dept d ON u.dept_id = d.id
     WHERE u.status = 1 AND u.manager_id = ?
     ORDER BY d.name, u.real_name`,
    [userId]
  );
  return users;
}

module.exports = {
  getAssignRules,
  createRule,
  updateRule,
  deleteRule,
  applyRule,
  autoAssignOwner,
  manualAssign,
  batchAssign,
  getAssignLogs,
  getSalesUsers,
  getMySubordinates
};
