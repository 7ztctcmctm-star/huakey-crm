#!/usr/bin/env node
const app = require('/app/app');

// 遍历 app._router.stack 找 apiRouter layer
function findApiRouter(stack) {
  for (const layer of stack) {
    if (layer.name === 'router' && layer.handle && layer.handle.stack && layer.regex && layer.regex.source.includes('api')) {
      return layer;
    }
    if (layer.handle && layer.handle.stack) {
      const found = findApiRouter(layer.handle.stack);
      if (found) return found;
    }
  }
  return null;
}

const apiRouterLayer = findApiRouter(app._router.stack);
if (!apiRouterLayer) { console.log('NO API ROUTER'); process.exit(1); }

// 打印 apiRouter 所有子 router 及它们的路径
function printApiRoutes(layer, prefix='') {
  if (layer.route) {
    const m = Object.keys(layer.route.methods).join(',').toUpperCase();
    console.log(m.padEnd(7) + ' /api/v1' + prefix + (layer.route.path === '/' ? '' : layer.route.path));
  } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
    // 这个 layer 的 path（可能是 regex source）
    let myPrefix = '';
    if (layer.regex && layer.regex.source) {
      // 简单提取：看 route 里的定义
    }
    printApiRoutesInRouter(layer.handle.stack, prefix);
  }
}

function printApiRoutesInRouter(stack, parentPrefix='') {
  for (const layer of stack) {
    if (layer.route) {
      const m = Object.keys(layer.route.methods).join(',').toUpperCase();
      const fullPath = parentPrefix + (layer.route.path === '/' ? '' : layer.route.path);
      console.log(m.padEnd(7) + ' /api/v1' + fullPath);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // ModuleRegistry 注册的 router：路径 = prefix
      // ModuleRegistry 把 prefix 存在哪？
      printApiRoutesInRouter(layer.handle.stack, parentPrefix);
    } else if (layer.name === 'bound dispatch' && layer.route) {
      // 直接挂的 route
    }
  }
}

printApiRoutesInRouter(apiRouterLayer.handle.stack);
process.exit(0);
