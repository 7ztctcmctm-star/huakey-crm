const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'huakey_crm',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

const OPTIMIZATION_TIPS = {
  'crm_customer': [
    'company_name字段常用于搜索，建议创建全文索引',
    'status字段使用频繁，确保有索引',
    '按create_time排序查询频繁，考虑复合索引(create_by, create_time)'
  ],
  'crm_opportunity': [
    'stage字段分组查询频繁，确保有索引',
    'expected_amount用于金额统计，考虑覆盖索引',
    'customer_id关联查询频繁，确保有索引'
  ],
  'crm_follow_up': [
    'next_time字段用于待办查询，确保有索引',
    'customer_id关联查询频繁，确保有索引',
    'create_by用于数据权限筛选，确保有索引'
  ],
  'crm_contract': [
    'sign_date用于月度统计，确保有索引',
    'status字段筛选频繁，确保有索引',
    'customer_id关联查询频繁，确保有索引'
  ],
  'crm_payment_plan': [
    'plan_date用于回款统计，确保有索引',
    'contract_id关联查询频繁，确保有索引'
  ],
  'crm_payment': [
    'pay_date用于回款统计，确保有索引',
    'plan_id关联查询频繁，确保有索引'
  ],
  'crm_service_order': [
    'status字段状态筛选频繁，确保有索引',
    'assignee_id用于工程师查询，确保有索引',
    'priority字段排序频繁，确保有索引'
  ]
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function analyzeDatabase() {
  console.log('\n==========================================');
  console.log('  数据库查询性能分析工具');
  console.log('==========================================\n');

  try {
    console.log('1. 分析表结构和数据量...\n');

    const [tables] = await pool.query(`
      SELECT
        TABLE_NAME,
        TABLE_ROWS,
        DATA_LENGTH,
        INDEX_LENGTH,
        (DATA_LENGTH + INDEX_LENGTH) as TOTAL_SIZE,
        AVG_ROW_LENGTH,
        DATA_FREE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
    `);

    console.log('表数据量统计:');
    console.log('-'.repeat(90));
    console.log('表名'.padEnd(25) + '行数'.padStart(12) + '数据大小'.padStart(15) + '索引大小'.padStart(15) + '总大小'.padStart(15));
    console.log('-'.repeat(90));

    for (const table of tables) {
      const rowCount = table.TABLE_ROWS || 0;
      console.log(
        table.TABLE_NAME.padEnd(25) +
        rowCount.toString().padStart(12) +
        formatBytes(table.DATA_LENGTH).padStart(15) +
        formatBytes(table.INDEX_LENGTH).padStart(15) +
        formatBytes(table.TOTAL_SIZE).padStart(15)
      );
    }

    console.log('\n2. 分析索引使用情况...\n');

    const [indices] = await pool.query(`
      SELECT
        TABLE_NAME,
        INDEX_NAME,
        COLUMN_NAME,
        SEQ_IN_INDEX,
        CARDINALITY,
        NON_UNIQUE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);

    const indexMap = {};
    for (const idx of indices) {
      const key = `${idx.TABLE_NAME}.${idx.INDEX_NAME}`;
      if (!indexMap[key]) {
        indexMap[key] = {
          table: idx.TABLE_NAME,
          name: idx.INDEX_NAME,
          columns: [],
          cardinality: idx.CARDINALITY,
          unique: idx.NON_UNIQUE === 0
        };
      }
      indexMap[key].columns.push(idx.COLUMN_NAME);
    }

    console.log('索引统计:');
    console.log('-'.repeat(80));
    for (const [, idx] of Object.entries(indexMap)) {
      const cols = idx.columns.join(', ');
      const type = idx.unique ? 'UNIQUE' : 'NORMAL';
      console.log(`  ${idx.table}.${idx.name} [${type}]`);
      console.log(`    字段: ${cols}`);
      console.log(`    基数: ${idx.cardinality}`);
      console.log();
    }

    console.log('3. 优化建议...\n');

    for (const [table, tips] of Object.entries(OPTIMIZATION_TIPS)) {
      const exists = tables.find(t => t.TABLE_NAME === table);
      if (exists) {
        console.log(`【${table}】`);
        tips.forEach((tip, i) => {
          console.log(`  ${i + 1}. ${tip}`);
        });
        console.log();
      }
    }

    console.log('4. 执行 EXPLAIN 分析关键查询...\n');

    const criticalQueries = [
      {
        name: '客户列表查询',
        sql: 'SELECT * FROM crm_customer WHERE status != 0 ORDER BY create_time DESC LIMIT 20'
      },
      {
        name: '商机列表查询',
        sql: 'SELECT * FROM crm_opportunity ORDER BY create_time DESC LIMIT 20'
      },
      {
        name: '今日待办查询',
        sql: `SELECT f.*, c.company_name
              FROM crm_follow_up f
              LEFT JOIN crm_customer c ON f.customer_id = c.id
              WHERE DATE(f.next_time) = CURDATE()`
      },
      {
        name: '回款统计查询',
        sql: `SELECT SUM(plan_amount) as total
              FROM crm_payment_plan
              WHERE DATE_FORMAT(plan_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`
      }
    ];

    for (const query of criticalQueries) {
      try {
        const [rows] = await pool.query(`EXPLAIN ${query.sql}`);
        console.log(`【${query.name}】`);
        console.log(`  SQL: ${query.sql}`);
        console.log(`  type: ${rows[0].type || 'ALL'} ${rows[0].type === 'ALL' ? '(全表扫描，建议优化)' : '(良好)'}`);
        console.log(`  key: ${rows[0].key || 'NULL'}`);
        console.log(`  rows: ${rows[0].rows || 'N/A'}`);
        console.log();
      } catch (err) {
        console.log(`【${query.name}】分析失败: ${err.message}\n`);
      }
    }

    console.log('==========================================');
    console.log('  分析完成！');
    console.log('==========================================\n');

  } catch (error) {
    console.error('分析失败:', error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  analyzeDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { analyzeDatabase };