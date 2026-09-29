#!/usr/bin/env node
// 打印 app.js 注册的所有路由路径
const app = require('/app/app');
function printStack(stack, prefix='') {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(methods.padEnd(7) + ' ' + (prefix + layer.route.path));
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      printStack(layer.handle.stack, prefix + (layer.regex && layer.regex.source ? '' : ''));
    }
  }
}
printStack(app._router.stack);
process.exit(0);
