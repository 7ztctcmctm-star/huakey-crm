/**
 * 集成测试 runner
 * 用法: npm run test:integration
 */
const { execSync } = require('child_process');

try {
  execSync(
    'npx jest tests/e2e/ --forceExit --testTimeout=30000 --testPathPatterns=e2e',
    {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    }
  );
} catch (e) {
  process.exit(1);
}
