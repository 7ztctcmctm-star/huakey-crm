/**
 * 迁移回合测试：验证 up + down 脚本的往返正确性。
 *
 * 环境要求：CI MySQL（docker-compose.ci.yml, DB_PORT=3307）
 *
 * 运行：DB_PORT=3307 DB_NAME=huakey_crm_test npx jest tests/db/migration-roundtrip.test.js --forceExit --testTimeout=60000
 */

const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
const path = require('path');
const net = require('net');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');
const DB_PORT = parseInt(process.env.DB_PORT) || 3307;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

// 5 张核心业务表 — 往返后结构必须一致
const KEY_TABLES = ['crm_customer', 'crm_opportunity', 'crm_quote', 'crm_contract', 'sys_user'];

// 有 up+down 配对的迁移版本号（000_template 只有 down 模板，无 up，故不参与）
const TEST_VERSIONS = ['002', '008', '061'];

let pool;

/**
 * 检查 DB 端口是否可达
 */
function checkDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(DB_PORT, DB_HOST);
  });
}

/**
 * 调用 run_migrations.js 执行迁移或回滚
 */
function runMigration(args = '') {
  const cmd = `node "${path.join(MIGRATIONS_DIR, 'run_migrations.js')}" ${args}`;
  execSync(cmd, {
    env: {
      ...process.env,
      DB_HOST,
      DB_PORT: String(DB_PORT),
      DB_USER,
      DB_PASSWORD,
      DB_NAME
    },
    stdio: 'pipe'
  });
}

beforeAll(async () => {
  const reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[migration-roundtrip] CI MySQL 不可达 (端口 ${DB_PORT})，跳过迁移往返测试`);
    return; // 后续 test 检测到 pool 为 undefined 后自行跳过
  }

  // 确保测试库存在
  const adminPool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });
  await adminPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminPool.end();

  // 先运行全部正向迁移，建立完整 schema
  runMigration();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  });
}, 60000);

afterAll(async () => {
  if (pool) await pool.end();
});

/**
 * 获取 SHOW CREATE TABLE 结果
 */
async function getTableSchema(tableName) {
  const [rows] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
  return rows[0]?.['Create Table'] || '';
}

describe('数据库迁移 roundtrip 测试', () => {
  TEST_VERSIONS.forEach(version => {
    test(`版本 ${version}: down → up 往返后关键表结构一致`, async () => {
      if (!pool) {
        console.warn('[migration-roundtrip] 跳过：数据库不可达');
        return;
      }

      // 1. 记录关键表结构
      const schemasBefore = {};
      for (const table of KEY_TABLES) {
        try {
          schemasBefore[table] = await getTableSchema(table);
        } catch {
          schemasBefore[table] = null;
        }
      }

      // 2. 回滚到目标版本（run_migrations.js 会回滚该版本及之后的所有迁移）
      runMigration(`--rollback ${version}`);

      // 3. 重新执行所有正向迁移
      runMigration();

      // 4. 对比关键表结构
      for (const table of KEY_TABLES) {
        if (schemasBefore[table]) {
          const schemaAfter = await getTableSchema(table);
          expect(schemaAfter).toBe(schemasBefore[table]);
        }
      }
    }, 60000);
  });
});
