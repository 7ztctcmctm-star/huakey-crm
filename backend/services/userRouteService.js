/**
 * 用户管理服务层
 * 从 routes/user.js 提取的业务逻辑
 */
const bcrypt = require('bcryptjs');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const { ADMIN_ROLE_CODES, getRoleRank } = require('../config/roles');
const { clearPermissionCache } = require('./permissionService');
const sseManager = require('../utils/sseManager');
const logger = require('../config/logger');
// [R-06 边界收敛 2026-09-17] 本模块属非 Customer 域，写客户表须经客户域受控入口
const customerService = require('./customerService');

/**
 * [P0-03 2026-10-23] 用户管理纵向越权防护
 *
 * 背景：routes/user.js 只校验 system:user:* 功能权限。HR 持有这些权限，
 * 原实现允许 HR 创建 role_id=1(boss) 的账号、重置 boss 密码、把任意账号
 * 改成 super_admin —— 等同于直接提权。
 *
 * 规则（后端强制，前端菜单隐藏不参与授权）：
 *   · 调用者必须已登录且角色层级已登记；
 *   · 非 super_admin 只能管理「角色层级 ≤ 自身」的用户；
 *   · 非 super_admin 只能授予「角色层级 ≤ 自身」的角色；
 *   · 未登记角色 rank=0，除 super_admin 外不可管理/授予（防自定义高权限角色绕过）；
 *   · 无角色（role_id=NULL）用户无任何权限，可被正常管理。
 */
function isSuperAdmin(actor) {
  return Boolean(actor && ADMIN_ROLE_CODES.has(actor.roleCode));
}

function assertActor(actor) {
  if (!actor || !actor.userId || !actor.roleCode) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '登录状态无效，无法执行用户管理操作');
  }
  if (!isSuperAdmin(actor) && getRoleRank(actor.roleCode) <= 0) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '当前角色无权执行用户管理操作');
  }
}

function assertCanManageUser(actor, targetRoleCode) {
  assertActor(actor);
  if (isSuperAdmin(actor)) return;
  // 无角色账号没有任何权限，管理它不会造成提权
  if (targetRoleCode === null || targetRoleCode === undefined) return;

  const actorRank = getRoleRank(actor.roleCode);
  const targetRank = getRoleRank(targetRoleCode);
  if (targetRank <= 0 || targetRank > actorRank) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '无权管理该用户：目标账号的角色权限高于当前账号'
    );
  }
}

async function loadActiveRole(pool, roleId) {
  const [rows] = await pool.query(
    'SELECT id, code, name, status, deleted_at FROM sys_role WHERE id = ?',
    [roleId]
  );
  const role = rows[0];
  if (!role || role.deleted_at || role.status !== 1) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '角色不存在或已停用');
  }
  return role;
}

async function assertAssignableRole(pool, roleId, actor) {
  assertActor(actor);
  if (roleId === null || roleId === undefined) return null;

  const role = await loadActiveRole(pool, roleId);
  if (isSuperAdmin(actor)) return role;

  const actorRank = getRoleRank(actor.roleCode);
  const targetRank = getRoleRank(role.code);
  if (targetRank <= 0 || targetRank > actorRank) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '无权授予该角色：目标角色权限高于当前账号'
    );
  }
  return role;
}

/**
 * 获取用户列表
 */
async function listUsers(pool, { page = 1, pageSize = 10, username, realName }) {
  const offset = (page - 1) * pageSize;
  const params = [];
  let whereClause = 'WHERE u.deleted_at IS NULL';

  if (username) {
    whereClause += ' AND u.username LIKE ?';
    params.push(`%${username}%`);
  }

  if (realName) {
    whereClause += ' AND u.real_name LIKE ?';
    params.push(`%${realName}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM sys_user u ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [users] = await pool.query(
    `SELECT
      u.id, u.username, u.real_name, u.phone, u.email,
      u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
      d.name as dept_name, r.name as role_name
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    ${whereClause}
    ORDER BY u.create_time DESC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return {
    list: users,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  };
}

/**
 * 添加用户
 */
async function addUser(pool, { username, password, real_name, phone, email, dept_id, role_id }, actor) {
  await assertAssignableRole(pool, role_id, actor);

  const [existingUsers] = await pool.query(
    'SELECT id FROM sys_user WHERE username = ? AND deleted_at IS NULL',
    [username]
  );

  if (existingUsers.length > 0) {
    throw new AppError(ErrorCodes.DUPLICATE_USERNAME, '用户名已存在');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // [v1.0.1 安全补丁] 强制新建用户首次登录改密
  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
  );

  return { id: result.insertId };
}

/**
 * 重置用户密码（管理员操作）
 * 重置后必须强制改密，且清除该用户 /auth/me 缓存
 * @param {object} pool
 * @param {number} id - 目标用户 id
 * @param {string} newPassword - 新密码（已通过 Joi 校验）
 * @returns {{ id: number, username: string }}
 */
async function resetPassword(pool, id, newPassword, actor) {
  assertActor(actor);

  const [users] = await pool.query(
    `SELECT u.id, u.username, u.role_id, r.code AS role_code
       FROM sys_user u
       LEFT JOIN sys_role r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在或已删除');
  }

  assertCanManageUser(actor, users[0].role_code);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE sys_user
     SET password = ?,
         must_change_password = 1,
         password_changed_at = NOW()
     WHERE id = ?`,
    [hashedPassword, id]
  );

  return { id: users[0].id, username: users[0].username };
}

/**
 * 修改用户
 */
async function updateUser(pool, { id, real_name, phone, email, dept_id, role_id, status }, actor) {
  assertActor(actor);

  const [users] = await pool.query(
    `SELECT u.id, u.username, u.role_id, r.code AS role_code
       FROM sys_user u
       LEFT JOIN sys_role r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );

  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  assertCanManageUser(actor, users[0].role_code);

  // 防止管理员通过「修改自己」把账号提权/停用；改密走 /auth/change-password
  if (Number(id) === Number(actor.userId) && (role_id !== undefined || status !== undefined)) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不能修改自己的角色或账号状态');
  }

  // 目标角色必须存在、启用，且不得高于调用者层级
  if (role_id !== undefined && role_id !== null) {
    await assertAssignableRole(pool, role_id, actor);
  }

  const updates = [];
  const params = [];

  if (real_name !== undefined) { updates.push('real_name = ?'); params.push(real_name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (dept_id !== undefined) { updates.push('dept_id = ?'); params.push(dept_id); }
  if (role_id !== undefined) { updates.push('role_id = ?'); params.push(role_id); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (updates.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '没有要更新的字段');
  }

  params.push(id);

  await pool.query(
    `UPDATE sys_user SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (role_id !== undefined || dept_id !== undefined) {
    await clearPermissionCache(id);
    // [C2 2026-10-21] 角色/部门变更实时推送给该用户的全部在线端：
    // /auth/me 下发的 permissions 与 dataPermissions 随角色走，前端模块级缓存
    // （useUser）不主动失效会出现「按钮还在、点了 403」的陈旧状态。
    // 前端 utils/sse.js 收到 permission-changed 后强制刷新权限缓存。
    // 推送失败不影响主流程（best-effort，用户下次登录/刷新仍会拿到新权限）。
    try {
      sseManager.send(id, { type: 'permission-changed', action: 'refresh' });
    } catch (e) {
      logger.warn(`[userRouteService] SSE 权限变更推送失败 userId=${id}:`, e.message);
    }
  }
}

/**
 * 删除用户（逻辑删除 + 级联处理）
 *
 * 级联规则：
 *   1. 用户账号 → 软删除（status=0, deleted_at=NOW()）
 *   2. 员工档案 → 自动设为离职（leave_date=NOW()）
 *   3. 名下客户 → 释放到公海池（pool_status='sea', owner_id=NULL, protect_until=NULL）
 *   4. 名下商机 → 优先转移给直属上级 manager_id；无可用上级时 owner_id=NULL（待分配）
 *   5. 跟进记录 → 保留不动（归属客户，不归属用户）
 */
async function deleteUser(pool, { id }, actor) {
  assertActor(actor);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户存在并读取直属上级 / 角色（用于纵向越权校验）
    const [users] = await connection.query(
      `SELECT u.id, u.username, u.manager_id, u.role_id, r.code AS role_code
         FROM sys_user u
         LEFT JOIN sys_role r ON r.id = u.role_id
        WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id]
    );
    if (users.length === 0) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在或已删除');
    }
    if (Number(id) === Number(actor.userId)) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不能删除当前登录用户');
    }
    assertCanManageUser(actor, users[0].role_code);

    // 校验直属上级是否可用
    let managerId = users[0].manager_id;
    if (managerId) {
      const [managers] = await connection.query(
        'SELECT id FROM sys_user WHERE id = ? AND deleted_at IS NULL AND status = 1',
        [managerId]
      );
      if (managers.length === 0) {
        managerId = null;
      }
    }

    // 1. 软删除用户账号
    await connection.query(
      'UPDATE sys_user SET status = 0, deleted_at = NOW() WHERE id = ?',
      [id]
    );

    // 2. 员工档案 → 设为离职
    await connection.query(
      'UPDATE crm_employee_profile SET leave_date = CURDATE(), update_time = NOW() WHERE user_id = ? AND leave_date IS NULL',
      [id]
    );

    // 3. 名下客户 → 释放到公海池
    // [R-06 边界收敛 2026-09-17] 经客户域受控入口；SQL 逐字保留（含 pool_type='public'）
    const customerResult = await customerService.systemReleaseOwnedCustomersOnLeave(connection, id);

    // 4. 名下商机 → 优先转移给直属上级，无上级或上级不可用时再释放为待分配
    const [oppResult] = await connection.query(
      `UPDATE crm_opportunity
       SET owner_id = ?, update_time = NOW()
       WHERE owner_id = ? AND deleted_at IS NULL`,
      [managerId, id]
    );

    await connection.commit();

    return {
      username: users[0].username,
      customersReleased: customerResult.affectedRows || 0,
      opportunitiesReleased: oppResult.affectedRows || 0
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取用户详情
 */
async function getUserDetail(pool, id) {
  const [users] = await pool.query(
    `SELECT
      u.id, u.username, u.real_name, u.phone, u.email,
      u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
      d.name as dept_name, r.name as role_name
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );

  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  return users[0];
}

module.exports = {
  listUsers,
  addUser,
  updateUser,
  deleteUser,
  getUserDetail,
  resetPassword
};
