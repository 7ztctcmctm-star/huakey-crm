/**
 * 客户分配服务层
 * 从 routes/customer/assign.js 提取的业务逻辑
 */

const { POOL_STATUS } = require('../constants/poolStatus');
// [P1-03] 分配/回收同样要同步 status/business_status（与认领/释放共用同一判定）
const { assignmentStatusFragment } = require('../utils/customerPoolState');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * [H-002] 校验目标用户是否为有效的销售人员（status=1 且角色为 sales/manager）
 * 防止把客户分配给管理员/禁用用户/非业务角色，破坏客户归属完整性
 * @param {object} pool
 * @param {number|null} toUserId - 目标用户 ID，null 表示回收为无负责人（跳过校验）
 * @returns {Promise<void>}
 */
async function validateTargetUser(pool, toUserId) {
  if (!toUserId) return; // 回收为无负责人，无需校验
  const [rows] = await pool.query(
    `SELECT u.id FROM sys_user u
     JOIN sys_role r ON u.role_id = r.id
     WHERE u.id = ? AND u.status = 1 AND u.deleted_at IS NULL
       AND r.code IN ('sales', 'manager', 'boss', 'super_admin')`,
    [toUserId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '目标用户不是有效的在职业务人员');
  }
}

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
    // 获取公海可分配客户（无负责人即可分配）
    // 【2026-09-10 产品决策】保护期已下线：原条件
    // `AND (protect_until IS NULL OR protect_until < NOW())` 在 protect_until 恒为 NULL
    // 后恒真，属无效条件，故移除（行为不变）。
    const [customers] = await connection.query(
      `SELECT id, owner_id, status, business_status FROM crm_customer
       WHERE deleted_at IS NULL AND owner_id IS NULL
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

      // [P1-03] 自动分配同样把公海客户带出 'sea'（线索保持 lead，不强行转正式）
      const statusFragment = assignmentStatusFragment(customer, targetUser.id);
      // [P1-07] 条件更新防并发：SELECT 与 UPDATE 之间客户可能已被他人认领/分配，
      // 原实现 WHERE id = ? 会把已归属客户直接改走。带 owner_id IS NULL 后，
      // 抢输的一方 0 行，跳过且不写分配日志。
      const [updateResult] = await connection.query(
        `UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL${statusFragment.sql}
         WHERE id = ? AND owner_id IS NULL AND deleted_at IS NULL`,
        [targetUser.id, POOL_STATUS.PRIVATE, ...statusFragment.params, customer.id]
      );
      if (updateResult.affectedRows !== 1) continue;

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
async function manualAssign(pool, customerId, toUserId, operatorId, remark, operatorUser = null) {
  // [H-002] 校验目标用户是否为有效的在职业务人员
  await validateTargetUser(pool, toUserId);

  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name, status, business_status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );

  if (customers.length === 0) {
    return { code: 404, message: '客户不存在', data: null };
  }

  const customer = customers[0];
  const fromUserId = customer.owner_id;

  // [H-002] 归属校验：非 manageAll 的操作者只能分配自己负责的或公海客户
  if (operatorUser && !operatorUser.manageAll) {
    if (customer.owner_id !== null && customer.owner_id !== operatorId) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '无权分配不属于自己的客户');
    }
  }

  // 更新负责人（to_user_id 为 null 表示回收为无负责人）
  // [P1-03] status/business_status 统一由 customerPoolState 判定：
  // 回收 → 公海态；从公海分配给用户 → following；已归属客户转移不改阶段；线索保持 lead。
  const toUserIdValue = toUserId || null;
  const poolStatus = toUserIdValue ? POOL_STATUS.PRIVATE : POOL_STATUS.SEA;

  const statusFragment = assignmentStatusFragment(customer, toUserIdValue);
  let updateSql = `UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL${statusFragment.sql}`;
  const updateParams = [toUserIdValue, poolStatus, ...statusFragment.params];
  // [P1-07] 乐观锁：WHERE 带上读取时的原负责人（NULL 安全比较），
  // 两人同时分配/认领同一客户时后手 0 行，不会静默覆盖先手归属。
  updateSql += ' WHERE id = ? AND owner_id <=> ? AND deleted_at IS NULL';
  updateParams.push(customerId, fromUserId);

  const [updateResult] = await pool.query(updateSql, updateParams);
  if (updateResult.affectedRows !== 1) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '客户归属已被其他人修改，请刷新后重试');
  }

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
async function batchAssign(pool, customerIds, toUserId, operatorId, remark, operatorUser = null) {
  // [H-002] 校验目标用户是否为有效的在职业务人员（事务前校验一次）
  await validateTargetUser(pool, toUserId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customerIds) {
      const [customers] = await connection.query(
        'SELECT id, company_name, owner_id, status, business_status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      // [H-002] 归属校验：非 manageAll 跳过不属于自己的客户（批量场景静默跳过，不中断整批）
      if (operatorUser && !operatorUser.manageAll) {
        if (customer.owner_id !== null && customer.owner_id !== operatorId) continue;
      }

      const poolStatus = toUserId ? POOL_STATUS.PRIVATE : POOL_STATUS.SEA;
      // [P1-03] 与单条分配共用同一状态判定
      const statusFragment = assignmentStatusFragment(customer, toUserId);
      let updateSql = `UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL${statusFragment.sql}`;
      const updateParams = [toUserId, poolStatus, ...statusFragment.params];
      // [P1-07] 与单条分配相同：原负责人作为乐观锁条件，被他人改过的客户跳过
      updateSql += ' WHERE id = ? AND owner_id <=> ? AND deleted_at IS NULL';
      updateParams.push(customerId, customer.owner_id);

      const [updateResult] = await connection.query(updateSql, updateParams);
      if (updateResult.affectedRows !== 1) continue;

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
