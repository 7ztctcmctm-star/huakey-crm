#!/usr/bin/env node
const registry = require('/app/core/ModuleRegistry');
const routes = registry.getAllRoutes();
routes.forEach((r, i) => {
  const methods = [];
  if (r.router && r.router.stack) {
    r.router.stack.forEach(l => {
      if (l.route) methods.push(...Object.keys(l.route.methods));
    });
  }
  console.log((i+1).toString().padStart(2) + '. ' + r.prefix.padEnd(25) + ' methods: ' + [...new Set(methods)].join(','));
});
console.log('\nTotal:', routes.length);
process.exit(0);
