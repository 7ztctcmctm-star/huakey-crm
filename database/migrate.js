/**
 * 数据库迁移执行器
 * 用法: node database/migrate.js
 *
 * 按文件名顺序执行 database/migrations/ 下所有 .sql 文件
 * 每个文件在独立事务中执行，失败时跳过继续（幂等文件可重复执行）
 *
 * 跨库兼容（v1.0 发布阻塞修复）：
 *   历史迁移文件大量使用 `USE huakey_crm;` 与 `table_schema='huakey_crm'` 硬编码，
 *   导致 migrate.js 在目标库非 huakey_crm（如 huakey_crm_test / huakey_crm_prod）时：
 *     1. DDL 实际改到 huakey_crm（错误库），目标库 schema 不变；
 *     2. schema_migrations 记录因连接池被 USE 污染而写到错误库；
 *     3. information_schema 诊断查询查 huakey_crm 而非目标库。
 *   修复策略（仅当目标库 != 'huakey_crm' 时启用，生产 huakey_crm 行为不变）：
 *     a. 运行时剥离 `USE huakey_crm;` 语句；
 *     b. 将 information_schema 查询中的 'huakey_crm' 替换为 DATABASE()；
 *     c. schema_migrations 查询使用完全限定表名 `<targetDb>.schema_migrations`。
 *   这样迁移可在任意目标库正确应用，不修改 100+ 历史 .sql 文件。
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * 规整迁移 SQL，使其可在目标库正确执行（跨库兼容）
 * 仅当目标库非 huakey_crm 时生效；生产环境 huakey_crm 保持原始行为。
 */
function adaptSqlForTargetDb(rawSql, targetDb) {
  if (targetDb === 'huakey_crm') return rawSql;
  let sql = rawSql;
  // a. 剥离 USE huakey_crm; / USE `huakey_crm`; （行首，幂等）
  sql = sql.replace(/^\s*USE\s+`?huakey_crm`?\s*;?\s*$/gim, '');
  // b. information_schema 查询中的硬编码 schema 名 → DATABASE()
  //    仅替换 *_schema = 'huakey_crm' 模式，不影响 INSERT 数据值
  sql = sql.replace(/(table_schema|TABLE_SCHEMA|constraint_schema|CONSTRAINT_SCHEMA)\s*=\s*'huakey_crm'/gi, '$1 = DATABASE()');
  return sql;
}

async function migrate() {
  const targetDb = process.env.DB_NAME || 'huakey_crm';
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: targetDb,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  // schema_migrations 使用完全限定表名，防止迁移内 USE 语句污染连接池后记录到错误库
  const migrationsTable = '`' + targetDb + '`.schema_migrations';

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
    console.error('[迁移] 致命错误: 数据库连接超时');
    process.exit(1);
  }

  try {
    // 确保 schema_migrations 表存在（限定到目标库）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${migrationsTable} (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200),
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 获取已执行的迁移（限定到目标库）
    const [executed] = await pool.query(`SELECT version FROM ${migrationsTable}`);
    const executedSet = new Set(executed.map(r => r.version));

    // 读取迁移文件（只处理正向迁移，跳过 _down.sql 回滚文件）
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.endsWith('_down.sql'))
      .sort();

    console.log(`[迁移] 目标库: ${targetDb}, 发现 ${files.length} 个迁移文件`);

    let success = 0, skipped = 0, failed = 0;

    for (const file of files) {
      const version = file.split('_')[0];

      if (executedSet.has(version)) {
        skipped++;
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const rawSql = fs.readFileSync(filePath, 'utf8');
      // 跨库适配：剥离 USE huakey_crm + 替换硬编码 schema 引用
      const sql = adaptSqlForTargetDb(rawSql, targetDb);

      try {
        // 整个文件一次性执行（multipleStatements: true 保证 SET/PREPARE 变量在同一连接上下文）
        await pool.query(sql);

        // 迁移内可能残留 USE 语句污染连接池，重置到目标库后再记录版本
        await pool.query(`USE \`${targetDb}\``);

        // 记录迁移版本（限定到目标库，防止连接污染写错库）
        const [existing] = await pool.query(
          `SELECT version FROM ${migrationsTable} WHERE version = ?`, [version]
        );
        if (existing.length === 0) {
          await pool.query(
            `INSERT IGNORE INTO ${migrationsTable} (version, name) VALUES (?, ?)`,
            [version, file.replace('.sql', '')]
          );
        }

        executedSet.add(version);
        console.log(`[迁移] ✅ ${file}`);
        success++;
      } catch (error) {
        console.error(`[迁移] ❌ ${file}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n[迁移] 完成: 成功=${success}, 跳过=${skipped}, 失败=${failed}`);
    if (failed > 0) {
      console.error('[迁移] 存在失败的迁移，终止启动');
      process.exit(1);
    }

  } catch (error) {
    console.error('[迁移] 致命错误:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
