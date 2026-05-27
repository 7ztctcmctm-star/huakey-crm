const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 本地开发时加载 .env，Docker 环境下环境变量已由 docker-compose 注入
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}

const MIGRATIONS_DIR = __dirname;

async function run() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    // 确保 schema_migrations 表存在
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_version (version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 获取已执行的迁移
    const [executed] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const executedSet = new Set(executed.map(r => r.version));

    // 获取所有迁移文件（按文件名排序）
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
      .sort();

    if (files.length === 0) {
      console.log('没有找到迁移文件');
      return;
    }

    console.log(`找到 ${files.length} 个迁移文件，已执行 ${executedSet.size} 个`);

    let ran = 0;
    for (const file of files) {
      const version = file.split('_')[0];

      if (executedSet.has(version)) {
        console.log(`  跳过 ${file}（已执行）`);
        continue;
      }

      console.log(`  执行 ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        await pool.query(sql);
        await pool.query(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
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
      console.log('所有迁移均已执行，无需操作');
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
