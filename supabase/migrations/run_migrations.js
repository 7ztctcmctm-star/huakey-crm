/**
 * PostgreSQL 迁移运行器（Supabase 兼容）
 *
 * 用法:
 *   node supabase/migrations/run_migrations.js
 *
 * 环境变量:
 *   DATABASE_URL — Supabase/PostgreSQL 连接字符串
 *
 * 替代原来的 database/migrations/run_migrations.js（MySQL 版本）
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 加载 .env 文件
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}

const MIGRATIONS_DIR = __dirname;

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    // 测试连接
    await pool.query('SELECT 1');
    console.log('数据库连接成功');

    // 确保 schema_migrations 表存在
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uk_version UNIQUE (version)
      )
    `);
    console.log('迁移追踪表已就绪');

    // 获取已执行的迁移
    const { rows: executed } = await pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const executedSet = new Set(executed.map(r => r.version));

    // 获取所有迁移文件（按文件名排序）
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
      .sort();

    if (files.length === 0) {
      console.log('没有找到迁移文件');
      return;
    }

    console.log(`找到 ${files.length} 个迁移文件，已执行 ${executedSet.size} 个\n`);

    let ran = 0;
    for (const file of files) {
      const version = file.split('_')[0];

      if (executedSet.has(version)) {
        console.log(`  ⏭ 跳过 ${file}（已执行）`);
        continue;
      }

      console.log(`  ▶ 执行 ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        await pool.query(sql);
        await pool.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
        console.log(`  ✓ ${file} 执行成功`);
        ran++;
      } catch (err) {
        console.error(`  ✗ ${file} 执行失败: ${err.message}`);
        process.exit(1);
      }
    }

    if (ran === 0) {
      console.log('\n所有迁移均已执行，无需操作');
    } else {
      console.log(`\n本次执行了 ${ran} 个迁移`);
    }

  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('迁移执行出错:', err.message);
  process.exit(1);
});
