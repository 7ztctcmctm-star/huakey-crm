/**
 * 管理员权限中间件
 * 使用 config/roles.js 常量替代硬编码 roleId === 1
 *
 * 支持两种导入方式（向后兼容）：
 *   const requireAdmin = require('../middleware/admin');           // 默认导出
 *   const { requireAdmin, requireManager } = require('...');      // 命名导出
 */
const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES, ROLE_CODES } = ROLES;

const requireAdmin = (req, res, next) => {
  const roleId = req.user?.roleId || req.user?.role_id;
  // [S1 分配权收敛 2026-11-03] 纳入 ROLE_CODES.BOSS：本中间件是「意图仅老板」端点
  // （如客户分配 /assign、角色管理 /role/add 等）的角色门，仅靠 roleId === ROLES.ADMIN(1)
  // 在角色 id 重排时会误拦老板。现库 boss 角色 id=1，行为不变；按 roles.js 的
  // ROLE_CODE 迁移方向，以 roleCode='boss' 识别老板更稳。
  if (req.user && (ADMIN_ROLE_CODES.has(req.user.roleCode) || req.user.roleCode === ROLE_CODES.BOSS || roleId === ROLES.ADMIN)) {
    return next();
  }
  return res.status(403).json({ code: 403, message: '需要管理员权限', data: null });
};

/**
 * 管理层权限中间件（管理员或经理）
 *
 * [2026-09-20 修复] 原实现**没有纳入 `manager` 角色**：判据仅为
 *   `req.user.manageAll || ADMIN_ROLE_CODES.has(roleCode) || roleId === ROLES.ADMIN(1)`
 * 而 `ADMIN_ROLE_CODES` 只含 `super_admin`（config/roles.js 注明为遗留 code、现库已不存在），
 * `ROLES.ADMIN = 1` 即 **boss**。⇒ 与自身名称及 403 文案「需要管理员或经理权限」不符，
 * **把名字里的 manager 排除在外**，造成 35 个「角色已持有功能权限码 + 前端菜单可见」的
 * 端点对部门经理全部 403（`hr` 角色同理被挡在自己的 hr 模块之外）。
 * 现纳入 `roleCode === ROLE_CODES.MANAGER`。
 *
 * ⚠️ 使用约束（重要）：本中间件**只判「是不是管理层」，不判「有没有该功能权限」**。
 *   - 必须与 `checkPermission('<code>')` 成对使用，否则端点会被放宽到所有经理；
 *   - 对「意图仅管理员」的端点，请配一个**仅 boss 持有**的权限码
 *     （如 `system:permission` / `system:currency` / `automation`），而不是依赖本中间件本身。
 */
const requireManager = (req, res, next) => {
  const roleId = req.user?.roleId || req.user?.role_id;
  if (req.user && (
    req.user.manageAll
    || ADMIN_ROLE_CODES.has(req.user.roleCode)
    || req.user.roleCode === ROLE_CODES.MANAGER
    || roleId === ROLES.ADMIN
  )) {
    return next();
  }
  return res.status(403).json({ code: 403, message: '需要管理员或经理权限', data: null });
};

// 默认导出 requireAdmin（保持向后兼容）
module.exports = requireAdmin;
// 命名导出（新代码推荐使用）
module.exports.requireAdmin = requireAdmin;
module.exports.requireManager = requireManager;
