#!/usr/bin/env node
// 完整启动 app.js 后再查 registry
require('/app/app');
const registry = require('/app/core/ModuleRegistry');
const routes = registry.getAllRoutes();
console.log('Total registered:', routes.length);
routes.forEach(r => {
  const stack = r.router && r.router.stack ? r.router.stack : [];
  const subs = stack.filter(l => l.route).map(l => {
    const m = Object.keys(l.route.methods).join(',').toUpperCase();
    return m + ' ' + l.route.path;
  });
  console.log('  ' + r.prefix.padEnd(20) + ' [' + subs.length + ' routes]');
});
process.exit(0);
