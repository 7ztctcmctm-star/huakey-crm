/**
 * 自动生成迁移 down 脚本
 *
 * 扫描 database/migrations 下缺少 _down.sql 的 up 脚本，
 * 提取 CREATE TABLE / ALTER TABLE ADD COLUMN / ADD INDEX / ADD FOREIGN KEY，
 * 生成对应的反向 SQL。
 *
 * 用法:
 *   node scripts/generate-down-migrations.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');
const DRY_RUN = process.argv.includes('--dry-run');

function listUpFilesWithoutDown() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f) && !f.endsWith('_down.sql'))
    .sort();

  return files.filter(f => {
    const down = f.replace('.sql', '_down.sql');
    return !fs.existsSync(path.join(MIGRATIONS_DIR, down));
  });
}

function extractStatements(sql) {
  const statements = [];

  // 1. CREATE TABLE ... (匹配 IF NOT EXISTS 可选)
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/gi;
  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    statements.push({ type: 'CREATE_TABLE', table: match[1] });
  }

  // 2. ALTER TABLE ... ADD COLUMN / ADD col_name
  // 注意排除 ADD INDEX / ADD CONSTRAINT / ADD FOREIGN KEY / ADD UNIQUE / ADD PRIMARY KEY
  const addColumnRegex = /ALTER\s+TABLE\s+(?:`?(\w+)`?)\s+ADD(?:\s+COLUMN)?\s+(?!CONSTRAINT\b|INDEX\b|FOREIGN\b|UNIQUE\b|PRIMARY\b)(?:`?(\w+)`?)/gi;
  while ((match = addColumnRegex.exec(sql)) !== null) {
    statements.push({ type: 'ADD_COLUMN', table: match[1], column: match[2] });
  }

  // 3a. ALTER TABLE ... ADD INDEX idx_name
  const addIndexRegex = /ALTER\s+TABLE\s+(?:`?(\w+)`?)\s+ADD\s+(?:UNIQUE\s+)?INDEX\s+(?:`?(\w+)`?)/gi;
  while ((match = addIndexRegex.exec(sql)) !== null) {
    statements.push({ type: 'ADD_INDEX', table: match[1], index: match[2] });
  }

  // 3b. CREATE INDEX idx_name ON table_name(...)
  const createIndexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:`?(\w+)`?)\s+ON\s+(?:`?(\w+)`?)/gi;
  while ((match = createIndexRegex.exec(sql)) !== null) {
    statements.push({ type: 'ADD_INDEX', table: match[2], index: match[1] });
  }

  // 4. ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...
  const addFkRegex = /ALTER\s+TABLE\s+(?:`?(\w+)`?)\s+ADD\s+(?:CONSTRAINT\s+(?:`?(\w+)`?)\s+)?FOREIGN\s+KEY/gi;
  while ((match = addFkRegex.exec(sql)) !== null) {
    statements.push({ type: 'ADD_FK', table: match[1], constraint: match[2] });
  }

  return statements;
}

function generateDownSql(upFile, statements) {
  const lines = [
    `-- Auto-generated down script for ${upFile}`,
    `-- Generated at: ${new Date().toISOString()}`,
    'USE huakey_crm;',
    ''
  ];

  // 去重：同一列/索引只 drop 一次
  const seenColumns = new Set();
  const seenIndexes = new Set();
  const seenFks = new Set();
  const seenTables = new Set();

  const drops = [];

  // 反向顺序处理：先创建的应该后删除
  for (let i = statements.length - 1; i >= 0; i--) {
    const s = statements[i];
    switch (s.type) {
      case 'CREATE_TABLE': {
        if (!seenTables.has(s.table)) {
          seenTables.add(s.table);
          drops.push(`DROP TABLE IF EXISTS \`${s.table}\`;`);
        }
        break;
      }
      case 'ADD_COLUMN': {
        const key = `${s.table}.${s.column}`;
        if (!seenColumns.has(key)) {
          seenColumns.add(key);
          drops.push(`SET @db = 'huakey_crm';`);
          drops.push(`SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='${s.table}' AND COLUMN_NAME='${s.column}');`);
          drops.push(`SET @sql = IF(@col_exists > 0, 'ALTER TABLE \`${s.table}\` DROP COLUMN \`${s.column}\`', 'SELECT 1');`);
          drops.push('PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
          drops.push('');
        }
        break;
      }
      case 'ADD_INDEX': {
        const key = `${s.table}.${s.index}`;
        if (!seenIndexes.has(key)) {
          seenIndexes.add(key);
          drops.push(`SET @db = 'huakey_crm';`);
          drops.push(`SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='${s.table}' AND INDEX_NAME='${s.index}');`);
          drops.push(`SET @sql = IF(@idx_exists > 0, 'ALTER TABLE \`${s.table}\` DROP INDEX \`${s.index}\`', 'SELECT 1');`);
          drops.push('PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
          drops.push('');
        }
        break;
      }
      case 'ADD_FK': {
        if (!s.constraint) continue; // 无名的外键约束无法安全回滚
        const key = `${s.table}.${s.constraint}`;
        if (!seenFks.has(key)) {
          seenFks.add(key);
          drops.push(`SET @db = 'huakey_crm';`);
          drops.push(`SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='${s.table}' AND CONSTRAINT_NAME='${s.constraint}' AND CONSTRAINT_TYPE='FOREIGN KEY');`);
          drops.push(`SET @sql = IF(@fk_exists > 0, 'ALTER TABLE \`${s.table}\` DROP FOREIGN KEY \`${s.constraint}\`', 'SELECT 1');`);
          drops.push('PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
          drops.push('');
        }
        break;
      }
      default:
        break;
    }
  }

  if (drops.length === 0) {
    lines.push('-- 未检测到可自动回滚的 schema 变更（可能是种子数据或索引类迁移）');
    lines.push('SELECT 1;');
  } else {
    lines.push(...drops);
  }

  return lines.join('\n');
}

function main() {
  const files = listUpFilesWithoutDown();
  console.log(`发现 ${files.length} 个缺少 down 脚本的迁移`);

  let generated = 0;
  for (const file of files) {
    const upPath = path.join(MIGRATIONS_DIR, file);
    const downFile = file.replace('.sql', '_down.sql');
    const downPath = path.join(MIGRATIONS_DIR, downFile);

    const sql = fs.readFileSync(upPath, 'utf8');
    const statements = extractStatements(sql);
    const downSql = generateDownSql(file, statements);

    if (DRY_RUN) {
      console.log(`\n=== ${downFile} ===`);
      console.log(downSql);
    } else {
      fs.writeFileSync(downPath, downSql);
      console.log(`✓ 生成 ${downFile} (${statements.length} 个操作)`);
    }
    generated++;
  }

  console.log(`\n共 ${DRY_RUN ? '预览' : '生成'} ${generated} 个 down 脚本`);
}

main();
