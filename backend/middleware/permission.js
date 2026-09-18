const pool = require('../config/database');
const logger = require('../config/logger');
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

      // 超级管理员 / manageAll 角色直接通过（记录审计日志）
      if (ADMIN_ROLE_CODES.has(req.user.roleCode) || req.user.manageAll) {
        logger.info(`[PermissionAudit] ADMIN(userId=${userId}) bypassed permission check for [${codes.join(',')}], ${req.method} ${req.originalUrl}`);
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
      logger.error('Permission check error:', { error: error.message, traceId: req.traceId });
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
        req.dataPermission = { type: 'all', ownerColumn, module };
        return next();
      }

      // 使用缓存获取数据权限配置
      const configs = await getDataPermissions(pool, roleId);
      const config = configs.find(c => c.module === module);

      if (!config) {
        // 默认只能看自己的数据
        req.dataPermission = { type: 'self', userId, ownerColumn, module };
      } else {
        req.dataPermission = {
          type: config.data_scope,
          userId,
          ownerColumn,
          module,
          customDeptIds: config.custom_dept_ids
        };
      }

      next();
    } catch (error) {
      logger.error('Data permission check error:', { error: error.message, traceId: req.traceId });
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
      // 公海兜底（owner 为空且 status 为 lead/sea）仅适用于 customer 模块；
      // 其他模块（opportunity/quote/contract/report/approval 等）没有该语义，
      // 且部分表没有 status 列（如 crm_opportunity），硬拼会导致 Unknown column 500
      if (dataPermission.module === 'customer') {
        return { clause: `(${column} = ? OR (${column} IS NULL AND ${tableAlias}.status IN ('lead', 'sea')))`, params: [userId] };
      }
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
 * @param {number} parentId
 * @param {object} [poolOverride] 可选：显式传入连接/事务（便于受控入口在单测中注入，生产默认用模块级 pool）
 */
async function getSubDeptIds(parentId, poolOverride) {
  const db = poolOverride || pool;
  const ids = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const [children] = await db.query(
      'SELECT id FROM sys_dept WHERE parent_id = ?', [queue.shift()]
    );
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

/**
 * 「按指定成员筛选」的**服务端强制授权**（首页/报表的「团队筛选」用）
 *
 * 安全要点：前端下拉框不是权限边界。本函数在服务端判定当前用户能否按 ownerId 过滤：
 *   · 无 ownerId                → null（不追加过滤）
 *   · data_scope = 'all'        → 允许（老板/超管）
 *   · data_scope = 'dept'       → 仅当目标成员与当前用户**同部门**才允许
 *   · data_scope = 'dept_and_sub' → 目标成员在本部门或**其子部门**才允许（manager 角色的现有配置）
 *   · data_scope = 'custom'     → 目标成员在 custom_dept_ids 指定的部门集内才允许
 *   · 其它（self/无配置）        → **忽略**（返回 null），防止 sales 借此看到他人数据
 *
 * ⚠️ 返回值必须与「数据范围子句」是 AND 关系（即在范围之内再收窄），不能替换范围。
 *
 * @param {object} pool
 * @param {object} dataPermission - checkDataPermission 注入
 * @param {number|string} ownerId - 前端传入的成员 ID
 * @param {string} ownerColumn - 归属列名
 * @param {string} alias - SQL 表别名
 * @returns {Promise<{clause: string, params: Array}|null>}
 */
async function buildOwnerOverrideFilter(pool, dataPermission, ownerId, ownerColumn = 'owner_id', alias = 'c') {
  const target = Number(ownerId);
  if (!ownerId || !Number.isInteger(target) || target <= 0) return null;
  if (!dataPermission) return null;

  const column = `${alias}.${ownerColumn}`;
  const type = dataPermission.type;

  if (type === 'all') {
    return { clause: `${column} = ?`, params: [target] };
  }

  if (type === 'dept' || type === 'dept_and_sub' || type === 'custom') {
    // 目标成员是否落在当前用户的数据范围内：
    //   dept         → 本部门
    //   dept_and_sub → 本部门 + 所有子部门（manager 角色的现有配置）
    //   custom       → sys_data_permission.custom_dept_ids 指定的部门集
    const [targetRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [target]);
    const targetDept = targetRows[0]?.dept_id ?? null;
    if (targetDept == null) return null;   // 查不到人 / 无部门 → 不放行

    let allowedDepts;
    if (type === 'custom') {
      allowedDepts = String(dataPermission.customDeptIds || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    } else {
      const [selfRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [dataPermission.userId]);
      const selfDept = selfRows[0]?.dept_id ?? null;
      if (selfDept == null) return null;
      allowedDepts = type === 'dept' ? [selfDept] : await getSubDeptIds(selfDept, pool);
    }

    return allowedDepts.includes(targetDept)
      ? { clause: `${column} = ?`, params: [target] }
      : null;   // 超范围：静默忽略（不报错，也不放行）
  }

  // self / 缺省：不具备看他人数据的能力 → 忽略筛选条件
  return null;
}

/**
 * 字段级权限中间件
 * 根据敏感字段注册表，为非管理员用户设置 restrictedFields
 * @param {string} module - 模块名称
 */
const checkFieldPermission = (module) => {
  const FIELD_PERMISSIONS = require('../config/fieldPermissions');
  const sensitiveFields = FIELD_PERMISSIONS[module] || [];

  return (req, res, next) => {
    // 延迟计算：该中间件可能在 authenticateToken 之前挂载，
    // 使用 getter 确保在 handler 中读取 req.restrictedFields 时 req.user 已可用
    Object.defineProperty(req, 'restrictedFields', {
      get() {
        const isAdmin = req.user && (
          req.user.manageAll
          || (req.user.roleCode && ADMIN_ROLE_CODES.has(req.user.roleCode))
          || req.user.roleId === ROLES.ADMIN
        );
        return isAdmin ? [] : sensitiveFields;
      },
      configurable: true
    });
    next();
  };
};

/**
 * 过滤敏感字段
 * @param {object|array} data - 待过滤数据
 * @param {string[]} restrictedFields - 需要移除的字段列表
 * @returns {object|array} 过滤后的数据
 */
const stripRestrictedFields = (data, restrictedFields) => {
  if (!restrictedFields || restrictedFields.length === 0) return data;
  if (Array.isArray(data)) {
    data.forEach(item => restrictedFields.forEach(field => delete item[field]));
  } else if (data && typeof data === 'object') {
    restrictedFields.forEach(field => delete data[field]);
  }
  return data;
};

module.exports = {
  checkPermission,
  checkDataPermission,
  buildDataPermissionWhere,
  buildOwnerOverrideFilter,
  getSubDeptIds,
  checkFieldPermission,
  stripRestrictedFields
};
