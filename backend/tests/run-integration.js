/**
 * 集成测试 runner
 * 用法: npm run test:integration
 */
const { execSync } = require('child_process');

try {
  execSync(
    'npx jest tests/e2e/ --config jest.integration.config.js --forceExit',
    {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    }
  );
} catch (e) {
  process.exit(1);
}
