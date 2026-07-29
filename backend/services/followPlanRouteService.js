// @deprecated 跟进计划服务（仅保留兼容，逻辑已合并至 followUpService.js）
// Prompt 4-2 将 crm_follow_plan 合并进 crm_follow_up（is_plan=1），
// 新代码请使用 followUpService 的 addPlan/listPlans/completePlan/cancelPlan。
// 本文件对应的 /follow-plan/* 路由已返回 410 Gone。
// 从 routes/followPlan.js 提取的业务逻辑

/**
 * 创建跟进计划
 */
async function addPlan(pool, { customer_id, contact_id, plan_time, plan_content, follow_type }, userId) {
  const [customers] = await pool.query(
    'SELECT id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customer_id]
  );
  if (customers.length === 0) {
    return { error: '客户不存在', status: 404 };
  }

  const [result] = await pool.query(
    `INSERT INTO crm_follow_plan (customer_id, contact_id, plan_time, plan_content, follow_type, create_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customer_id, contact_id || null, plan_time, plan_content, follow_type || '电话', userId]
  );

  return { id: result.insertId };
}

/**
 * 跟进计划列表
 */
async function listPlans(pool, { page = 1, pageSize = 10, customer_id, status, start_date, end_date }, dataPermission, buildDataPermissionWhere) {
  const offset = (page - 1) * pageSize;
  const params = [];

  // 数据权限：使用中间件提供的权限条件
  const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'fp');
  params.push(...permParams);
  let whereClause = `WHERE ${permissionClause} AND fp.deleted_at IS NULL`;

  if (customer_id) {
    whereClause += ' AND fp.customer_id = ?';
    params.push(customer_id);
  }
  if (status) {
    whereClause += ' AND fp.status = ?';
    params.push(status);
  }
  if (start_date) {
    whereClause += ' AND fp.plan_time >= ?';
    params.push(start_date);
  }
  if (end_date) {
    whereClause += ' AND fp.plan_time < ?';
    params.push(end_date + ' 23:59:59');
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_follow_plan fp ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT fp.id, fp.customer_id, fp.contact_id, fp.plan_time, fp.plan_content,
      fp.follow_type, fp.status, fp.create_by, fp.create_time,
      c.company_name,
      co.name as contact_name,
      u.real_name as creator_name
    FROM crm_follow_plan fp
    LEFT JOIN crm_customer c ON fp.customer_id = c.id
    LEFT JOIN crm_contact co ON fp.contact_id = co.id AND co.deleted_at IS NULL
    LEFT JOIN sys_user u ON fp.create_by = u.id
    ${whereClause}
    ORDER BY fp.plan_time ASC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 完成跟进计划（事务：更新状态 + 创建跟进记录 + 更新客户最后跟进时间）
 */
async function completePlan(pool, { id, content, follow_type }, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [plans] = await conn.query(
      'SELECT id, customer_id, contact_id, plan_content, follow_type as plan_follow_type, status, create_by FROM crm_follow_plan WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (plans.length === 0) {
      await conn.rollback();
      return { error: '跟进计划不存在', status: 404 };
    }

    const plan = plans[0];
    if (plan.status === 'completed') {
      await conn.rollback();
      return { error: '该计划已完成', status: 400 };
    }

    // 更新计划状态为已完成
    await conn.query(
      'UPDATE crm_follow_plan SET status = ? WHERE id = ?',
      ['completed', id]
    );

    // 自动创建跟进记录
    await conn.query(
      `INSERT INTO crm_follow_up (customer_id, contact_id, follow_type, content, create_by)
       VALUES (?, ?, ?, ?, ?)`,
      [plan.customer_id, plan.contact_id, follow_type || plan.plan_follow_type, content, userId]
    );

    // 更新客户最后跟进时间
    await conn.query(
      'UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?',
      [plan.customer_id]
    );

    await conn.commit();
    return { success: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 取消跟进计划（软删除，仅创建人或管理员）
 */
async function cancelPlan(pool, { id, roleId, userId, manageAll }, ROLES) {
  const [plans] = await pool.query(
    'SELECT id, create_by, status FROM crm_follow_plan WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (plans.length === 0) {
    return { error: '跟进计划不存在', status: 404 };
  }

  const plan = plans[0];
  if (plan.status === 'completed') {
    return { error: '已完成的计划不能取消', status: 400 };
  }

  // 权限检查：创建人或管理员可取消
  if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && plan.create_by !== userId) {
    return { error: '无权取消该计划', status: 403 };
  }

  await pool.query(
    'UPDATE crm_follow_plan SET deleted_at = NOW() WHERE id = ?',
    [id]
  );

  return { success: true };
}

module.exports = { addPlan, listPlans, completePlan, cancelPlan };
