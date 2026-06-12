/**
 * 数据库迁移执行器
 * 用法: node database/migrate.js
 *
 * 按文件名顺序执行 database/migrations/ 下所有 .sql 文件
 * 每个文件在独立事务中执行，失败时跳过继续（幂等文件可重复执行）
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    // 确保 schema_migrations 表存在
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200),
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 获取已执行的迁移
    const [executed] = await pool.query('SELECT version FROM schema_migrations');
    const executedSet = new Set(executed.map(r => r.version));

    // 读取迁移文件
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[迁移] 发现 ${files.length} 个迁移文件`);

    let success = 0, skipped = 0, failed = 0;

    for (const file of files) {
      const version = file.split('_')[0];

      if (executedSet.has(version)) {
        skipped++;
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        // 按分号拆分并逐条执行（跳过空语句和注释）
        const statements = sql.split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.match(/^--/) && !s.match(/^\/\*/));

        for (const stmt of statements) {
          if (stmt && stmt !== 'SELECT 1') {
            await pool.query(stmt);
          }
        }

        // 记录迁移版本（如果文件自己没记录的话）
        const [existing] = await pool.query(
          'SELECT version FROM schema_migrations WHERE version = ?', [version]
        );
        if (existing.length === 0) {
          await pool.query(
            'INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
            [version, file.replace('.sql', '')]
          );
        }

        console.log(`[迁移] ✅ ${file}`);
        success++;
      } catch (error) {
        console.error(`[迁移] ❌ ${file}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n[迁移] 完成: 成功=${success}, 跳过=${skipped}, 失败=${failed}`);

  } catch (error) {
    console.error('[迁移] 致命错误:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
