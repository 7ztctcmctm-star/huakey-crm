const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');

const router = express.Router();

/**
 * 数据质量检查
 * POST /customer/quality-check
 * 检查指定表的数据质量，返回统计报告
 */
router.post('/quality-check', authenticateToken, checkPermission('data_quality:check'), async (req, res) => {
  try {
    const { table = 'crm_customer' } = req.body;

    // 白名单表名，防止 SQL 注入
    const allowedTables = {
      crm_customer: { nameColumn: 'company_name', phoneColumn: 'phone', emailColumn: 'email' },
      crm_supplier: { nameColumn: 'name', phoneColumn: 'contact_phone', emailColumn: 'contact_email' }
    };

    if (!allowedTables[table]) {
      return res.status(400).json({ code: 400, message: '不支持的表', data: null });
    }

    const { nameColumn, phoneColumn, emailColumn } = allowedTables[table];

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
         AND ${emailColumn} NOT REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$'`
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

    res.json({
      code: 200,
      message: '检查完成',
      data: {
        table_name: table,
        total_count: totalCount,
        duplicate_count: duplicateCount,
        invalid_count: invalidCount,
        missing_count: missingCount,
        quality_score: qualityScore
      }
    });
  } catch (error) {
    console.error('数据质量检查失败:', error);
    res.status(500).json({ code: 500, message: '检查失败', data: null });
  }
});

/**
 * 获取最近的质量报告
 * POST /customer/quality-report
 */
router.post('/quality-report', authenticateToken, async (req, res) => {
  try {
    const { table = 'crm_customer' } = req.body;

    const [reports] = await pool.query(
      `SELECT * FROM sys_data_quality_report
       WHERE table_name = ?
       ORDER BY check_time DESC LIMIT 1`,
      [table]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: reports[0] || null
    });
  } catch (error) {
    console.error('查询质量报告失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
