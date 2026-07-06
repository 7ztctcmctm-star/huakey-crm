/**
 * 数据库查询辅助工具
 * 提供统一分页、列表查询模板，减少各 service 重复代码
 */

/**
 * 通用分页查询
 * @param {object} pool - mysql2 连接池
 * @param {object} options
 * @param {string} options.baseTable - 主表名（FROM 子句）
 * @param {string} options.selectFields - SELECT 字段列表，如 'id, name, create_time'
 * @param {string} [options.whereClause=''] - WHERE 子句（不含 WHERE 关键字）
 * @param {Array} [options.params=[]] - 参数数组
 * @param {number} [options.page=1] - 当前页
 * @param {number} [options.pageSize=20] - 每页条数
 * @param {string} [options.orderBy='id DESC'] - ORDER BY 子句（不含 ORDER BY 关键字）
 * @returns {Promise<{ total: number, list: Array, page: number, pageSize: number }>}
 */
async function paginatedQuery(pool, {
  baseTable,
  selectFields,
  whereClause = '',
  params = [],
  page = 1,
  pageSize = 20,
  orderBy = 'id DESC'
}) {
  if (!baseTable || !selectFields) {
    throw new Error('paginatedQuery 必须提供 baseTable 和 selectFields');
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (safePage - 1) * safePageSize;

  const wherePart = whereClause ? `WHERE ${whereClause}` : '';
  const countSql = `SELECT COUNT(*) as total FROM ${baseTable} ${wherePart}`;
  const listSql = `SELECT ${selectFields} FROM ${baseTable} ${wherePart} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

  const [[{ total }]] = await pool.query(countSql, params);
  const [rows] = await pool.query(listSql, [...params, safePageSize, offset]);

  return {
    total: parseInt(total, 10),
    list: rows,
    page: safePage,
    pageSize: safePageSize
  };
}

module.exports = { paginatedQuery };
