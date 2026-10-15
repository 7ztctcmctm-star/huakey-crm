/**
 * Jest 配置 — 集成测试专用（CI 使用）
 * 从 jest.config.js 继承，但允许运行 tests/e2e/ 目录下的集成测试
 */
const base = require('./jest.config')

module.exports = {
  ...base,
  // 移除对 tests/e2e/ 的排除，允许集成测试运行
  // ⚠️ migration-roundtrip 是破坏性套件（深回滚共享库），绝不可与其他连库套件并发跑
  // （详见 jest.config.js 同款注释：2026-10-15 实测 6 个套件因并发篡改假红）。
  // 它由 CI migration-test job 以显式路径单独运行（该处用 --testPathIgnorePatterns 覆盖本排除）。
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/security/',
    '/tests/performance/',
    '/tests/db/migration-roundtrip\\.test\\.js$',
    '/tests/setup-integration\\.js$'
  ],
  // 集成测试需要更长超时 + 不生成覆盖率报告以节省 CI 时间
  testTimeout: 30000,
  collectCoverage: false
}
