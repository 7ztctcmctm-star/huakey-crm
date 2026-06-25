/**
 * 日志路由服务层
 * 职责：处理系统日志相关的业务逻辑
 */

const XLSX = require('xlsx');

/**
 * 操作类型映射
 */
const ACTION_TYPE_MAP = {
  'delete': ['删除'],
  'edit': ['编辑', '修改'],
  'add': ['新增', '创建', '添加'],
  'export': ['导出'],
  'import': ['导入']
};

/**
 * 查询日志列表
 * @param {object} pool - 数据库连接池
 * @param {object} params - 查询参数
 * @returns {object} { list, total, page, pageSize }
 */
async function listLogs(pool, params) {
  const { page = 1, pageSize = 20, module, action, status, startDate, endDate, actionType, userId } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  let whereClause = '1=1';
  const queryParams = [];

  if (module) {
    whereClause += ' AND l.module = ?';
    queryParams.push(module);
  }

  if (action) {
    whereClause += ' AND l.action LIKE ?';
    queryParams.push(`%${action}%`);
  }

  if (actionType) {
    const types = Array.isArray(actionType) ? actionType : [actionType];
    const allKeywords = [];
    types.forEach(t => {
      if (ACTION_TYPE_MAP[t]) allKeywords.push(...ACTION_TYPE_MAP[t]);
    });
    if (allKeywords.length > 0) {
      const likeClauses = allKeywords.map(() => 'l.action LIKE ?').join(' OR ');
      whereClause += ` AND (${likeClauses})`;
      allKeywords.forEach(k => queryParams.push(`%${k}%`));
    }
  }

  if (status !== undefined && status !== '') {
    whereClause += ' AND l.status = ?';
    queryParams.push(status);
  }

  if (userId) {
    whereClause += ' AND l.user_id = ?';
    queryParams.push(userId);
  }

  if (startDate) {
    whereClause += ' AND l.create_time >= ?';
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND l.create_time <= ?';
    queryParams.push(endDate + ' 23:59:59');
  }

  const countSql = `SELECT COUNT(*) as total FROM sys_log l WHERE ${whereClause}`;
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0].total;

  const sql = `
    SELECT l.*, u.real_name as user_name
    FROM sys_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    WHERE ${whereClause}
    ORDER BY l.create_time DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(sql, [...queryParams, safePageSize, parseInt(offset)]);

  return {
    list: rows,
    total,
    page: parseInt(page) || 1,
    pageSize: safePageSize
  };
}

/**
 * 查询日志详情
 * @param {object} pool - 数据库连接池
 * @param {number} id - 日志ID
 * @returns {object|null} 日志详情或null
 */
async function getLogDetail(pool, id) {
  const [rows] = await pool.query(`
    SELECT l.*, u.real_name as user_name
    FROM sys_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    WHERE l.id = ?
  `, [id]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * 获取所有模块列表
 * @param {object} pool - 数据库连接池
 * @returns {string[]} 模块名数组
 */
async function getModules(pool) {
  const [rows] = await pool.query('SELECT DISTINCT module FROM sys_log ORDER BY module');
  return rows.map(r => r.module);
}

/**
 * 删除日志
 * @param {object} pool - 数据库连接池
 * @param {number[]} ids - 日志ID数组
 * @returns {number} 删除的记录数
 */
async function deleteLogs(pool, ids) {
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.query(`DELETE FROM sys_log WHERE id IN (${placeholders})`, ids);
  return result.affectedRows;
}

/**
 * 清理过期日志
 * @param {object} pool - 数据库连接池
 * @param {number} days - 保留天数
 * @returns {number} 清理的记录数
 */
async function clearLogs(pool, days) {
  const retentionDays = days || 30;
  const [result] = await pool.query(
    "DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL ? DAY",
    [retentionDays]
  );
  return result.affectedRows;
}

/**
 * 导出日志
 * @param {object} pool - 数据库连接池
 * @param {object} params - 查询参数
 * @returns {Buffer} Excel文件Buffer
 */
async function exportLogs(pool, params) {
  const { module, action, status, startDate, endDate } = params;

  let whereClause = '1=1';
  const queryParams = [];

  if (module) { whereClause += ' AND l.module = ?'; queryParams.push(module); }
  if (action) { whereClause += ' AND l.action LIKE ?'; queryParams.push(`%${action}%`); }
  if (status !== undefined && status !== '') { whereClause += ' AND l.status = ?'; queryParams.push(status); }
  if (startDate) { whereClause += ' AND l.create_time >= ?'; queryParams.push(startDate); }
  if (endDate) { whereClause += ' AND l.create_time <= ?'; queryParams.push(endDate + ' 23:59:59'); }

  const [rows] = await pool.query(
    `SELECT l.id, l.module, l.action, l.method, l.url, l.user_name, l.ip_address, l.status, l.create_time, l.error_msg
     FROM sys_log l WHERE ${whereClause} ORDER BY l.create_time DESC LIMIT 10000`,
    queryParams
  );

  const exportData = rows.map(row => ({
    'ID': row.id,
    '模块': row.module,
    '操作': row.action,
    '方法': row.method,
    'URL': row.url,
    '用户': row.user_name || '',
    'IP地址': row.ip_address,
    '状态': row.status === 1 ? '成功' : '失败',
    '操作时间': row.create_time,
    '错误信息': row.error_msg || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, '操作日志');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return buf;
}

module.exports = {
  listLogs,
  getLogDetail,
  getModules,
  deleteLogs,
  clearLogs,
  exportLogs
};
