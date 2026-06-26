/**
 * 回收站核心服务层
 * 从 routes/recycle.js 提取的业务逻辑
 */

/**
 * 统计每个模块的已删除记录数
 * @param {object} pool - 数据库连接池
 * @param {object} tableConfig - 表配置 { key: { table, label, ... } }
 * @returns {Array<{module: string, label: string, count: number}>}
 */
async function getDeletedStats(pool, tableConfig) {
  const stats = [];
  for (const [key, config] of Object.entries(tableConfig)) {
    const [result] = await pool.query(
      `SELECT COUNT(*) as cnt FROM ${config.table} WHERE deleted_at IS NOT NULL`
    );
    stats.push({ module: key, label: config.label, count: result[0].cnt });
  }
  return stats;
}

module.exports = {
  getDeletedStats
};
