/**
 * 数据质量服务层（数据管理域）
 *
 * 从 services/qualityService.js 迁移而来（Prompt 4-5 质量检查剥离）。
 * 数据质量检查（重复/缺失/无效字段统计 + 质量评分）属于数据管理职责，
 * 不再挂靠客户/评分模块，统一归入 dataManagement 域，对外暴露
 * /api/v1/data-quality/* 路由。
 *
 * 职责：处理数据质量检查相关的业务逻辑
 */

/**
 * 白名单表配置
 */
const ALLOWED_TABLES = {
  crm_customer: { nameColumn: 'company_name', emailColumn: 'email' },
  crm_supplier: { nameColumn: 'name', emailColumn: 'contact_email' }
};

/**
 * 获取质量报告
 * @param {object} pool - 数据库连接池
 * @param {string} table - 表名
 * @returns {object|null} 质量报告或null
 */
async function getQualityReport(pool, table = 'crm_customer') {
  const [reports] = await pool.query(
    `SELECT * FROM sys_data_quality_report
     WHERE table_name = ?
     ORDER BY check_time DESC LIMIT 1`,
    [table]
  );

  return reports[0] || null;
}

/**
 * 运行质量检查
 * @param {object} pool - 数据库连接池
 * @param {string} table - 表名
 * @returns {object} 检查结果
 */
async function runQualityCheck(pool, table = 'crm_customer') {
  // 白名单表名，防止 SQL 注入
  if (!ALLOWED_TABLES[table]) {
    throw new Error('不支持的表');
  }

  const { nameColumn, emailColumn } = ALLOWED_TABLES[table];

  // 总记录数（排除已删除）
  const [totalResult] = await pool.query(
    `SELECT COUNT(*) as total FROM ${table} WHERE deleted_at IS NULL`
  );
  const totalCount = totalResult[0].total;

  // 重复记录数（按名称统计）
  const [dupResult] = await pool.query(
    `SELECT COUNT(*) as dup_count FROM (
      SELECT ${nameColumn} FROM ${table}
      WHERE deleted_at IS NULL AND ${nameColumn} IS NOT NULL AND ${nameColumn} != ''
      GROUP BY ${nameColumn} HAVING COUNT(*) > 1
    ) t`
  );
  const duplicateCount = dupResult[0].dup_count;

  // 获取重复记录明细（Top10）
  const [dupList] = await pool.query(
    `SELECT ${nameColumn} as name, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
     FROM ${table}
     WHERE deleted_at IS NULL AND ${nameColumn} IS NOT NULL AND ${nameColumn} != ''
     GROUP BY ${nameColumn} HAVING COUNT(*) > 1
     ORDER BY cnt DESC LIMIT 10`
  );
  const duplicateDetails = dupList.map(d => ({
    name: d.name,
    count: d.cnt,
    ids: d.ids ? d.ids.split(',').map(Number) : []
  }));

  // 缺失关键字段
  const [missingResult] = await pool.query(
    `SELECT COUNT(*) as missing FROM ${table}
     WHERE deleted_at IS NULL AND (${nameColumn} IS NULL OR ${nameColumn} = '')`
  );
  const missingCount = missingResult[0].missing;

  // 无效格式（邮箱格式）
  const [invalidResult] = await pool.query(
    `SELECT COUNT(*) as invalid FROM ${table}
     WHERE deleted_at IS NULL
       AND ${emailColumn} IS NOT NULL
       AND ${emailColumn} != ''
       AND ${emailColumn} NOT REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'`
  );
  const invalidCount = invalidResult[0].invalid;

  // 质量评分：100分起，每项扣分
  let qualityScore = 100;
  if (totalCount > 0) {
    qualityScore -= (duplicateCount / totalCount) * 30;
    qualityScore -= (missingCount / totalCount) * 40;
    qualityScore -= (invalidCount / totalCount) * 30;
    qualityScore = Math.max(0, Math.round(qualityScore * 100) / 100);
  }

  // 保存报告
  await pool.query(
    `INSERT INTO sys_data_quality_report (table_name, total_count, duplicate_count, invalid_count, missing_count, quality_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [table, totalCount, duplicateCount, invalidCount, missingCount, qualityScore]
  );

  return {
    table_name: table,
    total_count: totalCount,
    duplicate_count: duplicateCount,
    duplicate_details: duplicateDetails,
    invalid_count: invalidCount,
    missing_count: missingCount,
    quality_score: qualityScore
  };
}

/**
 * 修复质量问题
 * @param {object} pool - 数据库连接池
 * @param {string} table - 表名
 * @param {object} options - 修复选项
 * @returns {object} 修复结果
 */
async function fixQualityIssues(pool, table = 'crm_customer', options = {}) {
  // 白名单表名，防止 SQL 注入
  if (!ALLOWED_TABLES[table]) {
    throw new Error('不支持的表');
  }

  const { nameColumn } = ALLOWED_TABLES[table];
  const results = { fixed: 0, errors: [] };

  // 修复空名称：设置为"未知客户"
  if (options.fixMissingNames) {
    try {
      const [result] = await pool.query(
        `UPDATE ${table} SET ${nameColumn} = '未知客户'
         WHERE deleted_at IS NULL AND (${nameColumn} IS NULL OR ${nameColumn} = '')`
      );
      results.fixed += result.affectedRows;
    } catch (error) {
      results.errors.push({ type: 'fix_missing_names', error: error.message });
    }
  }

  // 去除名称前后空格
  if (options.trimNames) {
    try {
      const [result] = await pool.query(
        `UPDATE ${table} SET ${nameColumn} = TRIM(${nameColumn})
         WHERE deleted_at IS NULL AND ${nameColumn} != TRIM(${nameColumn})`
      );
      results.fixed += result.affectedRows;
    } catch (error) {
      results.errors.push({ type: 'trim_names', error: error.message });
    }
  }

  return results;
}

module.exports = {
  getQualityReport,
  runQualityCheck,
  fixQualityIssues
};
