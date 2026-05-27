const pool = require('../config/database');

/**
 * 获取数据权限范围
 * @param {object} user - req.user (含 userId, roleId, manageAll)
 * @returns {object} { type: 'all' | 'dept' | 'self', userIds?, userId? }
 */
const getDataPermission = async (user) => {
  if (user.roleId === 1 || user.roleId === 2 || user.manageAll) {
    return { type: 'all' };
  }
  if (user.roleId === 3) {
    const [users] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ?',
      [user.userId]
    );
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [deptUserIds] = await pool.query(
        'SELECT id FROM sys_user WHERE dept_id = ?',
        [deptId]
      );
      const userIds = deptUserIds.map(u => u.id);
      return { type: 'dept', userIds: userIds.length > 0 ? userIds : [user.userId] };
    }
    return { type: 'self', userId: user.userId };
  }
  return { type: 'self', userId: user.userId };
};

/**
 * 构建权限SQL片段
 * [安全修复] 返回 { clause, params } 使用参数化查询，防止SQL注入
 * @param {object} permission - getDataPermission 返回值
 * @param {string} tableAlias - 表别名
 * @param {string} ownerColumn - 负责人列名 (owner_id 或 create_by)
 * @returns {{clause: string, params: array}}
 */
const buildPermissionClause = (permission, tableAlias = 't', ownerColumn = 'owner_id') => {
  const column = `${tableAlias}.${ownerColumn}`;
  if (permission.type === 'all') return { clause: '1=1', params: [] };
  if (permission.type === 'dept') {
    const placeholders = permission.userIds.map(() => '?').join(',');
    return { clause: `${column} IN (${placeholders})`, params: [...permission.userIds] };
  }
  return { clause: `${column} = ?`, params: [permission.userId] };
};

module.exports = { getDataPermission, buildPermissionClause };
