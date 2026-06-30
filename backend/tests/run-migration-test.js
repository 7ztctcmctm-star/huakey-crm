/**
 * 迁移 roundtrip 测试启动器 (Phase 8)
 *
 * 用法: node backend/tests/run-migration-test.js
 * 环境: 需要 docker-compose.ci.yml, DB_PORT=3307, DB_NAME=huakey_crm_test
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

async function main() {
  console.log('=== Phase 8: Migration Roundtrip Test Runner ===\n');

  // 1. Start CI MySQL + Redis
  console.log('[1/4] Starting CI containers...');
  run('docker compose -f docker-compose.ci.yml up -d');

  // 2. Wait for MySQL to be healthy
  console.log('[2/4] Waiting for MySQL to be ready...');
  for (let i = 0; i < 30; i++) {
    try {
      execSync(
        'docker compose -f docker-compose.ci.yml exec -T mysql mysqladmin ping -h localhost -u root --password=test_root_pass --silent',
        { cwd: ROOT, stdio: 'pipe', timeout: 5000 }
      );
      console.log('  MySQL is ready.');
      break;
    } catch {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 3. Run migration roundtrip tests
  console.log('\n[3/4] Running migration roundtrip tests...');
  run(
    'npx jest tests/db/migration-roundtrip.test.js --forceExit --testTimeout=60000 --verbose',
    {
      cwd: path.join(ROOT, 'backend'),
      env: {
        ...process.env,
        DB_PORT: '3307',
        DB_NAME: 'huakey_crm_test',
        DB_PASSWORD: 'test_root_pass',
        NODE_ENV: 'test',
      },
    }
  );

  // 4. Cleanup
  console.log('\n[4/4] Cleaning up CI containers...');
  run('docker compose -f docker-compose.ci.yml down -v');

  console.log('\n=== Migration Roundtrip Test Complete ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
