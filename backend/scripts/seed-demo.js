#!/usr/bin/env node
/**
 * Demo 数据初始化执行器
 *
 * 用法：
 *   cd backend && npm run seed:demo
 *   或：node scripts/seed-demo.js
 *
 * 功能：
 *   1. 生产环境硬阻断（NODE_ENV=production 直接退出）
 *   2. 按 demo_all.sql 顺序执行各 seed 文件（幂等）
 *   3. 汇总验证 Demo 数据条数
 *
 * 环境变量（默认从 backend/.env 读取，可被进程 env 覆盖）：
 *   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *
 * 安全：
 *   - 生产环境（NODE_ENV=production）禁止执行
 *   - 所有 seed SQL 均幂等（INSERT IGNORE / NOT EXISTS），重复执行不报错
 *   - 不覆盖真实用户（INSERT IGNORE 命中已存在记录时保留原数据）
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ------------------------------------------------------------
// 1. 生产环境阻断
// ------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  console.error('\n[seed:demo] ❌ Production environment cannot load demo data');
  console.error('[seed:demo]    当前 NODE_ENV=production，已阻断执行。\n');
  process.exit(1);
}

// ------------------------------------------------------------
// 2. 数据库配置
// ------------------------------------------------------------
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'huakey_crm',
  multipleStatements: true,
  charset: 'utf8mb4'
};

// mysql2 安装在后端 node_modules
const mysql = require('../node_modules/mysql2/promise');

// seed 文件执行顺序（与 demo_all.sql 一致）
const SEED_FILES = [
  'demo_roles.sql',
  'demo_users.sql',
  'demo_customers.sql',
  'demo_contacts.sql',
  'demo_products.sql',
  'demo_opportunities.sql',
  'demo_quotes.sql',
  'demo_contracts.sql',
  'demo_payments.sql',
  'demo_suppliers.sql'
];

const SEEDS_DIR = path.resolve(__dirname, '..', '..', 'database', 'seeds');

// ------------------------------------------------------------
// 3. 主流程
// ------------------------------------------------------------
async function main() {
  console.log('\n[seed:demo] ========================================');
  console.log('[seed:demo]   HuakeyCRM Demo 数据初始化');
  console.log('[seed:demo] ========================================');
  console.log(`[seed:demo] 目标数据库: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`[seed:demo] NODE_ENV: ${process.env.NODE_ENV || '(未设置, 视为开发环境)'}\n`);

  // 二次安全检查：数据库名包含 prod 时额外警告
  if (/prod/i.test(dbConfig.database) && !/test|dev|demo/i.test(dbConfig.database)) {
    console.error('[seed:demo] ❌ 目标数据库名疑似生产环境（含 prod），已阻断执行。');
    console.error('[seed:demo]    如确需执行，请显式设置 DB_NAME 为测试/开发库。\n');
    process.exit(1);
  }

  let pool;
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('[seed:demo] ✅ 数据库连接成功\n');

    // 按顺序执行 seed 文件
    for (const file of SEED_FILES) {
      const filePath = path.join(SEEDS_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.error(`[seed:demo] ❌ 文件不存在: ${filePath}`);
        process.exit(1);
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      const t0 = Date.now();
      try {
        await pool.query(sql);
        console.log(`[seed:demo] ✅ ${file} 执行成功 (${Date.now() - t0}ms)`);
      } catch (err) {
        console.error(`[seed:demo] ❌ ${file} 执行失败: ${err.message}`);
        throw err;
      }
    }

    // 汇总验证
    console.log('\n[seed:demo] ========================================');
    console.log('[seed:demo]   Demo 数据初始化完成 — 汇总');
    console.log('[seed:demo] ========================================');
    const [rows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sys_user WHERE is_demo=1) AS demo_users,
        (SELECT COUNT(*) FROM crm_customer WHERE is_demo=1) AS demo_customers,
        (SELECT COUNT(*) FROM crm_contact WHERE is_demo=1) AS demo_contacts,
        (SELECT COUNT(*) FROM crm_opportunity WHERE is_demo=1) AS demo_opportunities,
        (SELECT COUNT(*) FROM crm_follow_up WHERE is_demo=1) AS demo_followups,
        (SELECT COUNT(*) FROM crm_product WHERE is_demo=1) AS demo_products,
        (SELECT COUNT(*) FROM crm_quote WHERE is_demo=1) AS demo_quotes,
        (SELECT COUNT(*) FROM crm_contract WHERE is_demo=1) AS demo_contracts,
        (SELECT COUNT(*) FROM crm_payment_plan WHERE is_demo=1) AS demo_payment_plans,
        (SELECT COUNT(*) FROM crm_payment WHERE is_demo=1) AS demo_payments,
        (SELECT COUNT(*) FROM crm_supplier WHERE is_demo=1) AS demo_suppliers
    `);
    const r = rows[0];
    console.log(`[seed:demo]   用户: ${r.demo_users}  客户: ${r.demo_customers}  联系人: ${r.demo_contacts}`);
    console.log(`[seed:demo]   商机: ${r.demo_opportunities}  跟进: ${r.demo_followups}  产品: ${r.demo_products}`);
    console.log(`[seed:demo]   报价: ${r.demo_quotes}  合同: ${r.demo_contracts}`);
    console.log(`[seed:demo]   回款计划: ${r.demo_payment_plans}  回款记录: ${r.demo_payments}  供应商: ${r.demo_suppliers}`);
    console.log('[seed:demo] ========================================\n');
    console.log('[seed:demo] Demo 账号：');
    console.log('[seed:demo]   demo_admin    / Demo@123456  (管理员)');
    console.log('[seed:demo]   demo_sales    / Demo@123456  (销售)');
    console.log('[seed:demo]   demo_purchase / Demo@123456  (采购)');
    console.log('[seed:demo] ========================================\n');

  } catch (err) {
    console.error('\n[seed:demo] ❌ 执行失败:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
