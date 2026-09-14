const registry = require('../../core/ModuleRegistry');
const router = require('./index');

const descriptor = {
  routes: router,
  permissions: [
    // [权限对齐 2026-09-14] 原含 'customer:list'，已全量替换为 'customer:view'
    // （迁移 098 已保证 customer:list 持有者自动获得 customer:view；前端路由/菜单本就用 customer:view）
    'customer:view',
    'customer:add',
    'customer:edit',
    'customer:delete',
    'customer:assign',
    'customer:import',
    'customer:release',
    'pool:view',
    'pool:claim'
  ]
};

registry.register('customer', descriptor);
module.exports = descriptor;
