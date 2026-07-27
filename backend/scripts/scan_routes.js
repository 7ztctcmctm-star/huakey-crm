const fs = require('fs');
const path = require('path');

const routesDir = path.resolve(__dirname, '../routes');
const results = [];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const file = path.relative(routesDir, full).replace(/\\/g, '/');

      // 检测文件级或 router.use 级挂载的认证/权限中间件
      const fileHasAuth = /router\.use\s*\([^)]*authenticateToken/.test(content);
      const fileHasPerm = /router\.use\s*\([^)]*checkPermission/.test(content);

      // 匹配 router.METHOD('path', ...)
      const re = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)/g;
      let m;
      while ((m = re.exec(content))) {
        const [, method, p, middleware] = m;
        const hasAuth = fileHasAuth || /authenticateToken/.test(middleware);
        const hasPerm = fileHasPerm || /checkPermission/.test(middleware);

        // 跳过明确公开或已废弃的接口
        const isPublicAuth = file === 'auth.js';
        const isPublicSurvey = file === 'survey.js' && p === '/respond/:campaign_id';
        const isDeprecated = file === 'customer/quality.js';
        const isMetricsClient = file === 'metrics.js' && p === '/client';
        const isHealth = p === '/health';

        if (!hasAuth && !isPublicAuth && !isPublicSurvey && !isDeprecated && !isMetricsClient && !isHealth) {
          results.push({ file, method: method.toUpperCase(), path: p, hasAuth, hasPerm, note: '' });
        }
      }
    }
  }
}

scan(routesDir);
console.log(`发现 ${results.length} 条缺少认证的非公开路由：`);
console.table(results);
