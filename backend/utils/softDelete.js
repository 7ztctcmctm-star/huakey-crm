const pool = require('../config/database');

/**
 * 软删除记录
 * @param {string} tableName - 表名
 * @param {number} id - 记录ID
 * @returns {boolean} 是否删除成功
 */
async function softDelete(tableName, id) {
  const [result] = await pool.query(
    `UPDATE ${tableName} SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * 批量软删除
 * @param {string} tableName - 表名
 * @param {number[]} ids - 记录ID数组
 * @returns {number} 影响行数
 */
async function softDeleteBatch(tableName, ids) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.query(
    `UPDATE ${tableName} SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ids
  );
  return result.affectedRows;
}

/**
 * 恢复软删除
 * @param {string} tableName - 表名
 * @param {number} id - 记录ID
 * @returns {boolean} 是否恢复成功
 */
async function restore(tableName, id) {
  const [result] = await pool.query(
    `UPDATE ${tableName} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * 彻底删除
 * @param {string} tableName - 表名
 * @param {number} id - 记录ID
 * @returns {boolean} 是否删除成功
 */
async function permanentDelete(tableName, id) {
  const [result] = await pool.query(
    `DELETE FROM ${tableName} WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * 获取已删除的记录列表
 * @param {string} tableName - 表名
 * @param {object} options - 查询选项 { page, pageSize, keyword, nameColumn }
 * @returns {object} { list, total }
 */
async function getDeletedList(tableName, options = {}) {
  const { page = 1, pageSize = 20, keyword, nameColumn = 'name' } = options;
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE deleted_at IS NOT NULL';
  const params = [];

  if (keyword) {
    whereClause += ` AND ${nameColumn} LIKE ?`;
    params.push(`%${keyword}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT * FROM ${tableName} ${whereClause} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return { list: rows, total: countResult[0].total };
}

module.exports = {
  softDelete,
  softDeleteBatch,
  restore,
  permanentDelete,
  getDeletedList
};
