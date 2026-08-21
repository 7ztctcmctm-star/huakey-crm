const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

// 本地开发时加载 .env，Docker 环境下环境变量已由 docker-compose 注入
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }) } catch (e) {}

const MIGRATIONS_DIR = __dirname
const args = process.argv.slice(2)
const isRollback = args.includes('--rollback')
const targetVersion = args.find(a => /^\d{3}$/.test(a)) || null
const DB_NAME = process.env.DB_NAME || 'huakey_crm'

/**
 * 规范化迁移 SQL：
 * 1. 移除硬编码的 USE 语句，避免切换到错误的数据库
 * 2. 将 @db_name = 'huakey_crm' 替换为实际目标库名，支持测试/CI 使用不同库名
 */
function normalizeMigrationSql(sql) {
  return sql
    .replace(/^USE\s+`?[^`;\s]+`?\s*;?\s*$/gim, '')       // 移除 USE huakey_crm 语句
    .replace(/'(huakey_crm)'/gi, `'${DB_NAME}'`)            // 替换所有 'huakey_crm' 字符串引用
    .replace(/`(huakey_crm)`/gi, `\`${DB_NAME}\``)          // 替换所有 `huakey_crm` 标识符引用
}

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
  })

  // 等待数据库就绪（最多重试30次，每次间隔2秒）
  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query('SELECT 1');
      connected = true;
      break;
    } catch (e) {
      console.log(`[迁移] 等待数据库就绪... (${i + 1}/30)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!connected) {
    console.error('[迁移] 致命错误: 数据库连接超时（已重试30次）');
    process.exit(1);
  }

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
    `)

    if (isRollback) {
      await rollback(pool, targetVersion)
    } else {
      await migrateUp(pool)
    }
  } finally {
    await pool.end()
  }
}

// ===== 正向迁移 =====
async function migrateUp(pool) {
  // 获取已执行的迁移
  const [executed] = await pool.query('SELECT version FROM schema_migrations ORDER BY version')
  const executedSet = new Set(executed.map(r => r.version))

  // 获取所有迁移文件（按文件名排序）
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f) && !f.endsWith('_down.sql'))
    .sort()

  if (files.length === 0) {
    console.log('没有找到迁移文件')
    return
  }

  console.log(`找到 ${files.length} 个迁移文件，已执行 ${executedSet.size} 个`)

  let ran = 0
  for (const file of files) {
    const version = file.split('_')[0]

    if (executedSet.has(version)) {
      console.log(`  跳过 ${file}（已执行）`)
      continue
    }

    console.log(`  执行 ${file} ...`)
    const rawSql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const sql = normalizeMigrationSql(rawSql)

    try {
      // 事务包裹：单文件迁移原子执行。注意：MySQL 8 部分 DDL（如多数 ALTER/CREATE）
      // 会隐式提交当前事务，此类迁移的事务包裹无法回滚已提交的 DDL，但能保证
      // 纯 DML 迁移的原子性，且 DDL 迁移失败时仍会中断执行（不会记录版本号导致跳过）
      await pool.query('START TRANSACTION')
      await pool.query(sql)
      await pool.query('COMMIT')
      await pool.query(
        'INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
        [version, file]
      )
      console.log(`  ✓ ${file} 执行成功`)
      ran++
    } catch (err) {
      try { await pool.query('ROLLBACK') } catch (rollbackErr) { /* 连接可能已断开 */ }
      console.error(`  ✗ ${file} 执行失败: ${err.message}`)
      process.exit(1)
    }
  }

  if (ran === 0) {
    console.log('所有迁移均已执行，无需操作')
  } else {
    console.log(`\n本次执行了 ${ran} 个迁移`)
  }
}

// ===== 回滚迁移 =====
async function rollback(pool, targetVersion) {
  // 获取已执行的迁移（倒序）
  const [executed] = await pool.query('SELECT version, name FROM schema_migrations ORDER BY version DESC')
  const executedList = executed.map(r => ({ version: r.version, name: r.name }))

  if (executedList.length === 0) {
    console.log('没有已执行的迁移，无需回滚')
    return
  }

  // 确定需要回滚的版本
  const toRollback = targetVersion
    ? executedList.filter(r => r.version >= targetVersion)
    : [executedList[0]] // 默认只回滚最后一个

  if (toRollback.length === 0) {
    console.log(`没有需要回滚到版本 ${targetVersion} 的迁移`)
    return
  }

  console.log(`准备回滚 ${toRollback.length} 个迁移`)

  let rolled = 0
  for (const { version, name } of toRollback) {
    // 查找对应的 _down.sql 文件
    const downFile = name.replace('.sql', '_down.sql')
    const downPath = path.join(MIGRATIONS_DIR, downFile)

    if (!fs.existsSync(downPath)) {
      console.warn(`  ⚠ 版本 ${version} 缺少回滚文件: ${downFile}，跳过（迁移不可逆）`)
      continue
    }

    console.log(`  回滚 ${name} (使用 ${downFile}) ...`)
    const rawSql = fs.readFileSync(downPath, 'utf8')
    const sql = normalizeMigrationSql(rawSql)

    try {
      await pool.query(sql)
      await pool.query('DELETE FROM schema_migrations WHERE version = ?', [version])
      console.log(`  ✓ 版本 ${version} 回滚成功`)
      rolled++
    } catch (err) {
      console.error(`  ✗ 版本 ${version} 回滚失败: ${err.message}`)
      process.exit(1)
    }
  }

  console.log(`\n本次回滚了 ${rolled} 个迁移`)
}

run().catch(err => {
  console.error('迁移执行出错:', err.message)
  process.exit(1)
})
