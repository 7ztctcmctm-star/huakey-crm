/**
 * 管理员权限中间件
 * 使用 config/roles.js 常量替代硬编码 roleId === 1
 *
 * 支持两种导入方式（向后兼容）：
 *   const requireAdmin = require('../middleware/admin');           // 默认导出
 *   const { requireAdmin, requireManager } = require('...');      // 命名导出
 */
const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES } = ROLES;

const requireAdmin = (req, res, next) => {
  const roleId = req.user?.roleId || req.user?.role_id;
  if (req.user && (ADMIN_ROLE_CODES.has(req.user.roleCode) || roleId === ROLES.ADMIN)) {
    return next();
  }
  return res.status(403).json({ code: 403, message: '需要管理员权限', data: null });
};

/**
 * 管理层权限中间件（管理员或经理）
 */
const requireManager = (req, res, next) => {
  const roleId = req.user?.roleId || req.user?.role_id;
  if (req.user && (req.user.manageAll || ADMIN_ROLE_CODES.has(req.user.roleCode) || roleId === ROLES.ADMIN)) {
    return next();
  }
  return res.status(403).json({ code: 403, message: '需要管理员或经理权限', data: null });
};

// 默认导出 requireAdmin（保持向后兼容）
module.exports = requireAdmin;
// 命名导出（新代码推荐使用）
module.exports.requireAdmin = requireAdmin;
module.exports.requireManager = requireManager;
