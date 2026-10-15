module.exports = {
  testEnvironment: 'node',
  // Coverage thresholds — start conservatively, raise over time
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 40,
      lines: 40,
      statements: 40
    }
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/config/'
  ],
  // Exclude e2e / integration tests from default `npm test` run
  // ⚠️ migration-roundtrip 是**破坏性套件**：beforeAll 对共享库执行 121→002 深回滚再全量重放，
  // 全程分钟级。它与其他连库套件在同一进程池并发跑会互相篡改（2026-10-15 实测：
  // roundtrip 的回滚删记账/删索引的同时，e2e 的 setup-integration 在跑正向迁移
  // ⇒ 092 Duplicate key name TOCTOU、crm_opportunity 回滚中被查 ⇒ 6 个套件假红）。
  // 正确归属：CI migration-test job（严格模式 + 全新库单独跑）；本地按需显式运行：
  //   npx jest tests/db/migration-roundtrip.test.js --testPathIgnorePatterns="/node_modules/" --testTimeout=600000
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '/tests/security/',
    '/tests/performance/',
    '/tests/db/migration-roundtrip\\.test\\.js$',
    '/tests/setup-integration\\.js$'
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!node-cache/)'
  ],
  testTimeout: 30000,
  reporters: ['default']
};
