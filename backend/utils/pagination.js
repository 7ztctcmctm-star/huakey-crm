/**
 * 通用分页查询工具
 * 将 SELECT COUNT(*) + SELECT ... LIMIT/OFFSET 模式统一封装
 */

/**
 * 执行分页查询
 * @param {object} pool - 数据库连接池
 * @param {object} options
 * @param {string} options.baseQuery - 列表查询 SQL（不含 ORDER BY / LIMIT / OFFSET）
 * @param {string} options.countQuery - 计数查询 SQL
 * @param {Array} [options.params=[]] - 同时绑定到 countQuery 和 baseQuery 的参数
 * @param {number} [options.page=1] - 当前页码
 * @param {number} [options.pageSize=20] - 每页条数
 * @param {string} [options.orderBy='create_time DESC'] - 排序子句
 * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
 */
async function paginatedQuery(pool, {
  baseQuery,
  countQuery,
  params = [],
  page = 1,
  pageSize = 20,
  orderBy = 'create_time DESC'
}) {
  if (!baseQuery || !countQuery) {
    throw new Error('paginatedQuery requires baseQuery and countQuery');
  }

  const [countResult] = await pool.query(countQuery, params);
  const total = countResult[0].total;

  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const currentPageSize = parseInt(pageSize, 10) || 20;
  const offset = (currentPage - 1) * currentPageSize;

  const listSql = orderBy
    ? `${baseQuery} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    : `${baseQuery} LIMIT ? OFFSET ?`;

  const [list] = await pool.query(listSql, [...params, currentPageSize, offset]);

  return {
    list,
    total,
    page: currentPage,
    pageSize: currentPageSize
  };
}

module.exports = {
  paginatedQuery
};
