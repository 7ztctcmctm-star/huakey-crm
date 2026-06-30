const pool = require('../config/database');
const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES } = ROLES;
const { getUserPermissions, getDataPermissions } = require('../services/permissionService');

/**
 * 检查功能权限（带缓存）
 * @param {string|string[]} permissionCodes - 权限编码或权限编码数组
 */
const checkPermission = (permissionCodes) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const roleId = req.user.roleId;

      // 确保permissionCodes是数组
      const codes = Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes];

      // 超级管理员直接通过（记录审计日志）
      if (ADMIN_ROLE_CODES.has(req.user.roleCode)) {
        console.log(`[PermissionAudit] ADMIN(userId=${userId}) bypassed permission check for [${codes.join(',')}], ${req.method} ${req.originalUrl}`);
        return next();
      }

      // 使用缓存获取用户权限
      const userPermissions = await getUserPermissions(pool, userId, roleId);
      const hasAny = codes.some(code => userPermissions.includes(code));

      if (!hasAny) {
        return res.status(403).json({
          code: 403,
          message: '没有操作权限',
          data: null
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        code: 500,
        message: '权限校验异常',
        data: null
      });
    }
  };
};

/**
 * 检查数据权限（带缓存）
 * @param {string} module - 模块名称
 * @param {string} ownerColumn - 负责人列名
 */
const checkDataPermission = (module, ownerColumn = 'owner_id') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const roleId = req.user.roleId;

      // 超级管理员直接通过
      if (ADMIN_ROLE_CODES.has(req.user.roleCode) || req.user.manageAll) {
        req.dataPermission = { type: 'all', ownerColumn };
        return next();
      }

      // 使用缓存获取数据权限配置
      const configs = await getDataPermissions(pool, roleId);
      const config = configs.find(c => c.module === module);

      if (!config) {
        // 默认只能看自己的数据
        req.dataPermission = { type: 'self', userId, ownerColumn };
      } else {
        req.dataPermission = {
          type: config.data_scope,
          userId,
          ownerColumn,
          customDeptIds: config.custom_dept_ids
        };
      }

      next();
    } catch (error) {
      console.error('Data permission check error:', error);
      return res.status(500).json({
        code: 500,
        message: '数据权限校验异常',
        data: null
      });
    }
  };
};

/**
 * 根据数据权限构建WHERE条件（异步版，支持多级子部门）
 * [安全修复] 返回 { clause, params } 使用参数化查询，防止SQL注入
 * @param {object} dataPermission - 数据权限对象
 * @param {string} tableAlias - 表别名
 * @returns {Promise<{clause: string, params: array}>}
 */
const buildDataPermissionWhere = async (dataPermission, tableAlias = 't') => {
  if (!dataPermission) return { clause: '1=1', params: [] };

  const { type, userId, ownerColumn, customDeptIds } = dataPermission;
  const column = `${tableAlias}.${ownerColumn}`;

  switch (type) {
    case 'all':
      return { clause: '1=1', params: [] };

    case 'dept':
      return {
        clause: `(${column} IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?)) OR ${column} IS NULL)`,
        params: [userId]
      };

    case 'dept_and_sub': {
      const [deptRows] = await pool.query(
        'SELECT dept_id FROM sys_user WHERE id = ?', [userId]
      );
      const userDeptId = deptRows[0]?.dept_id;
      if (!userDeptId) return { clause: `${column} = ?`, params: [userId] };

      const allDeptIds = await getSubDeptIds(userDeptId);
      const placeholders = allDeptIds.map(() => '?').join(',');
      return {
        clause: `${column} IN (SELECT id FROM sys_user WHERE dept_id IN (${placeholders}))`,
        params: allDeptIds
      };
    }

    case 'self':
      return { clause: `${column} = ?`, params: [userId] };

    case 'custom':
      if (customDeptIds) {
        const deptIds = String(customDeptIds).split(',').map(Number).filter(n => !isNaN(n));
        if (deptIds.length > 0) {
          const placeholders = deptIds.map(() => '?').join(',');
          return {
            clause: `(${column} IN (SELECT id FROM sys_user WHERE dept_id IN (${placeholders})) OR ${column} IS NULL)`,
            params: deptIds
          };
        }
      }
      return { clause: `(${column} = ? OR ${column} IS NULL)`, params: [userId] };

    default:
      return { clause: `${column} = ?`, params: [userId] };
  }
};

/**
 * 递归获取所有子部门ID
 */
async function getSubDeptIds(parentId) {
  const ids = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const [children] = await pool.query(
      'SELECT id FROM sys_dept WHERE parent_id = ?', [queue.shift()]
    );
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

module.exports = {
  checkPermission,
  checkDataPermission,
  buildDataPermissionWhere
};
