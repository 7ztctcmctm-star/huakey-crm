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
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '/tests/security/',
    '/tests/performance/',
    '/tests/setup-integration\\.js$'
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!node-cache/)'
  ],
  testTimeout: 30000,
  reporters: ['default']
};
