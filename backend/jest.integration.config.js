/**
 * Jest 配置 — 集成测试专用（CI 使用）
 * 从 jest.config.js 继承，但允许运行 tests/e2e/ 目录下的集成测试
 */
const base = require('./jest.config')

module.exports = {
  ...base,
  // 移除对 tests/e2e/ 的排除，允许集成测试运行
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/security/',
    '/tests/performance/',
    '/tests/setup-integration\\.js$'
  ],
  // 集成测试需要更长超时 + 不生成覆盖率报告以节省 CI 时间
  testTimeout: 30000,
  collectCoverage: false
}
