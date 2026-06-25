const mysql = require('mysql2/promise');
require('dotenv').config();

const OPTIMIZE_INDICES_SQL = `
-- 客户表索引优化
CREATE INDEX IF NOT EXISTS idx_customer_company ON crm_customer(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_status ON crm_customer(status);
CREATE INDEX IF NOT EXISTS idx_customer_create_time ON crm_customer(create_time);
CREATE INDEX IF NOT EXISTS idx_customer_source ON crm_customer(source);
CREATE INDEX IF NOT EXISTS idx_customer_level ON crm_customer(level);
CREATE INDEX IF NOT EXISTS idx_customer_create_by ON crm_customer(create_by);

-- 商机表索引优化
CREATE INDEX IF NOT EXISTS idx_opportunity_customer ON crm_opportunity(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_stage ON crm_opportunity(stage);
CREATE INDEX IF NOT EXISTS idx_opportunity_status ON crm_opportunity(status);
CREATE INDEX IF NOT EXISTS idx_opportunity_create_by ON crm_opportunity(create_by);
CREATE INDEX IF NOT EXISTS idx_opportunity_expected_date ON crm_opportunity(expected_date);
CREATE INDEX IF NOT EXISTS idx_opportunity_create_time ON crm_opportunity(create_time);

-- 跟进记录表索引优化
CREATE INDEX IF NOT EXISTS idx_follow_customer ON crm_follow_up(customer_id);
CREATE INDEX IF NOT EXISTS idx_follow_create_by ON crm_follow_up(create_by);
CREATE INDEX IF NOT EXISTS idx_follow_next_time ON crm_follow_up(next_time);
CREATE INDEX IF NOT EXISTS idx_follow_create_time ON crm_follow_up(create_time);

-- 报价单表索引优化
CREATE INDEX IF NOT EXISTS idx_quote_customer ON crm_quote(customer_id);
CREATE INDEX IF NOT EXISTS idx_quote_status ON crm_quote(status);
CREATE INDEX IF NOT EXISTS idx_quote_create_by ON crm_quote(create_by);
CREATE INDEX IF NOT EXISTS idx_quote_create_time ON crm_quote(create_time);

-- 合同表索引优化
CREATE INDEX IF NOT EXISTS idx_contract_customer ON crm_contract(customer_id);
CREATE INDEX IF NOT EXISTS idx_contract_status ON crm_contract(status);
CREATE INDEX IF NOT EXISTS idx_contract_create_by ON crm_contract(create_by);
CREATE INDEX IF NOT EXISTS idx_contract_sign_date ON crm_contract(sign_date);
CREATE INDEX IF NOT EXISTS idx_contract_create_time ON crm_contract(create_time);

-- 回款计划表索引优化
CREATE INDEX IF NOT EXISTS idx_payment_plan_contract ON crm_payment_plan(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_date ON crm_payment_plan(plan_date);

-- 回款记录表索引优化
CREATE INDEX IF NOT EXISTS idx_payment_contract ON crm_payment(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan ON crm_payment(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_date ON crm_payment(pay_date);

-- 服务工单表索引优化
CREATE INDEX IF NOT EXISTS idx_service_customer ON crm_service_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_status ON crm_service_order(status);
CREATE INDEX IF NOT EXISTS idx_service_assignee ON crm_service_order(assignee_id);
CREATE INDEX IF NOT EXISTS idx_service_priority ON crm_service_order(priority);
CREATE INDEX IF NOT EXISTS idx_service_create_time ON crm_service_order(create_time);

-- 联系人表索引优化
CREATE INDEX IF NOT EXISTS idx_contact_customer ON crm_contact(customer_id);
`;

const ANALYZE_TABLES_SQL = `
ANALYZE TABLE crm_customer;
ANALYZE TABLE crm_opportunity;
ANALYZE TABLE crm_follow_up;
ANALYZE TABLE crm_quote;
ANALYZE TABLE crm_contract;
ANALYZE TABLE crm_payment_plan;
ANALYZE TABLE crm_payment;
ANALYZE TABLE crm_service_order;
ANALYZE TABLE crm_contact;
ANALYZE TABLE sys_user;
`;

const CHECK_QUERY = `
SELECT
  t.TABLE_NAME,
  i.INDEX_NAME,
  i.COLUMN_NAME,
  i.SEQ_IN_INDEX,
  i.NON_UNIQUE,
  s.CARDINALITY,
  t.TABLE_ROWS,
  t.DATA_LENGTH,
  t.INDEX_LENGTH
FROM information_schema.STATISTICS s
JOIN information_schema.TABLES t
  ON s.TABLE_SCHEMA = t.TABLE_SCHEMA AND s.TABLE_NAME = t.TABLE_NAME
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN (
    'crm_customer', 'crm_opportunity', 'crm_follow_up', 'crm_quote',
    'crm_contract', 'crm_payment_plan', 'crm_payment',
    'crm_service_order', 'crm_contact', 'sys_user'
  )
ORDER BY t.TABLE_NAME, i.INDEX_NAME, i.SEQ_IN_INDEX;
`;

async function optimizeIndices() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
  });

  console.log('\n==========================================');
  console.log('  数据库索引优化工具');
  console.log('==========================================\n');

  try {
    console.log('正在分析现有索引...');
    const [indices] = await pool.query(CHECK_QUERY);

    const tableIndices = {};
    for (const idx of indices) {
      if (!tableIndices[idx.TABLE_NAME]) {
        tableIndices[idx.TABLE_NAME] = [];
      }
      tableIndices[idx.TABLE_NAME].push({
        name: idx.INDEX_NAME,
        column: idx.COLUMN_NAME,
        cardinality: idx.CARDINALITY,
        rows: idx.TABLE_ROWS
      });
    }

    console.log('\n当前索引情况:');
    console.log('-'.repeat(80));
    for (const [table, indices] of Object.entries(tableIndices)) {
      console.log(`\n表: ${table}`);
      for (const idx of indices) {
        const usage = idx.rows > 0 ? ((idx.cardinality / idx.rows) * 100).toFixed(1) + '%' : 'N/A';
        console.log(`  - ${idx.name}(${idx.column}): 基数率=${usage}`);
      }
    }

    console.log('\n\n正在创建缺失的索引...');
    const statements = OPTIMIZE_INDICES_SQL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.startsWith('CREATE INDEX'));

    let createdCount = 0;
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
        const match = stmt.match(/CREATE INDEX (\w+) ON (\w+)/);
        if (match) {
          console.log(`  创建索引: ${match[2]}.${match[1]}`);
          createdCount++;
        }
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`  索引已存在，跳过: ${stmt.split('(')[0].replace('CREATE INDEX ', '')}`);
        } else {
          console.log(`  警告: ${err.message}`);
        }
      }
    }

    console.log(`\n成功创建 ${createdCount} 个索引`);

    console.log('\n正在分析表统计信息...');
    await pool.query(ANALYZE_TABLES_SQL);
    console.log('表统计信息已更新');

    console.log('\n==========================================');
    console.log('  优化完成！');
    console.log('==========================================\n');

  } catch (error) {
    console.error('优化失败:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  optimizeIndices()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { optimizeIndices };