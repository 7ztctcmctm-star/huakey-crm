const registry = require('../../core/ModuleRegistry');
const router = require('./index');

const descriptor = {
  routes: router,
  permissions: [
    'customer:list',
    'customer:add',
    'customer:edit',
    'customer:delete',
    'customer:view',
    'customer:assign',
    'customer:import',
    'customer:pool',
    'data_quality:check'
  ]
};

registry.register('customer', descriptor);
module.exports = descriptor;
