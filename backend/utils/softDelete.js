/**
 * @module utils/softDelete
 * @description 软删除工具
 *
 * 提供统一的软删除/恢复/彻底删除/已删除列表查询功能。
 * 安全设计：表名白名单防 SQL 注入，标识符正则校验。
 *
 * 允许的表：crm_customer, crm_opportunity, crm_contract, crm_quote,
 * crm_supplier, crm_purchase_order, crm_service_order, crm_product
 */

const pool = require('../config/database');

/**
 * 表名白名单，防止 SQL 注入
 * @type {string[]}
 */
const ALLOWED_TABLES = [
  'crm_customer',
  'crm_opportunity',
  'crm_contract',
  'crm_quote',
  'crm_supplier',
  'crm_purchase_order',
  'crm_service_order',
  'crm_product'
];

function validateTable(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error('Invalid table');
  }
}

function validateIdentifier(identifier) {
  if (!identifier || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid identifier');
  }
}

/**
 * 软删除记录
 * @param {string} tableName - 表名
 * @param {number} id - 记录ID
 * @returns {boolean} 是否删除成功
 */
async function softDelete(tableName, id) {
  validateTable(tableName);
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
  validateTable(tableName);
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
  validateTable(tableName);
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
  validateTable(tableName);
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
  validateTable(tableName);
  const { page = 1, pageSize = 20, keyword, nameColumn = 'name' } = options;
  validateIdentifier(nameColumn);
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
    `SELECT id, ${nameColumn}, deleted_at FROM ${tableName} ${whereClause} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
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
