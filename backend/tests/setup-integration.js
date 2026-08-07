/**
 * 集成测试全局 setup/teardown
 *
 * 使用方式：在 e2e 测试文件中 require 本模块获取 app、pool、generateToken
 * 环境变量必须在 require app.js 之前设置（config/database.js 模块加载时会立即连接）
 */

// --- 1. 设置环境变量（必须在任何 require 之前） ---
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'crm_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
process.env.DB_NAME = process.env.DB_NAME || 'huakey_crm_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_integration_secret';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6380';
process.env.REDIS_ENABLED = 'false'; // 集成测试不依赖 Redis
process.env.SKIP_CAPTCHA = 'true';
process.env.NODE_ENV = 'test';

// 阻止 app.js 调用 app.listen() 和启动 cron
process.env.VERCEL = '1';

const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
const path = require('path');

// --- 2. 运行数据库迁移 ---
function runMigrations() {
  const projectRoot = path.resolve(__dirname, '../../');
  try {
    execSync('node database/migrations/run_migrations.js', {
      cwd: projectRoot,
      stdio: 'pipe',
      env: { ...process.env }
    });
  } catch (err) {
    // 输出迁移脚本的 stderr/stdout，便于诊断 CI 失败
    console.error('[setup-integration] 迁移执行失败:');
    if (err.stdout) console.error('[stdout]:', err.stdout.toString());
    if (err.stderr) console.error('[stderr]:', err.stderr.toString());
    console.error('[error]:', err.message);
    throw err;
  }
}

// --- 3. 获取 pool 和 app ---
// 这里 require 会触发 config/database.js 的 testConnection()
const pool = require('../config/database');
const app = require('../app');

function getPool() {
  return pool;
}

function createTestApp() {
  return app;
}

// --- 4. 生成测试 JWT ---
function generateToken(overrides = {}) {
  const payload = {
    userId: 1,
    username: 'admin',
    roleId: 1,
    roleCode: 'super_admin',
    viewAll: true,
    manageAll: true,
    ...overrides
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// --- 5. 全局 beforeAll / afterAll ---
beforeAll(async () => {
  runMigrations();
}, 60000);

afterAll(async () => {
  // 清理 VERCEL 标记
  delete process.env.VERCEL;
  // 关闭连接池
  await pool.end();
});

module.exports = {
  createTestApp,
  getPool,
  generateToken,
  pool,
  app
};
