const registry = require('../../core/ModuleRegistry');
const router = require('../product');

const descriptor = {
  routes: router,
  permissions: [
    'product',
    'product:add',
    'product:edit',
    'product:delete'
  ]
};

registry.register('product', descriptor);
module.exports = descriptor;
